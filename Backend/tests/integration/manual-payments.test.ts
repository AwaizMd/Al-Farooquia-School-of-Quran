import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { addDaysIso, institutionToday } from '../../src/common/clock.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, makeUser, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'
import { enablePayments } from '../helpers/payments.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let admin: Client
let parent: Client
let today: string
const PDF = Buffer.from('%PDF-1.4\n% bank confirmation\n%%EOF\n')

beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  await enablePayments({ bank: true })
  today = await institutionToday()
  admin = await as('admin@x.test')
  await admin.post('/api/v1/fees/invoices/issue', { period: today.slice(0, 7) }) // Ali owes 1,350.00 (10% sibling concession)
  parent = await as('p1@x.test')
})

async function as(identifier: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  return c
}
const balance = async (ref = 'S-1') => (await admin.get(`/api/v1/fees/students/${ref}`)).body.totals.balanceMinor as number
const claim = (over: object = {}) => ({ studentId: fx.students.ali.id, method: 'BANK_TRANSFER', amountMinor: 50000, paidOn: today, reference: 'SBIN226012345678', ...over })
const uploadProof = (c: Client, body: Buffer, type = 'application/pdf') => c.agent.post('/api/v1/payments/proofs').set('X-CSRF-Token', c.csrf).set('Content-Type', type).set('X-File-Name', 'receipt.pdf').send(body)

describe('submitting a bank transfer', () => {
  it('records a claim pending verification; the balance does not change; the family is told it is under review', async () => {
    const r = await parent.post('/api/v1/payments/submissions', claim({ note: 'Paid from HDFC app' }))
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ status: 'PENDING_VERIFICATION', amountMinor: 50000, method: 'BANK_TRANSFER', payment: null })
    expect(await balance()).toBe(135000)
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: fx.users.parent.id, title: { contains: 'payment' , mode: 'insensitive' } } })
    expect(n.title).toBe('Payment submitted for verification')
    expect(n.body).not.toMatch(/success|paid\b/i)
    expect(await prisma.notification.count({ where: { userId: fx.users.admin.id, title: 'Payment to verify' } })).toBe(1)
    expect(await prisma.payment.count()).toBe(0)
  })

  it('validates the reference, amount, date and method', async () => {
    const cases: [object, number, string][] = [
      [{ reference: '' }, 422, 'reference'], [{ reference: '12-3' }, 422, 'reference'], [{ amountMinor: 0 }, 422, 'amountMinor'], [{ amountMinor: 12.5 }, 422, 'amountMinor'],
      [{ amountMinor: 135001 }, 422, 'AMOUNT_EXCEEDS_BALANCE'], [{ paidOn: addDaysIso(today, 1) }, 422, 'paidOn'], [{ paidOn: '2026-02-30' }, 422, 'paidOn'],
      [{ method: 'UPI' }, 422, 'METHOD_UNAVAILABLE'], [{ method: 'CASH' }, 422, 'method'],
    ]
    for (const [over, status, hint] of cases) {
      const r = await parent.post('/api/v1/payments/submissions', claim(over))
      expect(r.status, JSON.stringify(over)).toBe(status)
      expect(JSON.stringify(r.body), JSON.stringify(over)).toContain(hint)
    }
    expect(await prisma.manualPaymentSubmission.count()).toBe(0)
  })

  it('cannot be made for someone else’s child, by a mentor, a student or the Principal', async () => {
    expect((await (await as('p2@x.test')).post('/api/v1/payments/submissions', claim())).status).toBe(404)
    for (const who of ['m1@x.test', 's-1', 'principal@x.test']) expect((await (await as(who)).post('/api/v1/payments/submissions', claim())).status, who).toBe(404)
    expect(await prisma.manualPaymentSubmission.count()).toBe(0)
  })

  it('a reference can only be claimed once (ignoring spaces, dashes and case)', async () => {
    expect((await parent.post('/api/v1/payments/submissions', claim())).status).toBe(201)
    const again = await parent.post('/api/v1/payments/submissions', claim({ reference: 'sbin-2260 1234 5678', amountMinor: 10000 }))
    expect(again.body.error.code).toBe('DUPLICATE_REFERENCE')
    const other = await (await as('p2@x.test')).post('/api/v1/payments/submissions', claim({ studentId: fx.students.bilal.id, reference: 'SBIN226012345678' }))
    expect(other.body.error.code).toBe('DUPLICATE_REFERENCE')
  })

  it('claims waiting for verification count against the balance', async () => {
    expect((await parent.post('/api/v1/payments/submissions', claim({ amountMinor: 100000 }))).status).toBe(201)
    const r = await parent.post('/api/v1/payments/submissions', claim({ amountMinor: 40000, reference: 'UTR000000000002' }))
    expect(r.body.error.code).toBe('AMOUNT_EXCEEDS_BALANCE')
    expect((await parent.post('/api/v1/payments/submissions', claim({ amountMinor: 35000, reference: 'UTR000000000003' }))).status).toBe(201)
  })

  it('proof of payment: required when the Madarsa asks, checked by content, private to its uploader', async () => {
    await enablePayments({ bank: true, bankProofRequired: true })
    expect((await parent.post('/api/v1/payments/submissions', claim())).body.error.details[0].path).toBe('proofFileId')
    expect((await uploadProof(parent, Buffer.from('<html>not a pdf</html>'))).status).toBe(415)
    expect((await uploadProof(parent, PDF, 'text/html')).status).toBe(415)
    expect((await uploadProof(await as('m1@x.test'), PDF)).status).toBe(403)
    const proof = (await uploadProof(parent, PDF)).body
    // Another payer cannot attach this file.
    const p2 = await as('p2@x.test')
    expect((await p2.post('/api/v1/payments/submissions', claim({ studentId: fx.students.bilal.id, reference: 'UTR000000000009', proofFileId: proof.id }))).status).toBe(422)
    const r = await parent.post('/api/v1/payments/submissions', claim({ proofFileId: proof.id }))
    expect(r.body.proof).toMatchObject({ mimeType: 'application/pdf' })
    const dl = await parent.agent.get(`/api/v1/payments/submissions/${r.body.id}/proof`)
    expect(dl.status).toBe(200)
    expect(dl.headers['content-disposition']).toMatch(/^attachment/)
    expect(dl.headers['content-security-policy']).toContain('sandbox')
    expect((await p2.agent.get(`/api/v1/payments/submissions/${r.body.id}/proof`)).status).toBe(404)
    expect((await admin.agent.get(`/api/v1/payments/submissions/${r.body.id}/proof`)).status).toBe(200)
  })
})

describe('verifying', () => {
  async function submitted(over: object = {}) {
    return (await parent.post('/api/v1/payments/submissions', claim(over))).body
  }

  it('only fee verifiers can approve: families, mentors, wardens and the Principal get 403', async () => {
    const s = await submitted()
    for (const who of ['p1@x.test', 'm1@x.test', 'warden@x.test', 'principal@x.test', 's-1']) {
      expect((await (await as(who)).post(`/api/v1/payments/submissions/${s.id}/approve`, {})).status, who).toBe(403)
    }
    expect(await balance()).toBe(135000)
  })

  it('approval applies the amount to the ledger once, with a receipt and the reference', async () => {
    const s = await submitted()
    const r = await admin.post(`/api/v1/payments/submissions/${s.id}/approve`, {})
    expect(r.body).toMatchObject({ status: 'APPROVED', approvedAmountMinor: 50000, payment: { method: 'BANK_TRANSFER', source: 'VERIFIED', reference: 'SBIN226012345678', receiptNo: expect.stringMatching(/^NR-\d{4}-0001$/) } })
    expect(await balance()).toBe(85000)
    expect((await admin.post(`/api/v1/payments/submissions/${s.id}/approve`, {})).body.error.code).toBe('ALREADY_REVIEWED')
    expect((await admin.post(`/api/v1/payments/submissions/${s.id}/reject`, { reason: 'Too late to reject' })).body.error.code).toBe('ALREADY_REVIEWED')
    expect(await balance()).toBe(85000)
    const fam = (await parent.get('/api/v1/fees/students/S-1')).body
    expect(fam.payments[0]).toMatchObject({ receiptNo: r.body.payment.receiptNo, reference: 'SBIN226012345678' })
    expect(await prisma.notification.count({ where: { userId: fx.users.parent.id, title: 'Payment approved' } })).toBe(1)
  })

  it('concurrent approvals of one submission apply it exactly once', async () => {
    const s = await submitted()
    const admin2 = await makeUser({ email: 'admin2@x.test', roles: ['ADMIN'] }).then(() => as('admin2@x.test'))
    const rs = await Promise.all([admin.post(`/api/v1/payments/submissions/${s.id}/approve`, {}), admin2.post(`/api/v1/payments/submissions/${s.id}/approve`, {}), admin.post(`/api/v1/payments/submissions/${s.id}/approve`, {})])
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409, 409])
    expect(await prisma.payment.count()).toBe(1)
    expect(await balance()).toBe(85000)
  })

  it('a different amount needs a note; money above the balance is kept for review, not lost', async () => {
    const s = await submitted()
    expect((await admin.post(`/api/v1/payments/submissions/${s.id}/approve`, { amountMinor: 40000 })).status).toBe(422)
    // The office took cash for the whole invoice meanwhile; the transfer still arrived.
    await admin.post('/api/v1/fees/payments', { studentId: fx.students.ali.id, amountMinor: 135000, method: 'CASH' })
    const r = await admin.post(`/api/v1/payments/submissions/${s.id}/approve`, { amountMinor: 50000, note: 'Confirmed on statement' })
    expect(r.body.payment.unallocatedMinor).toBe(50000)
    expect(await prisma.auditLog.count({ where: { action: 'fees.manual_payment_approved', summary: { contains: 'unallocated' } } })).toBe(1)
  })

  it('rejection keeps the record, leaves the balance, tells the family why, and allows resubmitting', async () => {
    const s = await submitted()
    expect((await admin.post(`/api/v1/payments/submissions/${s.id}/reject`, { reason: 'x' })).status).toBe(422)
    const r = await admin.post(`/api/v1/payments/submissions/${s.id}/reject`, { reason: 'No credit with this UTR on our statement.' })
    expect(r.body).toMatchObject({ status: 'REJECTED', reviewNote: 'No credit with this UTR on our statement.' })
    expect(await balance()).toBe(135000)
    const seen = (await parent.get(`/api/v1/payments/submissions/${s.id}`)).body
    expect(seen).toMatchObject({ status: 'REJECTED', reviewNote: 'No credit with this UTR on our statement.' })
    expect(seen.history).toBeUndefined() // staff-only detail
    expect((await prisma.notification.findFirstOrThrow({ where: { userId: fx.users.parent.id, title: 'Payment could not be verified' } })).body).toContain('No credit with this UTR')
    const again = await parent.post('/api/v1/payments/submissions', claim())
    expect(again.status).toBe(201)
    const detail = (await admin.get(`/api/v1/payments/submissions/${again.body.id}`)).body
    expect(detail.sameReference).toEqual([expect.objectContaining({ status: 'REJECTED' })])
    expect(detail.history.map((h: { action: string }) => h.action)).toEqual(['fees.manual_payment_submitted'])
  })

  it('more information can be requested; the payer answers and it returns to the queue', async () => {
    const s = await submitted()
    await admin.post(`/api/v1/payments/submissions/${s.id}/request-info`, { message: 'Please upload the bank confirmation.' })
    expect((await parent.get(`/api/v1/payments/submissions/${s.id}`)).body).toMatchObject({ status: 'NEEDS_INFO', reviewNote: 'Please upload the bank confirmation.' })
    expect((await (await as('p2@x.test')).patch(`/api/v1/payments/submissions/${s.id}`, { note: 'hijack' })).status).toBe(404)
    const proof = (await uploadProof(parent, PDF)).body
    const r = await parent.patch(`/api/v1/payments/submissions/${s.id}`, { note: 'Attached the confirmation', proofFileId: proof.id })
    expect(r.body).toMatchObject({ status: 'PENDING_VERIFICATION', proof: { mimeType: 'application/pdf' } })
    const h = (await admin.get(`/api/v1/payments/submissions/${s.id}`)).body.history.map((x: { action: string }) => x.action)
    expect(h).toEqual(['fees.manual_payment_submitted', 'fees.manual_payment_info_requested', 'fees.manual_payment_info_provided'])
  })

  it('nobody can approve a payment they submitted themselves', async () => {
    const both = await makeUser({ email: 'adminparent@x.test', roles: ['ADMIN', 'PARENT'] })
    await prisma.guardian.update({ where: { id: fx.guardians.p2.id }, data: { userId: both.id } })
    const c = await as('adminparent@x.test')
    const s = (await c.post('/api/v1/payments/submissions', claim({ studentId: fx.students.bilal.id }))).body
    expect((await c.post(`/api/v1/payments/submissions/${s.id}/approve`, {})).status).toBe(403)
    expect((await admin.post(`/api/v1/payments/submissions/${s.id}/approve`, {})).status).toBe(200)
  })

  it('staff list and filter; families see only their children’s; the Principal can read but not approve', async () => {
    await submitted()
    await (await as('p2@x.test')).post('/api/v1/payments/submissions', claim({ studentId: fx.students.bilal.id, reference: 'UTR000000000077' }))
    expect((await admin.get('/api/v1/payments/submissions')).body.total).toBe(2)
    expect((await admin.get('/api/v1/payments/submissions?reference=utr-0000')).body.total).toBe(1)
    expect((await admin.get(`/api/v1/payments/submissions?studentId=${fx.students.bilal.id}`)).body.total).toBe(1)
    expect((await admin.get('/api/v1/payments/submissions?status=APPROVED')).body.total).toBe(0)
    expect((await parent.get('/api/v1/payments/submissions')).body.items.map((i: { student: { admissionNo: string } }) => i.student.admissionNo)).toEqual(['S-1'])
    expect((await (await as('m1@x.test')).get('/api/v1/payments/submissions')).body.total).toBe(0)
    expect((await (await as('principal@x.test')).get('/api/v1/payments/submissions')).body.total).toBe(2)
  })
})
