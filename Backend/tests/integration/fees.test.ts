import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../helpers/db.js'
import { institutionToday } from '../../src/common/clock.js'
import { fiscalYearOf, discountFor, issueInvoices } from '../../src/modules/fees/fees.service.js'
import { inMadrasa, resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let admin: Client
let today: string
let period: string
beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  today = await inMadrasa(fx.madrasa.id, () => institutionToday())
  period = today.slice(0, 7)
  admin = await as('admin@x.test')
})
async function as(identifier: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  return c
}
const balanceOf = async (c: Client, ref: string) => (await c.get(`/api/v1/fees/students/${ref}`)).body.totals.balanceMinor as number
const prevPeriod = () => { const d = new Date(`${period}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) }

describe('invoicing', () => {
  it('issues one invoice per student per period with the concession applied, idempotently', async () => {
    const r = await admin.post('/api/v1/fees/invoices/issue', { period })
    expect(r.body.created).toBe(3)
    expect((await admin.post('/api/v1/fees/invoices/issue', { period })).body.created).toBe(0)
    const ali = (await admin.get('/api/v1/fees/students/S-1')).body.invoices[0]
    expect(ali).toMatchObject({ grossMinor: 150000, discountMinor: 15000, amountMinor: 135000, balanceMinor: 135000 }) // 10% sibling
  })

  it('rounds concessions to the nearest 10 rupees and skips full sponsorship', () => {
    expect(discountFor(80000, 10)).toBe(8000)
    expect(discountFor(150000, 33)).toBe(50000)
    expect(discountFor(150000, 100)).toBe(150000)
  })

  it('changing a fee plan never alters issued invoices', async () => {
    await admin.post('/api/v1/fees/invoices/issue', { period })
    await prisma.feePlan.update({ where: { id: fx.plan.id }, data: { amountMinor: 999900 } })
    expect((await admin.get('/api/v1/fees/students/S-2')).body.invoices[0].amountMinor).toBe(150000)
    const inv = await prisma.invoice.findFirstOrThrow()
    await expect(prisma.invoice.update({ where: { id: inv.id }, data: { amountMinor: 1 } })).rejects.toThrow()
  })

  it('bills students admitted on the last days of a month for that month', async () => {
    const late = await prisma.student.create({ data: { admissionNo: 'S-31', name: 'Late Admission', gender: 'MALE', dob: new Date('2013-01-01T00:00:00Z'), admissionDate: new Date('2026-01-31T00:00:00Z'), groupId: fx.groups.gA.id, phone: '+91 90000 00009', feePlanId: fx.plan.id } })
    expect((await inMadrasa(fx.madrasa.id, () => issueInvoices(null, '2026-01', late.id))).created).toBe(1)
    expect((await inMadrasa(fx.madrasa.id, () => issueInvoices(null, '2025-12', late.id))).created).toBe(0)
  })

  it('uses the April–March financial year for receipt numbers', () => {
    expect(fiscalYearOf('2026-03-31')).toBe(2025)
    expect(fiscalYearOf('2026-04-01')).toBe(2026)
  })
})

describe('office payments', () => {
  beforeEach(async () => {
    await admin.post('/api/v1/fees/invoices/issue', { period: prevPeriod() })
    await admin.post('/api/v1/fees/invoices/issue', { period })
  })

  it('applies money to the oldest invoice first and issues gapless receipts', async () => {
    const r1 = await admin.post('/api/v1/fees/payments', { studentId: fx.students.bilal.id, amountMinor: 200000, method: 'CASH' })
    expect(r1.status).toBe(201)
    expect(r1.body.allocations.map((a: { period: string; amountMinor: number }) => [a.period, a.amountMinor])).toEqual([[prevPeriod(), 150000], [period, 50000]])
    const r2 = await admin.post('/api/v1/fees/payments', { studentId: fx.students.bilal.id, amountMinor: 100000, method: 'UPI' })
    const fy = fiscalYearOf(today)
    expect([r1.body.receiptNo, r2.body.receiptNo]).toEqual([`NR-${fy}-0001`, `NR-${fy}-0002`])
    expect(await balanceOf(admin, 'S-2')).toBe(0)
  })

  it('pays the oldest period first even when a late-issued invoice is due after a newer one', async () => {
    const inv = (number: string, p: string, due: string) => ({ number, studentId: fx.students.ali.id, period: p, planId: fx.plan.id, currency: 'INR', grossMinor: 10000, discountMinor: 0, amountMinor: 10000, issuedOn: new Date('2020-01-01'), dueDate: new Date(due) })
    await prisma.invoice.create({ data: inv('OLD', '2020-01', '2020-03-20') })
    await prisma.invoice.create({ data: inv('NEW', '2020-02', '2020-03-10') })
    const r = await admin.post('/api/v1/fees/payments', { studentId: fx.students.ali.id, amountMinor: 10000, method: 'CASH' })
    expect(r.body.allocations.map((a: { period: string }) => a.period)).toEqual(['2020-01'])
  })

  it('refuses overpayment and never double-allocates under concurrent payments', async () => {
    expect((await admin.post('/api/v1/fees/payments', { studentId: fx.students.bilal.id, amountMinor: 300001, method: 'CASH' })).body.error.code).toBe('OVERPAYMENT')
    const [a, b] = await Promise.all([
      admin.post('/api/v1/fees/payments', { studentId: fx.students.bilal.id, amountMinor: 300000, method: 'CASH' }),
      admin.post('/api/v1/fees/payments', { studentId: fx.students.bilal.id, amountMinor: 300000, method: 'CASH' }),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    expect(await prisma.payment.count()).toBe(1)
  })

  it('confirmed payments and receipts cannot be edited or deleted', async () => {
    await admin.post('/api/v1/fees/payments', { studentId: fx.students.bilal.id, amountMinor: 1000, method: 'CASH' })
    const p = await prisma.payment.findFirstOrThrow()
    await expect(prisma.payment.update({ where: { id: p.id }, data: { amountMinor: 999999 } })).rejects.toThrow()
    await expect(prisma.payment.delete({ where: { id: p.id } })).rejects.toThrow()
    await expect(prisma.receipt.update({ where: { id: p.receiptId }, data: { number: 'X' } })).rejects.toThrow()
  })

  it('adjustments need re-authentication, cannot exceed the balance, and reduce it', async () => {
    const inv = (await admin.get('/api/v1/fees/students/S-2')).body.invoices[0]
    await prisma.session.updateMany({ data: { reauthenticatedAt: new Date(Date.now() - 10 * 60_000) } })
    expect((await admin.post(`/api/v1/fees/invoices/${inv.id}/adjustments`, { amountMinor: 1000, kind: 'WAIVER', reason: 'Hardship approved' })).body.error.code).toBe('REAUTH_REQUIRED')
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    expect((await admin.post(`/api/v1/fees/invoices/${inv.id}/adjustments`, { amountMinor: 150001, kind: 'WAIVER', reason: 'Hardship approved' })).body.error.code).toBe('ADJUSTMENT_TOO_LARGE')
    const r = await admin.post(`/api/v1/fees/invoices/${inv.id}/adjustments`, { amountMinor: 50000, kind: 'WAIVER', reason: 'Hardship approved' })
    expect(r.body).toMatchObject({ adjustedMinor: 50000, balanceMinor: 100000 })
  })

  it('refunds give the balance back and cannot exceed the payment', async () => {
    const p = (await admin.post('/api/v1/fees/payments', { studentId: fx.students.bilal.id, amountMinor: 150000, method: 'CASH' })).body
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    expect((await admin.post(`/api/v1/fees/payments/${p.id}/refunds`, { amountMinor: 150001, reason: 'Paid twice by mistake' })).body.error.code).toBe('REFUND_TOO_LARGE')
    expect((await admin.post(`/api/v1/fees/payments/${p.id}/refunds`, { amountMinor: 50000, reason: 'Paid twice by mistake' })).body.status).toBe('COMPLETED')
    expect(await balanceOf(admin, 'S-2')).toBe(300000 - 150000 + 50000)
  })

  it('concurrent refunds can never add up to more than the payment', async () => {
    const p = (await admin.post('/api/v1/fees/payments', { studentId: fx.students.bilal.id, amountMinor: 40000, method: 'CASH' })).body
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    const rs = await Promise.all([1, 2, 3].map(() => admin.post(`/api/v1/fees/payments/${p.id}/refunds`, { amountMinor: 30000, reason: 'Concurrent refund' })))
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409, 409])
    const refunded = await prisma.refund.aggregate({ where: { paymentId: p.id }, _sum: { amountMinor: true } })
    expect(refunded._sum.amountMinor).toBe(30000)
  })

  it('voids only invoices with no activity', async () => {
    const [prev] = (await admin.get('/api/v1/fees/students/S-2')).body.invoices.slice(-1)
    await admin.post('/api/v1/fees/payments', { studentId: fx.students.bilal.id, amountMinor: 1000, method: 'CASH' })
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    expect((await admin.post(`/api/v1/fees/invoices/${prev.id}/void`, { reason: 'Issued by mistake' })).body.error.code).toBe('INVOICE_HAS_ACTIVITY')
  })
})

describe('who can see and record fees', () => {
  beforeEach(async () => { await admin.post('/api/v1/fees/invoices/issue', { period }) })

  it('guardians see only their own children; mentors and wardens see nothing', async () => {
    const p = await as('p1@x.test')
    expect((await p.get('/api/v1/fees')).body.invoices.map((i: { admissionNo: string }) => i.admissionNo).sort()).toEqual(['S-1', 'S-3'])
    expect((await p.get('/api/v1/fees/students/S-2')).status).toBe(404)
    for (const who of ['m1@x.test', 'warden@x.test']) expect((await (await as(who)).get('/api/v1/fees')).body.invoices).toEqual([])
  })

  it('a guardian without fee access sees nothing for that child', async () => {
    await prisma.studentGuardian.updateMany({ where: { guardianId: fx.guardians.p1.id, studentId: fx.students.sara.id }, data: { canViewFees: false } })
    const p = await as('p1@x.test')
    expect((await p.get('/api/v1/fees/students/S-3')).status).toBe(404)
  })

  it('the Principal reads fees but cannot record or change them', async () => {
    const pr = await as('principal@x.test')
    expect((await pr.get('/api/v1/fees')).body.invoices).toHaveLength(3)
    expect((await pr.post('/api/v1/fees/payments', { studentId: fx.students.ali.id, amountMinor: 100, method: 'CASH' })).status).toBe(403)
  })
})
