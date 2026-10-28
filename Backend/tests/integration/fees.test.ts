import { createHmac } from 'node:crypto'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { institutionToday } from '../../src/common/clock.js'
import { fiscalYearOf, discountFor } from '../../src/modules/fees/fees.service.js'
import { razorpayProvider } from '../../src/integrations/payments/razorpay.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, app, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let admin: Client
let today: string
let period: string
beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  today = await institutionToday()
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
const signDev = (body: object) => { const raw = JSON.stringify(body); return { raw, sig: createHmac('sha256', 'test-webhook-secret-0123456789').update(raw).digest('hex') } }

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

describe('online payments', () => {
  beforeEach(async () => { await admin.post('/api/v1/fees/invoices/issue', { period }) })

  it('the server sets the amount; the client cannot', async () => {
    const p = await as('p1@x.test')
    const r = await p.post('/api/v1/payments/attempts', { studentId: fx.students.ali.id, amountMinor: 1 })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ amountMinor: 135000, status: 'PENDING', provider: 'dev' })
    expect(r.body.checkout).not.toHaveProperty('secret')
  })

  it('only a linked guardian with payment rights can start a payment', async () => {
    expect((await (await as('p2@x.test')).post('/api/v1/payments/attempts', { studentId: fx.students.ali.id })).status).toBe(404)
    await prisma.studentGuardian.updateMany({ where: { guardianId: fx.guardians.p1.id }, data: { canPay: false } })
    expect((await (await as('p1@x.test')).post('/api/v1/payments/attempts', { studentId: fx.students.ali.id })).status).toBe(403)
  })

  it('a payment counts only after a verified webhook; replays never credit twice', async () => {
    const p = await as('p1@x.test')
    const att = (await p.post('/api/v1/payments/attempts', { studentId: fx.students.ali.id })).body
    // Returning from checkout proves nothing: still pending, still owed.
    expect((await p.get(`/api/v1/payments/attempts/${att.id}`)).body.status).toBe('PENDING')
    expect(await balanceOf(p, 'S-1')).toBe(135000)

    const event = { id: 'evt_1', type: 'payment.succeeded', orderId: att.checkout.orderId, paymentId: 'pay_1', amountMinor: 135000, currency: 'INR' }
    const forged = await request(app).post('/api/v1/payments/webhooks/dev').set('x-dev-signature', 'deadbeef').set('Content-Type', 'application/json').send(JSON.stringify(event))
    expect(forged.status).toBe(400)
    expect(await prisma.payment.count()).toBe(0)

    const { raw, sig } = signDev(event)
    const ok = await request(app).post('/api/v1/payments/webhooks/dev').set('x-dev-signature', sig).set('Content-Type', 'application/json').send(raw)
    expect(ok.body).toEqual({ received: true, duplicate: false })
    const again = await request(app).post('/api/v1/payments/webhooks/dev').set('x-dev-signature', sig).set('Content-Type', 'application/json').send(raw)
    expect(again.body.duplicate).toBe(true)
    // A different event id for the same order (gateway retry) is also not credited twice.
    const retry = signDev({ ...event, id: 'evt_2' })
    await request(app).post('/api/v1/payments/webhooks/dev').set('x-dev-signature', retry.sig).set('Content-Type', 'application/json').send(retry.raw)

    expect(await prisma.payment.count()).toBe(1)
    const status = (await p.get(`/api/v1/payments/attempts/${att.id}`)).body
    expect(status).toMatchObject({ status: 'SUCCEEDED', receiptNo: expect.stringMatching(/^NR-\d{4}-0001$/) })
    expect(await balanceOf(p, 'S-1')).toBe(0)
  })

  it('a gateway amount that does not match is not credited', async () => {
    const p = await as('p1@x.test')
    const att = (await p.post('/api/v1/payments/attempts', { studentId: fx.students.ali.id })).body
    const { raw, sig } = signDev({ id: 'evt_x', type: 'payment.succeeded', orderId: att.checkout.orderId, paymentId: 'pay_x', amountMinor: 100, currency: 'INR' })
    await request(app).post('/api/v1/payments/webhooks/dev').set('x-dev-signature', sig).set('Content-Type', 'application/json').send(raw)
    expect(await prisma.payment.count()).toBe(0)
    expect((await p.get(`/api/v1/payments/attempts/${att.id}`)).body).toMatchObject({ status: 'FAILED', failureReason: 'amount_mismatch' })
  })

  it('money arriving after the balance was cleared is recorded for review, not lost', async () => {
    const p = await as('p1@x.test')
    const att = (await p.post('/api/v1/payments/attempts', { studentId: fx.students.ali.id })).body
    await admin.post('/api/v1/fees/payments', { studentId: fx.students.ali.id, amountMinor: 135000, method: 'CASH' })
    const done = await p.post(`/api/v1/payments/dev/attempts/${att.id}/complete`, { outcome: 'success' })
    expect(done.body.status).toBe('SUCCEEDED')
    const online = await prisma.payment.findFirstOrThrow({ where: { source: 'ONLINE' } })
    expect(online.unallocatedMinor).toBe(135000)
    expect(await prisma.auditLog.count({ where: { action: 'fees.online_payment_confirmed', summary: { contains: 'review' } } })).toBe(1)
  })

  it('verifies Razorpay signatures over the raw body', () => {
    const rp = razorpayProvider({ keyId: 'k', keySecret: 's', webhookSecret: 'whsec' })
    const raw = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_9', order_id: 'order_9', amount: 500, currency: 'INR', status: 'captured', card: { last4: '4242' } } } } }))
    const sig = createHmac('sha256', 'whsec').update(raw).digest('hex')
    const ev = rp.verifyWebhook(raw, { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'e9' })
    expect(ev).toMatchObject({ eventId: 'e9', type: 'payment.succeeded', providerOrderId: 'order_9', amountMinor: 500 })
    expect(JSON.stringify(ev!.stored)).not.toContain('4242') // card details are not stored
    expect(rp.verifyWebhook(Buffer.from(raw.toString().replace('500', '50000')), { 'x-razorpay-signature': sig })).toBeNull()
  })
})
