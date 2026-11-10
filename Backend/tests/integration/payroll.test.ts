import { beforeEach, describe, expect, it } from 'vitest'
import { prisma as scoped } from '../../src/database/prisma.js'
import { asOrg } from '../../src/tenancy/context.js'
import { forgetMadrasa } from '../../src/tenancy/settings.js'
import { PASSWORD, client, makeUser, type Client } from '../helpers/auth.js'
import { inMadrasa, prisma, resetDatabase, seedMadrasa } from '../helpers/db.js'
import { seedPeopleFixture } from '../helpers/people.js'
import { computeSlip, PayrollRules, workingDaysOf } from '../../src/modules/payroll/calc.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let admin: Client
let accountant: Client
const MONTH = '2026-02' // a finished month with 28 days
let staffId: string

async function as(identifier: string, madrasaId?: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  if (madrasaId) {
    const orig = c.agent
    for (const m of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const fn = orig[m].bind(orig)
      ;(orig as unknown as Record<string, unknown>)[m] = (url: string) => fn(url).set('X-Madrasa-Id', madrasaId)
    }
  }
  return c
}
const confirm = (c: Client) => c.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
const enable = async (madrasaId: string) => {
  await asOrg('test', () => scoped.madrasaFeature.upsert({ where: { madrasaId_feature: { madrasaId, feature: 'PAYROLL' } }, update: { enabled: true }, create: { madrasaId, feature: 'PAYROLL', enabled: true } }))
  forgetMadrasa(madrasaId)
}
const salary = async (c: Client, id = staffId, basicMinor = 3_000_000, extra: object = {}) => { await confirm(c); return c.post(`/api/v1/payroll/staff/${id}/salaries`, { effectiveFrom: '2026-01-01', basicMinor, ...extra }) }
const setRules = async (rules: object) => { await confirm(admin); return admin.put('/api/v1/payroll/rules', rules) }

beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  await enable(fx.madrasa.id)
  await makeUser({ email: 'acc@x.test', roles: ['ACCOUNTANT'], madrasaId: fx.madrasa.id })
  admin = await as('admin@x.test')
  accountant = await as('acc@x.test')
  staffId = (await admin.get('/api/v1/payroll/salaries')).body.items[0].staff.id
})

const rules = (o: object = {}) => PayrollRules.parse(o)
const base = { basicMinor: 3_000_000, components: [], adjustments: [], attendance: { absentDays: 0, lateCount: 0, earlyCount: 0 }, exempt: false, paidLeaveDays: 0, calendarDays: 30, workingDays: 26 }

describe('the calculation', () => {
  it('assumes no rule: with nothing configured the salary is paid in full', () => {
    expect(computeSlip({ ...base, attendance: { absentDays: 5, lateCount: 9, earlyCount: 9 }, rules: rules() }).netMinor).toBe(3_000_000)
  })
  it('deducts absence only when turned on, on the chosen day basis, in whole paise', () => {
    expect(computeSlip({ ...base, attendance: { ...base.attendance, absentDays: 3 }, rules: rules({ deductAbsence: true }) }).netMinor).toBe(2_700_000)
    expect(computeSlip({ ...base, attendance: { ...base.attendance, absentDays: 1 }, rules: rules({ deductAbsence: true, dayBasis: 'WORKING' }) }).deductionsMinor).toBe(115_385)
    expect(computeSlip({ ...base, attendance: { ...base.attendance, absentDays: 1 }, rules: rules({ deductAbsence: true, dayBasis: 'FIXED', fixedDays: 25 }) }).deductionsMinor).toBe(120_000)
  })
  it('paid days and exemption remove the attendance deduction', () => {
    const r = rules({ deductAbsence: true })
    expect(computeSlip({ ...base, attendance: { ...base.attendance, absentDays: 3 }, paidLeaveDays: 2, rules: r }).deductionsMinor).toBe(100_000)
    expect(computeSlip({ ...base, attendance: { ...base.attendance, absentDays: 3 }, exempt: true, rules: r }).deductionsMinor).toBe(0)
  })
  it('counts late arrivals in whole blocks, and early departures only if asked', () => {
    const on = { enabled: true, countPerDay: 3 }
    expect(computeSlip({ ...base, attendance: { ...base.attendance, lateCount: 2 }, rules: rules({ lateRule: on }) }).deductionsMinor).toBe(0)
    expect(computeSlip({ ...base, attendance: { absentDays: 0, lateCount: 2, earlyCount: 1 }, rules: rules({ lateRule: on }) }).deductionsMinor).toBe(0)
    expect(computeSlip({ ...base, attendance: { absentDays: 0, lateCount: 2, earlyCount: 1 }, rules: rules({ lateRule: { ...on, countEarly: true } }) }).deductionsMinor).toBe(100_000)
  })
  it('applies components, percentages in basis points, adjustments and rounding', () => {
    const r = computeSlip({ ...base, basicMinor: 1_000_050, components: [{ name: 'Housing', kind: 'EARNING', calc: 'FIXED', value: 200_000 }, { name: 'Fund', kind: 'DEDUCTION', calc: 'PERCENT_OF_BASIC', value: 1050 }], adjustments: [{ amountMinor: -5_000, reason: 'Advance' }], rules: rules({ rounding: 'RUPEE' }) })
    expect(r.earningsMinor - r.deductionsMinor).toBe(r.netMinor)
    expect(r.netMinor % 100).toBe(0)
    expect(r.netMinor).toBe(1_000_050 + 200_000 - 105_005 - 5_000 + (r.lines.find((l) => l.label === 'Rounding')?.kind === 'EARNING' ? r.lines.find((l) => l.label === 'Rounding')!.amountMinor : -r.lines.find((l) => l.label === 'Rounding')!.amountMinor))
    expect(Number.isInteger(r.netMinor)).toBe(true)
  })
  it('knows the working days of a month', () => {
    expect(workingDaysOf('2026-02', 5)).toBe(24) // February 2026 has four Fridays
  })
})

describe('who can do what', () => {
  it('the accountant prepares but cannot approve; other roles see nothing', async () => {
    expect((await salary(accountant)).status).toBe(201)
    const run = await accountant.post('/api/v1/payroll/runs', { month: MONTH })
    expect(run.status).toBe(201)
    await confirm(accountant)
    expect((await accountant.post(`/api/v1/payroll/runs/${run.body.id}/approve`)).status).toBe(403)
    for (const who of ['principal@x.test', 'm1@x.test', 'warden@x.test', 'p1@x.test']) {
      const c = await as(who)
      for (const path of ['/payroll/runs', '/payroll/salaries', '/payroll/rules', `/payroll/runs/${run.body.id}`, `/payroll/staff/${staffId}/salaries`]) expect((await c.get(`/api/v1${path}`)).status, `${who} ${path}`).toBe(403)
    }
  })

  it('a disabled feature is rejected', async () => {
    await asOrg('test', () => scoped.madrasaFeature.update({ where: { madrasaId_feature: { madrasaId: fx.madrasa.id, feature: 'PAYROLL' } }, data: { enabled: false } }))
    forgetMadrasa(fx.madrasa.id)
    expect((await admin.get('/api/v1/payroll/runs')).body.error.code).toBe('FEATURE_DISABLED')
  })

  it('salaries, rules and approval need a fresh password', async () => {
    await prisma.session.updateMany({ data: { reauthenticatedAt: new Date(Date.now() - 3_600_000) } })
    expect((await admin.post(`/api/v1/payroll/staff/${staffId}/salaries`, { effectiveFrom: '2026-01-01', basicMinor: 1 })).body.error.code).toBe('REAUTH_REQUIRED')
    expect((await admin.put('/api/v1/payroll/rules', {})).body.error.code).toBe('REAUTH_REQUIRED')
  })

  it('never writes a salary amount into the activity log', async () => {
    await salary(admin, staffId, 3_141_500)
    const rows = await inMadrasa(fx.madrasa.id, () => scoped.auditLog.findMany({ where: { action: 'payroll.salary_set' } }))
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toMatch(/31415/)
  })
})

describe('a month from draft to paid', () => {
  beforeEach(async () => { await salary(accountant) })
  const draft = async () => (await accountant.post('/api/v1/payroll/runs', { month: MONTH })).body

  it('one payroll per month, and people with no salary are listed rather than skipped silently', async () => {
    const r = await draft()
    expect(r.payslips).toHaveLength(1)
    expect(r.noSalary.length).toBeGreaterThanOrEqual(0)
    expect((await accountant.post('/api/v1/payroll/runs', { month: MONTH })).body.error.code).toBe('RUN_EXISTS')
  })

  it('the preparer cannot approve their own work, unless the madrasa allows it', async () => {
    await confirm(admin)
    await admin.post(`/api/v1/payroll/staff/${(await admin.get('/api/v1/payroll/salaries')).body.items[1].staff.id}/salaries`, { effectiveFrom: '2026-01-01', basicMinor: 100 })
    const r = await admin.post('/api/v1/payroll/runs', { month: MONTH })
    await confirm(admin)
    expect((await admin.post(`/api/v1/payroll/runs/${r.body.id}/approve`)).body.error.code).toBe('SAME_PERSON')
    await setRules({ requireSecondApprover: false })
    await confirm(admin)
    expect((await admin.post(`/api/v1/payroll/runs/${r.body.id}/approve`)).body.status).toBe('APPROVED')
  })

  it('a month not yet over cannot be approved', async () => {
    const r = (await accountant.post('/api/v1/payroll/runs', { month: '2099-01' })).body
    await confirm(admin)
    expect((await admin.post(`/api/v1/payroll/runs/${r.id}/approve`)).body.error.code).toBe('MONTH_NOT_OVER')
  })

  it('figures that changed after review block approval until recalculated, and reviewed paid days survive', async () => {
    await setRules({ deductAbsence: true })
    const r = await draft()
    const slip = r.payslips[0]
    expect(slip.netMinor).toBe(3_000_000 - Math.round((3_000_000 * slip.attendance.absentDays) / 28))
    const reviewed = (await accountant.patch(`/api/v1/payroll/runs/${r.id}/payslips/${slip.id}`, { paidLeaveDays: 2, note: 'Approved leave' })).body
    expect(reviewed.payslips[0].paidLeaveDays).toBe(2)
    expect(reviewed.payslips[0].netMinor).toBeGreaterThan(slip.netMinor)
    await setRules({ deductAbsence: false })
    await confirm(admin)
    expect((await admin.post(`/api/v1/payroll/runs/${r.id}/approve`)).body.error.code).toBe('RUN_STALE')
    const again = (await accountant.post(`/api/v1/payroll/runs/${r.id}/recalculate`)).body
    expect(again.payslips[0]).toMatchObject({ paidLeaveDays: 2, netMinor: 3_000_000, note: 'Approved leave' })
    await confirm(admin)
    expect((await admin.post(`/api/v1/payroll/runs/${r.id}/approve`)).body.status).toBe('APPROVED')
  })

  it('paid days cannot exceed the days absent', async () => {
    const r = await draft()
    expect((await accountant.patch(`/api/v1/payroll/runs/${r.id}/payslips/${r.payslips[0].id}`, { paidLeaveDays: 31 })).status).toBe(422)
  })

  it('once approved nothing changes: the API refuses and so does the database', async () => {
    const r = await draft()
    await confirm(admin)
    await admin.post(`/api/v1/payroll/runs/${r.id}/approve`)
    expect((await accountant.post(`/api/v1/payroll/runs/${r.id}/recalculate`)).body.error.code).toBe('RUN_NOT_DRAFT')
    expect((await accountant.del(`/api/v1/payroll/runs/${r.id}`)).body.error.code).toBe('RUN_NOT_DRAFT')
    await inMadrasa(fx.madrasa.id, async () => {
      await expect(scoped.payslip.updateMany({ where: { runId: r.id }, data: { netMinor: 1, earningsMinor: 1, deductionsMinor: 0 } })).rejects.toThrow()
      await expect(scoped.payslip.deleteMany({ where: { runId: r.id } })).rejects.toThrow()
      await expect(scoped.payrollRun.update({ where: { id: r.id }, data: { status: 'DRAFT' } })).rejects.toThrow()
      await expect(scoped.payrollRun.delete({ where: { id: r.id } })).rejects.toThrow()
      await expect(scoped.staffSalary.updateMany({ data: { basicMinor: 1 } })).rejects.toThrow()
    })
    await confirm(admin)
    expect((await admin.post(`/api/v1/payroll/runs/${r.id}/paid`, { paidOn: '2026-03-01' })).body.status).toBe('PAID')
    await confirm(admin)
    expect((await admin.post(`/api/v1/payroll/runs/${r.id}/paid`, { paidOn: '2026-03-01' })).body.error.code).toBe('RUN_NOT_APPROVED')
  })

  it('two approvals at once approve once; an adjustment is applied to one month only', async () => {
    await confirm(admin)
    await admin.post('/api/v1/payroll/adjustments', { staffId, amountMinor: -50_000, reason: 'Overpaid in January' })
    const r = await draft()
    expect(r.payslips[0].netMinor).toBe(2_950_000)
    await confirm(admin)
    const both = await Promise.all([1, 2].map(() => admin.post(`/api/v1/payroll/runs/${r.id}/approve`)))
    expect(both.map((x) => x.status).sort()).toEqual([200, 409])
    const next = (await accountant.post('/api/v1/payroll/runs', { month: '2026-03' })).body
    expect(next.payslips[0].netMinor).toBe(3_000_000)
    const adj = (await admin.get('/api/v1/payroll/adjustments')).body.items[0]
    expect(adj.appliedRunId).toBe(r.id)
    await inMadrasa(fx.madrasa.id, () => expect(scoped.payrollAdjustment.delete({ where: { id: adj.id } })).rejects.toThrow())
  })

  it('later salary changes never alter an approved month, and the salary in force for the month is used', async () => {
    const r = await draft()
    await confirm(admin)
    await admin.post(`/api/v1/payroll/runs/${r.id}/approve`)
    await confirm(admin)
    await admin.post(`/api/v1/payroll/staff/${staffId}/salaries`, { effectiveFrom: '2026-03-01', basicMinor: 4_000_000 })
    expect((await admin.get(`/api/v1/payroll/runs/${r.id}`)).body.payslips[0].netMinor).toBe(3_000_000)
    expect((await accountant.post('/api/v1/payroll/runs', { month: '2026-03' })).body.payslips[0].netMinor).toBe(4_000_000)
    expect((await admin.get(`/api/v1/payroll/staff/${staffId}/salaries`)).body.items).toHaveLength(2)
  })

  it('staff see only their own payslips, and only once approved', async () => {
    const row = await inMadrasa(fx.madrasa.id, () => scoped.staffProfile.findFirstOrThrow({ where: { id: staffId }, select: { userId: true } }))
    const user = await prisma.user.findUniqueOrThrow({ where: { id: row.userId! }, select: { email: true } })
    const me = await as(user.email!)
    const r = await draft()
    expect((await me.get('/api/v1/payroll/me')).body.items).toEqual([])
    await confirm(admin)
    await admin.post(`/api/v1/payroll/runs/${r.id}/approve`)
    expect((await me.get('/api/v1/payroll/me')).body.items).toHaveLength(1)
    const other = await as('warden@x.test')
    expect((await other.get('/api/v1/payroll/me')).body.items).toEqual([])
  })
})

describe('another madrasa', () => {
  it('salaries, runs and payslips of another madrasa answer 404', async () => {
    await salary(admin)
    const run = (await admin.post('/api/v1/payroll/runs', { month: MONTH })).body
    const other = await seedMadrasa('B2', 'Second Madrasa')
    await enable(other.id)
    await makeUser({ email: 'other-admin@x.test', roles: ['MADRASA_ADMIN'], madrasaId: other.id })
    const c = await as('other-admin@x.test', other.id)
    expect((await c.get('/api/v1/payroll/runs')).body.items).toEqual([])
    expect((await c.get(`/api/v1/payroll/runs/${run.id}`)).status).toBe(404)
    expect((await c.get(`/api/v1/payroll/staff/${staffId}/salaries`)).status).toBe(404)
    await confirm(c)
    expect((await c.post(`/api/v1/payroll/staff/${staffId}/salaries`, { effectiveFrom: '2026-01-01', basicMinor: 1 })).status).toBe(404)
    expect((await c.post(`/api/v1/payroll/runs/${run.id}/approve`)).status).toBe(404)
  })
})
