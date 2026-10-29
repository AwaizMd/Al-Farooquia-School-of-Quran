import { createHmac } from 'node:crypto'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { env } from '../../src/config/env.js'
import { institutionToday } from '../../src/common/clock.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, app, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'
import { ensureInstitution } from '../helpers/payments.js'
import { fakeRazorpay } from '../helpers/fakeRazorpay.js'

const KEY_ID = 'rzp_test_Abcdefgh1234'
const KEY_SECRET = 'test-key-secret-0001'
const WEBHOOK_SECRET = 'test-webhook-secret-0001'
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)])

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let admin: Client
let fake: Awaited<ReturnType<typeof fakeRazorpay>>
const original = { provider: env.PAYMENT_PROVIDER, base: env.RAZORPAY_API_BASE }

beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  await ensureInstitution()
  admin = await as('admin@x.test')
  await admin.post('/api/v1/fees/invoices/issue', { period: (await institutionToday()).slice(0, 7) })
  // These tests use credentials entered in the admin panel, against a fake Razorpay.
  fake = await fakeRazorpay(KEY_ID, KEY_SECRET)
  env.PAYMENT_PROVIDER = 'none'
  env.RAZORPAY_API_BASE = fake.base
})
afterEach(async () => {
  env.PAYMENT_PROVIDER = original.provider
  env.RAZORPAY_API_BASE = original.base
  await fake.close()
})

async function as(identifier: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  return c
}
const putQr = (c: Client, body: Buffer, type = 'image/png') => c.agent.put('/api/v1/admin/payment-settings/upi-qr').set('X-CSRF-Token', c.csrf).set('Content-Type', type).send(body)
const signWebhook = (body: object) => { const raw = JSON.stringify(body); return { raw, sig: createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex') } }
const configureRazorpay = () => admin.put('/api/v1/admin/payment-settings', { razorpay: { keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET } })

describe('who can see and change payment settings', () => {
  it('only administrators; the Principal, mentors and families get 403', async () => {
    for (const who of ['principal@x.test', 'm1@x.test', 'p1@x.test', 'warden@x.test']) {
      const c = await as(who)
      expect((await c.get('/api/v1/admin/payment-settings')).status, who).toBe(403)
      expect((await c.put('/api/v1/admin/payment-settings', { bank: { enabled: false } })).status, who).toBe(403)
    }
  })

  it('saving needs a recent password confirmation', async () => {
    await prisma.session.updateMany({ data: { reauthenticatedAt: new Date(Date.now() - 10 * 60_000) } })
    expect((await admin.put('/api/v1/admin/payment-settings', { bank: { bankName: 'X Bank' } })).body.error.code).toBe('REAUTH_REQUIRED')
  })
})

describe('Razorpay credentials', () => {
  it('are stored encrypted and never returned', async () => {
    const r = await configureRazorpay()
    expect(r.status).toBe(200)
    const body = JSON.stringify(r.body) + JSON.stringify((await admin.get('/api/v1/admin/payment-settings')).body)
    expect(body).not.toContain(KEY_SECRET)
    expect(body).not.toContain(WEBHOOK_SECRET)
    expect(body).not.toContain(KEY_ID) // shown masked
    expect(r.body.razorpay).toMatchObject({ keySecretSet: true, webhookSecretSet: true, keyId: expect.stringMatching(/^rzp_test_•+1234$/) })
    const row = await prisma.paymentSettings.findUniqueOrThrow({ where: { institutionId: 1 } })
    expect(Buffer.from(row.razorpaySecret!).toString('latin1')).not.toContain(KEY_SECRET)
    expect(await prisma.auditLog.count({ where: { action: 'payments.settings_changed', summary: { contains: KEY_SECRET } } })).toBe(0)
  })

  it('cannot be switched on before the keys are validated; wrong keys are rejected', async () => {
    await configureRazorpay()
    const early = await admin.put('/api/v1/admin/payment-settings', { razorpay: { enabled: true } })
    expect(early.status).toBe(422)
    expect(JSON.stringify(early.body)).toContain('Validate the keys')
    await admin.put('/api/v1/admin/payment-settings', { razorpay: { keySecret: 'a-wrong-secret-99' } })
    expect((await admin.post('/api/v1/admin/payment-settings/razorpay/validate')).body.error.code).toBe('RAZORPAY_REJECTED')
    await admin.put('/api/v1/admin/payment-settings', { razorpay: { keySecret: KEY_SECRET } })
    expect((await admin.post('/api/v1/admin/payment-settings/razorpay/validate')).status).toBe(200)
    expect((await admin.put('/api/v1/admin/payment-settings', { razorpay: { enabled: true } })).body.razorpay).toMatchObject({ enabled: true, ready: true, mode: 'TEST' })
  })

  it('a new key needs validating again; live mode needs a live key and a verified webhook', async () => {
    await configureRazorpay()
    await admin.post('/api/v1/admin/payment-settings/razorpay/validate')
    expect((await admin.put('/api/v1/admin/payment-settings', { razorpay: { mode: 'LIVE' } })).body.razorpay.problems).toEqual(expect.arrayContaining([expect.stringContaining('live mode Key ID')]))
    expect((await admin.put('/api/v1/admin/payment-settings', { razorpay: { mode: 'LIVE', enabled: true } })).status).toBe(422)
    // Switching to live keys (against a fake that accepts them)
    await fake.close()
    fake = await fakeRazorpay('rzp_live_Abcdefgh9999', KEY_SECRET)
    env.RAZORPAY_API_BASE = fake.base
    await admin.put('/api/v1/admin/payment-settings', { razorpay: { keyId: 'rzp_live_Abcdefgh9999' } })
    await admin.post('/api/v1/admin/payment-settings/razorpay/validate')
    const noHook = await admin.put('/api/v1/admin/payment-settings', { razorpay: { enabled: true } })
    expect(JSON.stringify(noHook.body)).toContain('signed webhook')
    // A test webhook from the dashboard, correctly signed, proves the webhook is set up.
    const { raw, sig } = signWebhook({ event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_x', order_id: 'order_unknown', amount: 1, currency: 'INR' } } } })
    expect((await request(app).post('/api/v1/payments/webhooks/razorpay').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw)).status).toBe(200)
    expect((await admin.put('/api/v1/admin/payment-settings', { razorpay: { enabled: true } })).body.razorpay).toMatchObject({ enabled: true, ready: true, mode: 'LIVE' })
  })
})

describe('choosing methods', () => {
  it('validates bank details before bank transfer can be offered', async () => {
    const r = await admin.put('/api/v1/admin/payment-settings', { bank: { enabled: true, accountName: 'Trust', accountNumber: '12AB', ifsc: 'bad' } })
    expect(r.status).toBe(422)
    expect(r.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['bank.accountNumber', 'bank.ifsc']))
    const ok = await admin.put('/api/v1/admin/payment-settings', { bank: { enabled: true, accountName: 'Al Farooquia Trust', bankName: 'State Bank of India', accountNumber: '3020 1234 5678', ifsc: 'sbin0001234', accountType: 'Current' } })
    expect(ok.body.bank).toMatchObject({ enabled: true, ready: true, accountNumber: '302012345678', ifsc: 'SBIN0001234' })
  })

  it('Razorpay only / bank only / both: payers see exactly the enabled methods', async () => {
    await configureRazorpay()
    await admin.post('/api/v1/admin/payment-settings/razorpay/validate')
    await admin.put('/api/v1/admin/payment-settings', { bank: { accountName: 'Al Farooquia Trust', bankName: 'SBI', accountNumber: '302012345678', ifsc: 'SBIN0001234' } })
    const p = await as('p1@x.test')
    const opts = async () => (await p.get(`/api/v1/payments/options?studentId=${fx.students.ali.id}`)).body
    expect(await opts()).toMatchObject({ online: null, bank: null, upi: null })
    await admin.put('/api/v1/admin/payment-settings', { razorpay: { enabled: true } })
    expect(await opts()).toMatchObject({ online: { provider: 'razorpay' }, bank: null })
    await admin.put('/api/v1/admin/payment-settings', { razorpay: { enabled: false }, bank: { enabled: true } })
    const bankOnly = await opts()
    expect(bankOnly.online).toBeNull()
    expect(bankOnly.bank).toMatchObject({ accountNumber: '302012345678', ifsc: 'SBIN0001234' })
    // With Razorpay off, no Razorpay order is ever created.
    expect((await p.post('/api/v1/payments/attempts', { studentId: fx.students.ali.id })).body.error.code).toBe('PAYMENTS_DISABLED')
    expect(fake.state.calls.filter((c) => c.startsWith('POST /v1/orders'))).toEqual([])
    await admin.put('/api/v1/admin/payment-settings', { razorpay: { enabled: true } })
    expect(await opts()).toMatchObject({ online: { provider: 'razorpay' }, bank: { bankName: 'SBI' } })
  })

  it('bank details are not given to people who cannot pay for that student', async () => {
    await admin.put('/api/v1/admin/payment-settings', { bank: { enabled: true, accountName: 'Al Farooquia Trust', bankName: 'SBI', accountNumber: '302012345678', ifsc: 'SBIN0001234' } })
    expect((await (await as('p2@x.test')).get(`/api/v1/payments/options?studentId=${fx.students.ali.id}`)).status).toBe(404)
    expect((await (await as('m1@x.test')).get(`/api/v1/payments/options?studentId=${fx.students.ali.id}`)).status).toBe(404)
    expect((await (await as('s-1')).get(`/api/v1/payments/options?studentId=${fx.students.ali.id}`)).status).toBe(404)
    expect((await request(app).get(`/api/v1/payments/options?studentId=${fx.students.ali.id}`)).status).toBe(401)
  })
})

describe('UPI QR code', () => {
  it('accepts only real PNG/JPEG/WebP images up to 2 MB', async () => {
    expect((await putQr(admin, Buffer.from('%PDF-1.4 fake'), 'image/png')).status).toBe(415)
    expect((await putQr(admin, PNG, 'image/jpeg')).status).toBe(415)
    expect((await putQr(admin, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]))).status).toBe(413)
    const ok = await putQr(admin, PNG)
    expect(ok.body.upi).toMatchObject({ hasQr: true, ready: true })
  })

  it('is shown only to payers once UPI is on; replacing and removing work; removal switches UPI off', async () => {
    await putQr(admin, PNG)
    const p = await as('p1@x.test')
    expect((await p.get('/api/v1/payments/upi-qr')).status).toBe(404) // UPI not switched on yet
    await admin.put('/api/v1/admin/payment-settings', { upi: { enabled: true, upiId: 'farooquia@sbi', payeeName: 'Al Farooquia Trust' } })
    const img = await p.get('/api/v1/payments/upi-qr')
    expect(img.status).toBe(200)
    expect(img.headers['content-type']).toBe('image/png')
    expect((await (await as('m1@x.test')).get('/api/v1/payments/upi-qr')).status).toBe(403)
    const second = Buffer.concat([PNG, Buffer.alloc(10, 7)])
    await putQr(admin, second)
    expect(await prisma.storedFile.count({ where: { purpose: 'UPI_QR' } })).toBe(1)
    const removed = await admin.del('/api/v1/admin/payment-settings/upi-qr')
    expect(removed.body.upi).toMatchObject({ enabled: false, hasQr: false })
    expect((await p.get('/api/v1/payments/upi-qr')).status).toBe(404)
  })
})

describe('Razorpay checkout verification (fake gateway)', () => {
  async function onlineAttempt() {
    await configureRazorpay()
    await admin.post('/api/v1/admin/payment-settings/razorpay/validate')
    await admin.put('/api/v1/admin/payment-settings', { razorpay: { enabled: true } })
    const p = await as('p1@x.test')
    const a = (await p.post('/api/v1/payments/attempts', { studentId: fx.students.ali.id, amountMinor: 1 })).body
    return { p, a }
  }
  const sign = (orderId: string, paymentId: string) => createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')
  const balance = async (c: Client) => (await c.get('/api/v1/fees/students/S-1')).body.totals.balanceMinor

  it('creates the order on the server with the server’s amount', async () => {
    const { a } = await onlineAttempt()
    expect(a).toMatchObject({ amountMinor: 135000, status: 'PENDING', checkout: { kind: 'razorpay', keyId: KEY_ID } })
    expect(JSON.stringify(a)).not.toContain(KEY_SECRET)
    expect(fake.state.orders.get(a.checkout.orderId)).toEqual({ amount: 135000, currency: 'INR' })
  })

  it('an invalid signature credits nothing', async () => {
    const { p, a } = await onlineAttempt()
    fake.state.payments.set('pay_1', { id: 'pay_1', order_id: a.checkout.orderId, status: 'captured', amount: 135000, currency: 'INR' })
    const r = await p.post(`/api/v1/payments/attempts/${a.id}/verify`, { orderId: a.checkout.orderId, paymentId: 'pay_1', signature: 'f'.repeat(64) })
    expect(r.body.error.code).toBe('INVALID_SIGNATURE')
    expect(await balance(p)).toBe(135000)
  })

  it('a valid signature alone is not enough: an authorised-but-not-captured payment stays pending', async () => {
    const { p, a } = await onlineAttempt()
    fake.state.payments.set('pay_2', { id: 'pay_2', order_id: a.checkout.orderId, status: 'authorized', amount: 135000, currency: 'INR' })
    const r = await p.post(`/api/v1/payments/attempts/${a.id}/verify`, { orderId: a.checkout.orderId, paymentId: 'pay_2', signature: sign(a.checkout.orderId, 'pay_2') })
    expect(r.body.status).toBe('PENDING')
    expect(await balance(p)).toBe(135000)
  })

  it('a captured payment with the wrong amount is not credited', async () => {
    const { p, a } = await onlineAttempt()
    fake.state.payments.set('pay_3', { id: 'pay_3', order_id: a.checkout.orderId, status: 'captured', amount: 100, currency: 'INR' })
    await p.post(`/api/v1/payments/attempts/${a.id}/verify`, { orderId: a.checkout.orderId, paymentId: 'pay_3', signature: sign(a.checkout.orderId, 'pay_3') })
    expect(await balance(p)).toBe(135000)
  })

  it('a captured payment is credited once, however often it is verified or notified', async () => {
    const { p, a } = await onlineAttempt()
    fake.state.payments.set('pay_4', { id: 'pay_4', order_id: a.checkout.orderId, status: 'captured', amount: 135000, currency: 'INR' })
    const body = { orderId: a.checkout.orderId, paymentId: 'pay_4', signature: sign(a.checkout.orderId, 'pay_4') }
    const rs = await Promise.all([1, 2, 3].map(() => p.post(`/api/v1/payments/attempts/${a.id}/verify`, body)))
    expect(rs.every((r) => r.body.status === 'SUCCEEDED')).toBe(true)
    const { raw, sig } = signWebhook({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_4', order_id: a.checkout.orderId, amount: 135000, currency: 'INR', status: 'captured' } } } })
    await request(app).post('/api/v1/payments/webhooks/razorpay').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw)
    expect(await prisma.payment.count()).toBe(1)
    expect(await prisma.payment.findFirstOrThrow()).toMatchObject({ reference: 'pay_4', source: 'ONLINE' })
    expect(await balance(p)).toBe(0)
  })

  it('a forged webhook is refused; a real one is still honoured after online payment is switched off', async () => {
    const { p, a } = await onlineAttempt()
    const evt = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_5', order_id: a.checkout.orderId, amount: 135000, currency: 'INR', status: 'captured' } } } }
    const forged = await request(app).post('/api/v1/payments/webhooks/razorpay').set('x-razorpay-signature', 'a'.repeat(64)).set('Content-Type', 'application/json').send(JSON.stringify(evt))
    expect(forged.status).toBe(400)
    await admin.put('/api/v1/admin/payment-settings', { razorpay: { enabled: false } })
    const { raw, sig } = signWebhook(evt)
    expect((await request(app).post('/api/v1/payments/webhooks/razorpay').set('x-razorpay-signature', sig).set('Content-Type', 'application/json').send(raw)).status).toBe(200)
    expect(await balance(p)).toBe(0)
  })

  it('refunds of an online payment go through the gateway', async () => {
    const { p, a } = await onlineAttempt()
    fake.state.payments.set('pay_6', { id: 'pay_6', order_id: a.checkout.orderId, status: 'captured', amount: 135000, currency: 'INR' })
    await p.post(`/api/v1/payments/attempts/${a.id}/verify`, { orderId: a.checkout.orderId, paymentId: 'pay_6', signature: sign(a.checkout.orderId, 'pay_6') })
    const pay = await prisma.payment.findFirstOrThrow()
    const r = await admin.post(`/api/v1/fees/payments/${pay.id}/refunds`, { amountMinor: 35000, reason: 'Partial refund test' })
    expect(r.body.status).toBe('COMPLETED')
    expect(fake.state.calls).toContain('POST /v1/payments/pay_6/refund')
    expect(await balance(p)).toBe(35000)
  })
})
