import { beforeEach, describe, expect, it } from 'vitest'
import { institutionToday } from '../../src/common/clock.js'
import { prisma as scoped } from '../../src/database/prisma.js'
import { ScopeError } from '../../src/tenancy/scope.js'
import { asOrg, withMadrasa } from '../../src/tenancy/context.js'
import { PASSWORD, client, makeUser, type Client } from '../helpers/auth.js'
import { inMadrasa, prisma, resetDatabase, seedMadrasa } from '../helpers/db.js'
import { seedPeopleFixture } from '../helpers/people.js'

// CR-01 §1 and §12: a user of madrasa A can never read or write a record of madrasa B,
// whatever ids or madrasa selection they send. The answer is 404, not 403.

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let B: Awaited<ReturnType<typeof seedB>>
let adminA: Client
let today: string

async function as(identifier: string, madrasaId?: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  if (madrasaId) {
    // Every later request carries the chosen madrasa, like the web app does.
    const orig = c.agent
    for (const m of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const fn = orig[m].bind(orig)
      ;(orig as unknown as Record<string, unknown>)[m] = (url: string) => fn(url).set('X-Madrasa-Id', madrasaId)
    }
  }
  return c
}

/** Madrasa B with a halqa, staff, a family, a student, an invoice, a payment, an exam, a lesson, a hostel bed and a reported payment. */
async function seedB() {
  const m = await seedMadrasa('B2', 'Second Madrasa')
  const admin = await makeUser({ email: 'adminb@x.test', roles: ['MADRASA_ADMIN'], madrasaId: m.id })
  const parentB = await makeUser({ email: 'pb@x.test', roles: ['PARENT'], madrasaId: m.id })
  return inMadrasa(m.id, async () => {
    const plan = await scoped.feePlan.create({ data: { code: 'fp', name: 'B plan', amountMinor: 100000, currency: 'INR' } })
    const staff = await scoped.staffProfile.create({ data: { code: 'm1', displayName: 'B Mentor', title: 'Hifz Mentor' } })
    const group = await scoped.group.create({ data: { code: 'g-a', name: 'B Halqa', short: 'B', track: 'HIFZ', gender: 'BOYS' } })
    await scoped.groupMentorAssignment.create({ data: { groupId: group.id, staffId: staff.id } })
    const guardian = await scoped.guardian.create({ data: { code: 'pb', name: 'B Parent', relation: 'Father', phone: '+91 90000 77777', userId: parentB.id } })
    const student = await scoped.student.create({ data: { admissionNo: 'S-1', name: 'B Student', gender: 'MALE', dob: new Date('2013-01-01'), admissionDate: new Date('2024-04-01'), groupId: group.id, phone: '+91 90000 77778', feePlanId: plan.id, hostelResident: true, guardians: { create: { guardianId: guardian.id, isPrimary: true } }, enrollments: { create: { groupId: group.id, startedOn: new Date('2024-04-01') } } } })
    const invoice = await scoped.invoice.create({ data: { number: 'INV-B-1', studentId: student.id, period: '2026-10', planId: plan.id, currency: 'INR', grossMinor: 100000, discountMinor: 0, amountMinor: 100000, issuedOn: new Date('2026-10-01'), dueDate: new Date('2026-10-10') } })
    const receipt = await scoped.receipt.create({ data: { number: 'NR-B-1' } })
    const payment = await scoped.payment.create({ data: { studentId: student.id, receiptId: receipt.id, amountMinor: 1000, currency: 'INR', method: 'CASH', source: 'MANUAL', receivedOn: new Date('2026-10-02'), allocations: { create: [{ invoiceId: invoice.id, amountMinor: 1000 }] } } })
    const exam = await scoped.exam.create({ data: { code: 'EX-B', title: 'B Test', type: 'Monthly Test', track: 'HIFZ', date: new Date('2026-10-01'), groups: { create: [{ groupId: group.id }] }, subjects: { create: [{ name: 'Hifz', maxMarks: 100, position: 0 }] } } })
    const lesson = await scoped.learningRecord.create({ data: { studentId: student.id, date: new Date('2026-10-01'), category: 'SABAQ', surah: 1, fromAyah: 1, toAyah: 7, performance: 4, mistakes: 1, fluency: 4, tajweed: 'GOOD', prevRevision: 'DONE', targetStatus: 'MET', comments: '', nextTarget: 'Next' } })
    const room = await scoped.hostelRoom.create({ data: { code: 'R1', block: 'B', floor: 'G', beds: { create: [{ label: 'Bed A' }] } }, include: { beds: true } })
    const sub = await scoped.manualPaymentSubmission.create({ data: { studentId: student.id, submittedById: parentB.id, method: 'BANK_TRANSFER', amountMinor: 5000, currency: 'INR', paidOn: new Date('2026-10-03'), reference: 'BREF000001', referenceKey: 'BREF000001' } })
    return { madrasa: m, admin, parentB, plan, staff, group, guardian, student, invoice, payment, exam, lesson, bed: room.beds[0]!, sub }
  })
}

beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  B = await seedB()
  today = await inMadrasa(fx.madrasa.id, () => institutionToday())
  adminA = await as('admin@x.test')
})

describe('madrasa isolation (A cannot reach B)', () => {
  it('every read of a B record by id answers 404', async () => {
    const urls = [
      `/api/v1/students/${B.student.id}`, `/api/v1/fees/students/${B.student.id}`, `/api/v1/report-cards/${B.student.id}`,
      `/api/v1/exams/${B.exam.code}/results`, `/api/v1/exams/${B.exam.id}/results`, `/api/v1/learning-records/${B.lesson.id}/revisions`,
      `/api/v1/attendance/${B.student.id}/${today}/corrections`, `/api/v1/payments/submissions/${B.sub.id}`, `/api/v1/payments/submissions/${B.sub.id}/proof`,
      `/api/v1/admin/users/${B.admin.id}`, `/api/v1/admin/users/${B.parentB.id}`, `/api/v1/payments/options?studentId=${B.student.id}`,
    ]
    for (const url of urls) expect((await adminA.get(url)).status, url).toBe(404)
  })

  it('every write aimed at a B record answers 404 and changes nothing', async () => {
    await adminA.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    const lesson = { studentId: B.student.id, date: today, category: 'SABAQ', performance: 4, mistakes: 0, fluency: 4, tajweed: 'GOOD', prevRevision: 'DONE', targetStatus: 'MET', comments: '', nextTarget: 'x', followUp: false }
    const writes: [string, string, object][] = [
      ['patch', `/api/v1/students/${B.student.id}`, { name: 'Hijacked' }],
      ['post', `/api/v1/students/${B.student.id}/guardians`, { name: 'Intruder', relation: 'Uncle', phone: '+91 90000 11111' }],
      ['post', '/api/v1/fees/payments', { studentId: B.student.id, amountMinor: 1000, method: 'CASH' }],
      ['post', `/api/v1/fees/invoices/${B.invoice.id}/void`, { reason: 'Hijack attempt' }],
      ['post', `/api/v1/fees/invoices/${B.invoice.id}/adjustments`, { amountMinor: 100, kind: 'WAIVER', reason: 'Hijack attempt' }],
      ['post', `/api/v1/fees/payments/${B.payment.id}/refunds`, { amountMinor: 100, reason: 'Hijack attempt' }],
      ['put', `/api/v1/groups/${B.group.id}/mentor`, { staffId: fx.staff.m1.id }],
      ['put', `/api/v1/groups/${fx.groups.gA.id}/mentor`, { staffId: B.staff.id }],
      ['post', `/api/v1/hostel/beds/${B.bed.id}/assign`, { studentId: fx.students.ali.id }],
      ['post', `/api/v1/hostel/beds/${B.bed.id}/release`, { reason: 'Hijack attempt' }],
      ['post', '/api/v1/learning-records', lesson],
      ['patch', `/api/v1/learning-records/${B.lesson.id}`, { comments: 'Hijacked', reason: 'Hijack' }],
      ['post', '/api/v1/attendance', { groupId: B.group.id, date: today, records: [{ studentId: B.student.id, status: 'ABSENT' }] }],
      ['post', `/api/v1/payments/submissions/${B.sub.id}/approve`, {}],
      ['post', `/api/v1/payments/submissions/${B.sub.id}/reject`, { reason: 'Hijack attempt' }],
      ['put', `/api/v1/exams/${B.exam.code}/results`, { entries: [{ studentId: B.student.id, marks: {} }] }],
      ['post', `/api/v1/exams/${B.exam.code}/publish`, {}],
      ['post', `/api/v1/reminders/invoices/${B.invoice.id}/send`, {}],
      ['post', `/api/v1/staff/${B.staff.id}/status`, { status: 'INACTIVE' }],
      ['put', `/api/v1/admin/users/${B.admin.id}/roles`, { roles: ['MENTOR'] }],
      ['post', `/api/v1/admin/users/${B.admin.id}/status`, { active: false }],
      ['post', `/api/v1/admin/users/${B.parentB.id}/mfa/reset`, { reason: 'Hijack attempt', method: 'IN_PERSON' }],
    ]
    for (const [method, url, body] of writes) {
      const r = await (adminA as unknown as Record<string, (u: string, b: object) => Promise<{ status: number }>>)[method === 'delete' ? 'del' : method]!(url, body)
      expect(r.status, `${method} ${url} → ${JSON.stringify((r as { body?: unknown }).body)}`).toBe(404)
    }
    await inMadrasa(B.madrasa.id, async () => {
      expect((await scoped.student.findUniqueOrThrow({ where: { id: B.student.id } })).name).toBe('B Student')
      expect((await scoped.invoice.findUniqueOrThrow({ where: { id: B.invoice.id } })).status).toBe('ISSUED')
      expect(await scoped.learningRecord.count()).toBe(1)
      expect((await scoped.manualPaymentSubmission.findUniqueOrThrow({ where: { id: B.sub.id } })).status).toBe('PENDING_VERIFICATION')
      expect(await scoped.attendanceRecord.count()).toBe(0)
      expect(await scoped.groupMentorAssignment.count({ where: { endedAt: null, staffId: B.staff.id } })).toBe(1)
    })
    expect((await asOrg('test', () => scoped.user.findUniqueOrThrow({ where: { id: B.admin.id } }))).status).toBe('ACTIVE')
  })

  it('lists never include B records', async () => {
    const lists: [string, (b: unknown) => string][] = [
      ['/api/v1/students', (b) => JSON.stringify(b)], ['/api/v1/groups', (b) => JSON.stringify(b)], ['/api/v1/staff', (b) => JSON.stringify(b)],
      ['/api/v1/guardians', (b) => JSON.stringify(b)], ['/api/v1/fees', (b) => JSON.stringify(b)], ['/api/v1/exams', (b) => JSON.stringify(b)],
      ['/api/v1/hostel', (b) => JSON.stringify(b)], ['/api/v1/payments/submissions', (b) => JSON.stringify(b)], ['/api/v1/admin/users', (b) => JSON.stringify(b)],
      ['/api/v1/learning-records', (b) => JSON.stringify(b)], ['/api/v1/fee-plans', (b) => JSON.stringify(b)],
    ]
    for (const [url, text] of lists) {
      const r = await adminA.get(url)
      expect(r.status, url).toBe(200)
      const body = text(r.body)
      for (const secret of [B.student.id, B.group.id, B.staff.id, B.guardian.id, B.exam.id, B.invoice.id, B.sub.id, B.admin.id, B.plan.id, 'B Student', 'B Halqa', 'B Parent']) expect(body, `${url} leaks ${secret}`).not.toContain(secret)
    }
  })

  it('choosing madrasa B with the header is refused with 404; a forged madrasaId in a body is ignored', async () => {
    for (const url of ['/api/v1/students', '/api/v1/settings', '/api/v1/auth/session']) {
      const r = await adminA.agent.get(url).set('X-Madrasa-Id', B.madrasa.id)
      expect(r.status, url).toBe(404)
    }
    expect((await adminA.agent.get('/api/v1/students').set('X-Madrasa-Id', '00000000-0000-4000-8000-000000000000')).status).toBe(404)
    // A madrasaId smuggled into a body never moves a record.
    const r = await adminA.patch(`/api/v1/students/${fx.students.ali.id}`, { name: 'Ali Updated', madrasaId: B.madrasa.id })
    expect(r.status).toBe(200)
    expect((await prisma.student.findUniqueOrThrow({ where: { id: fx.students.ali.id } })).madrasaId).toBe(fx.madrasa.id)
  })

  it('B’s own admin works normally in B and cannot reach A either', async () => {
    const adminB = await as('adminb@x.test')
    expect((await adminB.get(`/api/v1/students/${B.student.id}`)).status).toBe(200)
    expect((await adminB.get(`/api/v1/students/${fx.students.ali.id}`)).status).toBe(404)
    const list = await adminB.get('/api/v1/students')
    expect(list.body.items.map((s: { name: string }) => s.name)).toEqual(['B Student'])
  })

  it('admission numbers, halqa codes and fee plan codes are unique per madrasa only', async () => {
    // B reuses S-1, g-a and fp from A without a clash.
    expect(B.student.admissionNo).toBe(fx.students.ali.admissionNo)
    expect(B.group.code).toBe(fx.groups.gA.code)
    expect(B.plan.code).toBe(fx.plan.code)
  })
})

describe('a person with roles in two madrasas', () => {
  it('gets the permissions of the madrasa they are working in', async () => {
    // Mentor in A, administrator in B.
    await prisma.madrasaMembership.create({ data: { userId: fx.users.mentor.id, madrasaId: B.madrasa.id, role: 'MADRASA_ADMIN' } })
    const inA = await as('m1@x.test')
    const sA = await inA.get('/api/v1/auth/session')
    expect(sA.body.madrasa.id).toBe(fx.madrasa.id)
    expect(sA.body.user.roles).toEqual(['MENTOR'])
    expect(sA.body.madrasas.map((m: { code: string }) => m.code).sort()).toEqual(['B2', 'MAIN'])
    expect((await inA.get('/api/v1/admin/users')).status).toBe(403) // a mentor in A
    expect((await inA.get(`/api/v1/students/${fx.students.sara.id}`)).status).toBe(404) // not their halqa
    const inB = await as('m1@x.test', B.madrasa.id)
    const sB = await inB.get('/api/v1/auth/session')
    expect(sB.body.madrasa.id).toBe(B.madrasa.id)
    expect(sB.body.user.roles).toEqual(['MADRASA_ADMIN'])
    expect((await inB.get('/api/v1/admin/users')).status).toBe(200) // an administrator in B
    expect((await inB.get(`/api/v1/students/${B.student.id}`)).status).toBe(200)
    expect((await inB.get(`/api/v1/students/${fx.students.ali.id}`)).status).toBe(404) // admin rights in B do not reach A
  })

  it('a parent with children in two madrasas sees both, labelled by madrasa; another family sees neither', async () => {
    // P1 (children Ali and Sara in A) is also the guardian of B's student.
    await inMadrasa(B.madrasa.id, () => scoped.studentGuardian.create({ data: { studentId: B.student.id, guardianId: fx.guardians.p1.id } }))
    const p = await as('p1@x.test')
    const s = await p.get('/api/v1/auth/session')
    expect(s.body.madrasa).toBeNull() // reading across both madrasas
    const names = (await p.get('/api/v1/students')).body.items.map((x: { name: string }) => x.name).sort()
    expect(names).toEqual(['Ali', 'B Student', 'Sara'])
    expect((await p.get(`/api/v1/fees/students/${B.student.id}`)).status).toBe(200)
    expect((await (await as('p2@x.test')).get(`/api/v1/students/${B.student.id}`)).status).toBe(404)
  })

  it('an expired membership (e.g. a CA engaged for one audit) gives no access', async () => {
    await makeUser({ email: 'ca@x.test', roles: ['CA'], expiresAt: new Date(Date.now() - 1000) })
    const ca = await as('ca@x.test')
    const s = await ca.get('/api/v1/auth/session')
    expect(s.body.madrasas).toEqual([])
    expect(s.body.permissions).toEqual([])
    const fees = await ca.get('/api/v1/fees')
    expect(fees.body.invoices).toEqual([])
  })
})

describe('switched-off modules are refused by the API', () => {
  it('a disabled feature answers 404 for every route of the module, in that madrasa only', async () => {
    await prisma.madrasaFeature.update({ where: { madrasaId_feature: { madrasaId: fx.madrasa.id, feature: 'HOSTEL' } }, data: { enabled: false } })
    await prisma.madrasaFeature.update({ where: { madrasaId_feature: { madrasaId: fx.madrasa.id, feature: 'FEES' } }, data: { enabled: false } })
    const { forgetMadrasa } = await import('../../src/tenancy/settings.js')
    forgetMadrasa(fx.madrasa.id)
    for (const url of ['/api/v1/hostel', '/api/v1/fees', '/api/v1/payments/submissions', '/api/v1/admin/payment-settings', '/api/v1/reminders/rules']) {
      const r = await adminA.get(url)
      expect(r.status, url).toBe(404)
      expect(r.body.error.code, url).toBe('FEATURE_DISABLED')
    }
    expect((await adminA.post('/api/v1/fees/payments', { studentId: fx.students.ali.id, amountMinor: 100, method: 'CASH' })).status).toBe(404)
    // Still on in B.
    expect((await (await as('adminb@x.test')).get('/api/v1/hostel')).status).toBe(200)
  })
})

describe('scoping guard rails', () => {
  it('a query on a madrasa-scoped model outside any madrasa context throws', async () => {
    await expect(scoped.student.findMany()).rejects.toBeInstanceOf(ScopeError)
    await expect(scoped.invoice.count()).rejects.toBeInstanceOf(ScopeError)
  })

  it('creating a root record without an active madrasa throws; a forged madrasaId is rejected', async () => {
    await expect(asOrg('test', () => scoped.group.create({ data: { code: 'x', name: 'X', short: 'X', track: 'HIFZ', gender: 'BOYS' } }))).rejects.toThrow()
    await expect(withMadrasa(fx.madrasa.id, () => scoped.group.create({ data: { madrasaId: B.madrasa.id, code: 'x', name: 'X', short: 'X', track: 'HIFZ', gender: 'BOYS' } }))).rejects.toBeInstanceOf(ScopeError)
  })

  it('the database keeps a child row in its parent’s madrasa', async () => {
    // An invoice for B's student written while A is active: the trigger refuses it.
    await expect(withMadrasa(fx.madrasa.id, () => scoped.invoice.create({ data: { number: 'X-1', studentId: B.student.id, period: '2026-11', planId: fx.plan.id, currency: 'INR', grossMinor: 1, discountMinor: 0, amountMinor: 1, issuedOn: new Date(), dueDate: new Date() } }))).rejects.toThrow(/madrasa mismatch|different madrasas/)
    // A student cannot be put in another madrasa's halqa.
    await expect(withMadrasa(fx.madrasa.id, () => scoped.student.update({ where: { id: fx.students.ali.id }, data: { groupId: B.group.id } }))).rejects.toThrow(/madrasa mismatch|different madrasas/)
  })
})
