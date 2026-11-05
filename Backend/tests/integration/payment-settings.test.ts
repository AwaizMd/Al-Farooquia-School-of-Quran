import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { institutionToday } from '../../src/common/clock.js'
import { inMadrasa, prisma, resetDatabase } from '../helpers/db.js'
import { PASSWORD, app, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)])

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let admin: Client

beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  admin = await as('admin@x.test')
  await admin.post('/api/v1/fees/invoices/issue', { period: (await inMadrasa(fx.madrasa.id, () => institutionToday())).slice(0, 7) })
})

async function as(identifier: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  return c
}
const putQr = (c: Client, body: Buffer, type = 'image/png') => c.agent.put('/api/v1/admin/payment-settings/upi-qr').set('X-CSRF-Token', c.csrf).set('Content-Type', type).send(body)

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

describe('choosing methods', () => {
  it('validates bank details before bank transfer can be offered', async () => {
    const r = await admin.put('/api/v1/admin/payment-settings', { bank: { enabled: true, accountName: 'Trust', accountNumber: '12AB', ifsc: 'bad' } })
    expect(r.status).toBe(422)
    expect(r.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['bank.accountNumber', 'bank.ifsc']))
    const ok = await admin.put('/api/v1/admin/payment-settings', { bank: { enabled: true, accountName: 'Al Farooquia Trust', bankName: 'State Bank of India', accountNumber: '3020 1234 5678', ifsc: 'sbin0001234', accountType: 'Current' } })
    expect(ok.body.bank).toMatchObject({ enabled: true, ready: true, accountNumber: '302012345678', ifsc: 'SBIN0001234' })
  })

  it('bank only / UPI only / both: payers see exactly the enabled methods, and no gateway exists', async () => {
    await admin.put('/api/v1/admin/payment-settings', { bank: { accountName: 'Al Farooquia Trust', bankName: 'SBI', accountNumber: '302012345678', ifsc: 'SBIN0001234' } })
    const p = await as('p1@x.test')
    const opts = async () => (await p.get(`/api/v1/payments/options?studentId=${fx.students.ali.id}`)).body
    expect(await opts()).toEqual({ bank: null, upi: null })
    await admin.put('/api/v1/admin/payment-settings', { bank: { enabled: true } })
    expect((await opts()).bank).toMatchObject({ accountNumber: '302012345678', ifsc: 'SBIN0001234' })
    expect((await putQr(admin, PNG)).status).toBe(200)
    await admin.put('/api/v1/admin/payment-settings', { bank: { enabled: false }, upi: { enabled: true, upiId: 'trust@sbi' } })
    expect(await opts()).toMatchObject({ bank: null, upi: { upiId: 'trust@sbi' } })
    await admin.put('/api/v1/admin/payment-settings', { bank: { enabled: true } })
    expect(await opts()).toMatchObject({ bank: { bankName: 'SBI' }, upi: { upiId: 'trust@sbi' } })
    // CR-01: the payment gateway is gone, with every route it had.
    for (const [m, url] of [['post', '/api/v1/payments/attempts'], ['post', '/api/v1/payments/webhooks/razorpay'], ['post', '/api/v1/admin/payment-settings/razorpay/validate'], ['get', '/api/v1/payments/config']] as const) {
      expect((await (m === 'get' ? p.get(url) : p.post(url, {}))).status, url).toBe(404)
    }
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
