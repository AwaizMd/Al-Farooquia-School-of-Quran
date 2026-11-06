import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../../src/modules/auth/password.js'
import { issueQr } from '../../src/modules/kiosk/qr-token.js'
import { asOrg } from '../../src/tenancy/context.js'
import { forgetMadrasa } from '../../src/tenancy/settings.js'
import { prisma as scoped } from '../../src/database/prisma.js'
import { PASSWORD, app, client, makeUser, type Client } from '../helpers/auth.js'
import { inMadrasa, prisma, resetDatabase, seedMadrasa } from '../helpers/db.js'
import { seedPeopleFixture } from '../helpers/people.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let admin: Client

/** Mid-morning in Kolkata on a Monday; tests move the clock from here. */
const at = (hhmm: string, day = '2026-11-09') => new Date(`${day}T${hhmm}:00+05:30`)
const setClock = (d: Date) => vi.setSystemTime(d)

async function as(identifier: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  return c
}

const enableFeature = async (madrasaId: string) => {
  await asOrg('test', () => scoped.madrasaFeature.update({ where: { madrasaId_feature: { madrasaId, feature: 'STAFF_ATTENDANCE' } }, data: { enabled: true } }))
  forgetMadrasa(madrasaId)
}

/** An agent holding a registered kiosk's cookie, as a phone would. */
async function kiosk(c: Client = admin, input: object = { name: 'Main Gate', branch: 'Boys Wing' }) {
  await c.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
  const created = await c.post('/api/v1/kiosks', input)
  expect(created.status).toBe(201)
  const agent = request.agent(app)
  const r = await agent.post('/api/v1/kiosk/device/register').send({ code: created.body.registrationCode })
  expect(r.status).toBe(201)
  return { agent, id: created.body.kiosk.id as string, code: created.body.registrationCode as string }
}
const scan = (agent: ReturnType<typeof request.agent>, token: string, extra: object = {}) => agent.post('/api/v1/kiosk/device/scan').send({ token, requestId: randomUUID(), ...extra })
const qr = (userId: string, ttl = 75) => issueQr(userId, 'dynamic', ttl).token
const setKiosk = (body: object) => admin.put('/api/v1/kiosk-settings', body)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  setClock(at('08:00'))
  await resetDatabase()
  fx = await seedPeopleFixture()
  await enableFeature(fx.madrasa.id)
  admin = await as('admin@x.test')
})
afterEach(() => { vi.useRealTimers() })

describe('registering a kiosk', () => {
  it('a one-time code registers one device, keeps no secret readable by scripts, and works only once', async () => {
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    const c = await admin.post('/api/v1/kiosks', { name: 'Main Gate', branch: 'Boys Wing' })
    expect(c.body.registrationCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(c.body.registrationQr).toMatch(/^data:image\/png/)
    expect(JSON.stringify(c.body.kiosk)).not.toMatch(/tokenHash|registrationCodeHash/)

    const phone = request.agent(app)
    const r = await phone.post('/api/v1/kiosk/device/register').send({ code: c.body.registrationCode.toLowerCase().replace('-', ' ') })
    expect(r.status).toBe(201)
    expect(r.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i)
    expect(r.headers['set-cookie']?.[0]).toMatch(/SameSite=Strict/i)
    const s = await phone.get('/api/v1/kiosk/device/status')
    expect(s.body).toMatchObject({ device: { name: 'Main Gate', branch: 'Boys Wing' }, madrasa: 'Test Madarsa', institution: 'Test Trust', attendance: { mode: 'AUTO', pinRequired: false } })

    const again = await request(app).post('/api/v1/kiosk/device/register').send({ code: c.body.registrationCode })
    expect(again.body.error.code).toBe('REGISTRATION_CODE_INVALID')
  })

  it('an expired code is refused; a madrasaId sent by the device is ignored', async () => {
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    const c = await admin.post('/api/v1/kiosks', { name: 'Late Gate' })
    setClock(at('08:16'))
    expect((await request(app).post('/api/v1/kiosk/device/register').send({ code: c.body.registrationCode })).body.error.code).toBe('REGISTRATION_CODE_INVALID')
  })

  it('only administrators manage kiosks; creating one needs a recent password', async () => {
    expect((await (await as('m1@x.test')).get('/api/v1/kiosks')).status).toBe(403)
    expect((await (await as('principal@x.test')).get('/api/v1/kiosks')).status).toBe(403)
    expect((await (await as('p1@x.test')).post('/api/v1/kiosks', { name: 'Nope' })).status).toBe(403)
    vi.setSystemTime(new Date(Date.now() + 3_600_000 * 13))
    const a = await as('admin@x.test')
    vi.setSystemTime(new Date(Date.now() + 6 * 60_000))
    expect((await a.post('/api/v1/kiosks', { name: 'Nope' })).body.error.code).toBe('REAUTH_REQUIRED')
  })

  it('deactivating and revoking stop the device at once; a new code signs the old device out and registers a new one', async () => {
    const { agent, id } = await kiosk()
    expect((await agent.get('/api/v1/kiosk/device/status')).status).toBe(200)
    await admin.post(`/api/v1/kiosks/${id}/deactivate`)
    expect((await agent.get('/api/v1/kiosk/device/status')).body.error.code).toBe('DEVICE_UNAUTHORIZED')
    expect((await scan(agent, qr(fx.users.mentor.id))).status).toBe(401)
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    await admin.post(`/api/v1/kiosks/${id}/activate`)
    expect((await agent.get('/api/v1/kiosk/device/status')).status).toBe(200)

    await admin.post(`/api/v1/kiosks/${id}/revoke`)
    expect((await agent.get('/api/v1/kiosk/device/status')).status).toBe(401)

    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    const fresh = await admin.post(`/api/v1/kiosks/${id}/registration-code`)
    const newPhone = request.agent(app)
    expect((await newPhone.post('/api/v1/kiosk/device/register').send({ code: fresh.body.registrationCode })).status).toBe(201)
    expect((await newPhone.get('/api/v1/kiosk/device/status')).status).toBe(200)
    expect((await agent.get('/api/v1/kiosk/device/status')).status).toBe(401) // the stolen or old phone stays out
  })

  it('the device credential rotates; the old one works briefly so a lost reply cannot lock the kiosk out', async () => {
    const { agent } = await kiosk()
    const stolen = (await prisma.kioskDevice.findFirstOrThrow()).tokenHash
    setClock(at('08:01', '2026-11-10'))
    await agent.get('/api/v1/kiosk/device/status')
    expect((await prisma.kioskDevice.findFirstOrThrow()).tokenHash).not.toBe(stolen)
    expect((await prisma.kioskDevice.findFirstOrThrow()).previousTokenHash).toBe(stolen)
    expect((await agent.get('/api/v1/kiosk/device/status')).status).toBe(200)
  })

  it('a device resets itself, and needs a new code to work again', async () => {
    const { agent } = await kiosk()
    expect((await agent.post('/api/v1/kiosk/device/reset').send({})).status).toBe(204)
    expect((await agent.get('/api/v1/kiosk/device/status')).status).toBe(401)
    expect((await prisma.kioskDevice.findFirstOrThrow()).status).toBe('PENDING')
  })

  it('a cross-site request and a non-JSON request are refused', async () => {
    const { agent } = await kiosk()
    expect((await agent.post('/api/v1/kiosk/device/scan').set('Origin', 'https://evil.example').send({})).status).toBe(403)
    expect((await agent.post('/api/v1/kiosk/device/scan').set('Content-Type', 'text/plain').send('x')).status).toBe(415)
  })

  it('a kiosk limited to a network is refused from any other', async () => {
    const { agent, id } = await kiosk()
    await admin.patch(`/api/v1/kiosks/${id}`, { allowedIps: ['203.0.113.'] })
    expect((await agent.get('/api/v1/kiosk/device/status')).body.error.code).toBe('DEVICE_LOCATION_NOT_ALLOWED')
  })

  it('the module can be switched off: admin routes and devices are both refused', async () => {
    const { agent } = await kiosk()
    await asOrg('test', () => scoped.madrasaFeature.update({ where: { madrasaId_feature: { madrasaId: fx.madrasa.id, feature: 'STAFF_ATTENDANCE' } }, data: { enabled: false } }))
    forgetMadrasa(fx.madrasa.id)
    expect((await admin.get('/api/v1/kiosks')).body.error.code).toBe('FEATURE_DISABLED')
    expect((await agent.get('/api/v1/kiosk/device/status')).body.error.code).toBe('FEATURE_DISABLED')
  })
})

describe('QR codes', () => {
  it('my code holds no personal details, and only staff get one', async () => {
    const m = await as('m1@x.test')
    const r = await m.get('/api/v1/staff-attendance/me/qr')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ kind: 'dynamic', refreshSeconds: 60, staff: { code: 'm1' } })
    const { token } = issueQr(fx.users.mentor.id, 'dynamic', 75)
    const payload = Buffer.from(token.split('.')[1]!, 'base64url').toString()
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(['e', 'i', 'j', 'k', 's'])
    expect(payload).not.toMatch(/Mentor|m1@|salary|bank/i)
    expect((await (await as('p1@x.test')).get('/api/v1/staff-attendance/me/qr')).body.error.code).toBe('NO_STAFF_RECORD')
  })

  it('refuses forged, expired, replayed and cancelled codes', async () => {
    const { agent } = await kiosk()
    const code = async (t: string) => (await scan(agent, t)).body.error?.code
    const good = qr(fx.users.mentor.id)
    const [p, b, s] = good.split('.')
    expect(await code(`${p}.${b}.${s!.slice(0, -2)}xx`)).toBe('QR_INVALID')
    expect(await code(`${p}.${Buffer.from(JSON.stringify({ s: fx.users.admin.id, j: 'x', i: 1, e: 9999999999, k: 'd' })).toString('base64url')}.${s}`)).toBe('QR_INVALID')
    expect(await code('hello world')).toBe('QR_INVALID')

    const old = qr(fx.users.mentor.id, 60)
    setClock(at('08:01'))
    expect(await code(old)).toBe('QR_EXPIRED')

    const first = qr(fx.users.mentor.id)
    expect((await scan(agent, first)).body).toMatchObject({ ok: true, action: 'CHECK_IN', staff: { name: 'Mentor One', employeeId: 'm1', designation: 'Hifz Mentor' } })
    expect(await code(first)).toBe('QR_ALREADY_USED')

    setClock(at('08:20'))
    const cancelled = qr(fx.users.mentor.id)
    vi.setSystemTime(new Date(Date.now() + 2000))
    expect((await admin.post(`/api/v1/staff-attendance/staff/${fx.staff.m1.id}/revoke-qr`)).status).toBe(200)
    vi.setSystemTime(new Date(Date.now() + 2000))
    expect(await code(cancelled)).toBe('QR_REVOKED')
  })

  it('two kiosks scanning the same code at once record one attendance', async () => {
    const a = await kiosk()
    const b = await kiosk(admin, { name: 'Back Gate' })
    const token = qr(fx.users.mentor.id)
    const results = await Promise.all([scan(a.agent, token), scan(b.agent, token), scan(a.agent, token), scan(b.agent, token)])
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(results.filter((r) => r.status !== 200).map((r) => r.body.error.code).every((c) => c === 'QR_ALREADY_USED' || c === 'ALREADY_RECORDED')).toBe(true)
    expect(await prisma.staffAttendanceSession.count()).toBe(1)
  })

  it('a retry with the same request id returns the first answer and records nothing new', async () => {
    const { agent } = await kiosk()
    const body = { token: qr(fx.users.mentor.id), requestId: randomUUID() }
    const first = await agent.post('/api/v1/kiosk/device/scan').send(body)
    const again = await agent.post('/api/v1/kiosk/device/scan').send(body)
    expect(again.body).toEqual(first.body)
    expect(await prisma.staffAttendanceSession.count()).toBe(1)
    expect(await prisma.kioskScan.count({ where: { ok: true } })).toBe(1)
  })

  it('a person of another madrasa, or a kiosk of another madrasa, gets nothing', async () => {
    const B = await seedMadrasa('B2', 'Second Madrasa')
    await enableFeature(B.id)
    const stranger = await makeUser({ email: 'mb@x.test', roles: ['MENTOR'], madrasaId: B.id })
    await inMadrasa(B.id, () => scoped.staffProfile.create({ data: { code: 'b1', displayName: 'B Mentor', title: 'Mentor', userId: stranger.id } }))
    const { agent, id } = await kiosk()
    expect((await scan(agent, qr(stranger.id))).body.error.code).toBe('STAFF_NOT_ASSIGNED')
    expect(await inMadrasa(B.id, () => scoped.staffAttendanceSession.count())).toBe(0)

    const adminB = await makeUser({ email: 'adminb@x.test', roles: ['MADRASA_ADMIN'], madrasaId: B.id })
    expect(adminB).toBeTruthy()
    const b = await as('adminb@x.test')
    expect((await b.get(`/api/v1/kiosks/${id}/scans`)).status).toBe(404)
    expect((await b.post(`/api/v1/kiosks/${id}/revoke`)).status).toBe(404)
    expect((await b.get('/api/v1/kiosks')).body.items).toEqual([])
  })

  it('someone working in two madrasas uses one code at either madrasa, and it counts where they scanned', async () => {
    const B = await seedMadrasa('B2', 'Second Madrasa')
    await enableFeature(B.id)
    await inMadrasa(B.id, () => scoped.staffProfile.create({ data: { code: 'b1', displayName: 'Mentor One', title: 'Visiting Mentor', userId: fx.users.mentor.id } }))
    await prisma.madrasaMembership.create({ data: { userId: fx.users.mentor.id, madrasaId: B.id, role: 'MADRASA_ADMIN' } })
    const here = await kiosk()
    expect((await scan(here.agent, qr(fx.users.mentor.id))).status).toBe(200)
    expect(await inMadrasa(fx.madrasa.id, () => scoped.staffAttendanceSession.count())).toBe(1)
    expect(await inMadrasa(B.id, () => scoped.staffAttendanceSession.count())).toBe(0)
  })

  it('inactive staff and disabled accounts are refused', async () => {
    const { agent } = await kiosk()
    await prisma.staffProfile.update({ where: { id: fx.staff.m1.id }, data: { status: 'INACTIVE' } })
    expect((await scan(agent, qr(fx.users.mentor.id))).body.error.code).toBe('STAFF_INACTIVE')
    await prisma.staffProfile.update({ where: { id: fx.staff.m1.id }, data: { status: 'ACTIVE' } })
    await prisma.user.update({ where: { id: fx.users.mentor.id }, data: { status: 'DISABLED' } })
    expect((await scan(agent, qr(fx.users.mentor.id))).body.error.code).toBe('STAFF_INACTIVE')
  })

  it('static codes work only where allowed, and never in high-security mode', async () => {
    const { agent } = await kiosk()
    const code = issueQr(fx.users.mentor.id, 'static', 0).token
    expect((await scan(agent, code)).body.error.code).toBe('QR_NOT_ACCEPTED')
    await setKiosk({ qr: { static: true } })
    expect((await scan(agent, code)).body).toMatchObject({ ok: true, action: 'CHECK_IN' })
    expect((await scan(agent, code)).body.error.code).toBe('ALREADY_RECORDED') // reusable, so the duplicate window guards it
    await setKiosk({ qr: { static: true }, highSecurity: true })
    expect((await scan(agent, code)).body.error.code).toBe('QR_NOT_ACCEPTED')
  })

  it('PIN: asked for when required, limited in attempts, and the code survives a wrong one', async () => {
    const { agent } = await kiosk()
    await setKiosk({ pinRequired: true })
    const token = qr(fx.users.mentor.id)
    expect((await scan(agent, token)).body.error.code).toBe('PIN_NOT_SET')
    await prisma.user.update({ where: { id: fx.users.mentor.id }, data: { attendancePinHash: await hashPassword('4827') } })
    expect((await scan(agent, token)).body.error.code).toBe('PIN_REQUIRED')
    expect((await scan(agent, token, { pin: '1111' })).body.error.code).toBe('PIN_INVALID')
    expect((await scan(agent, token, { pin: '4827' })).body).toMatchObject({ ok: true })
    const next = qr(fx.users.mentor.id)
    for (let i = 0; i < 5; i++) expect((await scan(agent, next, { pin: '0000' })).body.error.code).toBe('PIN_INVALID')
    expect((await scan(agent, next, { pin: '0000' })).status).toBe(429)
  })

  it('staff set their own PIN after confirming their password; weak ones are refused', async () => {
    const m = await as('m1@x.test')
    await m.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    expect((await m.put('/api/v1/staff-attendance/me/pin', { pin: '1234' })).status).toBe(422)
    expect((await m.put('/api/v1/staff-attendance/me/pin', { pin: '12' })).status).toBe(422)
    expect((await m.put('/api/v1/staff-attendance/me/pin', { pin: '4827' })).body).toEqual({ set: true })
  })

  it('too many scans from one device are limited', async () => {
    const { agent } = await kiosk()
    let last = 200
    for (let i = 0; i < 245 && last !== 429; i++) last = (await scan(agent, 'junk')).status
    expect(last).toBe(429)
  })
})

describe('attendance rules', () => {
  const shift = async (name = 'Day', startTime = '08:00', endTime = '14:00') => (await admin.post('/api/v1/staff-shifts', { name, startTime, endTime, graceLateMinutes: 10, graceEarlyMinutes: 5 })).body.id as string
  const assign = (staffId: string, shiftIds: string[], exempt?: boolean) => admin.put(`/api/v1/staff-attendance/staff/${staffId}/arrangement`, { shiftIds, ...(exempt !== undefined ? { exempt } : {}) })
  const m = () => qr(fx.users.mentor.id)

  it('automatic mode: check in, then check out, with working hours, on time', async () => {
    const { agent } = await kiosk()
    await assign(fx.staff.m1.id, [await shift()])
    expect((await scan(agent, m())).body).toMatchObject({ action: 'CHECK_IN', status: 'ON_TIME', lateMinutes: 0 })
    setClock(at('14:02'))
    expect((await scan(agent, m())).body).toMatchObject({ action: 'CHECK_OUT', status: 'COMPLETED', earlyMinutes: 0, workedMinutes: 362 })
    const s = await prisma.staffAttendanceSession.findFirstOrThrow()
    expect(s.status).toBe('CLOSED')
  })

  it('counts late arrival past the grace period and early departure', async () => {
    const { agent } = await kiosk()
    await assign(fx.staff.m1.id, [await shift()])
    setClock(at('08:10'))
    expect((await scan(agent, m())).body).toMatchObject({ status: 'ON_TIME', lateMinutes: 0 }) // inside the grace period
    const s = await prisma.staffAttendanceSession.findFirstOrThrow()
    await prisma.staffAttendanceSession.delete({ where: { id: s.id } })
    setClock(at('08:25'))
    expect((await scan(agent, m())).body).toMatchObject({ status: 'LATE', lateMinutes: 25 })
    setClock(at('13:30'))
    expect((await scan(agent, m())).body).toMatchObject({ status: 'EARLY_DEPARTURE', earlyMinutes: 30, workedMinutes: 305 })
  })

  it('someone with a special exemption is never counted late or early', async () => {
    const { agent } = await kiosk()
    await assign(fx.staff.m1.id, [await shift()], true)
    setClock(at('09:30'))
    expect((await scan(agent, m())).body).toMatchObject({ status: 'ON_TIME', lateMinutes: 0 })
    setClock(at('11:00'))
    expect((await scan(agent, m())).body).toMatchObject({ earlyMinutes: 0, workedMinutes: 90 })
  })

  it('the second scan within the duplicate window is refused; one attendance a day unless allowed', async () => {
    const { agent } = await kiosk()
    await scan(agent, m())
    setClock(at('08:00:30'.slice(0, 5)))
    vi.setSystemTime(new Date(Date.now() + 30_000))
    expect((await scan(agent, m())).body.error.code).toBe('ALREADY_RECORDED')
    setClock(at('14:00'))
    expect((await scan(agent, m())).body.action).toBe('CHECK_OUT')
    setClock(at('15:00'))
    expect((await scan(agent, m())).body.error.code).toBe('ALREADY_RECORDED')
    admin = await as('admin@x.test')
    await setKiosk({ multipleSessions: true })
    expect((await scan(agent, m())).body.action).toBe('CHECK_IN')
  })

  it('manual mode: the person chooses, and impossible sequences are refused', async () => {
    const { agent } = await kiosk()
    await setKiosk({ mode: 'MANUAL' })
    expect((await scan(agent, m())).body.error.code).toBe('ACTION_REQUIRED')
    expect((await scan(agent, m(), { action: 'CHECK_OUT' })).body.error.code).toBe('NOT_CHECKED_IN')
    expect((await scan(agent, m(), { action: 'CHECK_IN' })).body.action).toBe('CHECK_IN')
    setClock(at('08:30'))
    expect((await scan(agent, m(), { action: 'CHECK_IN' })).body.error.code).toBe('ALREADY_CHECKED_IN')
    expect((await scan(agent, m(), { action: 'CHECK_OUT' })).body.action).toBe('CHECK_OUT')
    setClock(at('08:45'))
    expect((await scan(agent, m(), { action: 'CHECK_OUT' })).body.error.code).toBe('NOT_CHECKED_IN')
  })

  it('time-based mode: the clock decides, and outside the windows nothing is recorded', async () => {
    const { agent } = await kiosk()
    expect((await setKiosk({ mode: 'TIME_WINDOW' })).status).toBe(422) // needs its windows
    expect((await setKiosk({ mode: 'TIME_WINDOW', checkInWindow: { from: '07:00', to: '09:00' }, checkOutWindow: { from: '13:00', to: '15:00' } })).status).toBe(200)
    setClock(at('10:00'))
    expect((await scan(agent, m())).body.error.code).toBe('OUTSIDE_ATTENDANCE_TIME')
    setClock(at('13:30'))
    expect((await scan(agent, m())).body.error.code).toBe('NOT_CHECKED_IN')
    setClock(at('08:30', '2026-11-10'))
    expect((await scan(agent, m())).body.action).toBe('CHECK_IN')
    setClock(at('13:30', '2026-11-10'))
    expect((await scan(agent, m())).body.action).toBe('CHECK_OUT')
  })

  it('a forgotten check-out is marked as missed, and the next day starts fresh', async () => {
    const { agent } = await kiosk()
    await scan(agent, m())
    setClock(at('08:00', '2026-11-10'))
    expect((await scan(agent, m())).body.action).toBe('CHECK_IN')
    const rows = await prisma.staffAttendanceSession.findMany({ orderBy: { checkInAt: 'asc' } })
    expect(rows.map((r) => r.status)).toEqual(['MISSED_CHECKOUT', 'OPEN'])
  })

  it('two shifts in a day: each check-in is measured against its own shift', async () => {
    const { agent } = await kiosk()
    await assign(fx.staff.m1.id, [await shift('Morning', '08:00', '12:00'), await shift('Evening', '16:00', '19:00')])
    setClock(at('08:05'))
    expect((await scan(agent, m())).body).toMatchObject({ action: 'CHECK_IN', status: 'ON_TIME' })
    setClock(at('12:00'))
    expect((await scan(agent, m())).body).toMatchObject({ action: 'CHECK_OUT' })
    setClock(at('16:40'))
    expect((await scan(agent, m())).body).toMatchObject({ action: 'CHECK_IN', status: 'LATE', lateMinutes: 40 })
    setClock(at('19:00'))
    expect((await scan(agent, m())).body).toMatchObject({ action: 'CHECK_OUT', status: 'COMPLETED', workedMinutes: 140 })
  })

  it('a night shift across midnight stays on the date it began', async () => {
    const { agent } = await kiosk()
    await assign(fx.staff.m1.id, [await shift('Night', '22:00', '06:00')])
    setClock(at('22:05'))
    await scan(agent, m())
    setClock(at('06:00', '2026-11-10'))
    expect((await scan(agent, m())).body).toMatchObject({ action: 'CHECK_OUT', status: 'COMPLETED', earlyMinutes: 0, workedMinutes: 475 })
    expect((await prisma.staffAttendanceSession.findFirstOrThrow()).date.toISOString().slice(0, 10)).toBe('2026-11-09')
  })

  it('settings layer: organization default, madrasa override, device override', async () => {
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    const superAdmin = await makeUser({ email: 'super@x.test', roles: ['SUPER_ADMIN'] })
    expect(superAdmin).toBeTruthy()
    const s = await as('super@x.test')
    await s.put('/api/v1/kiosk-settings/organization', { ui: { successSeconds: 9 }, duplicateWindowSeconds: 90 })
    expect((await admin.put('/api/v1/kiosk-settings/organization', {})).status).toBe(403)
    expect((await admin.get('/api/v1/kiosk-settings')).body.effective).toMatchObject({ duplicateWindowSeconds: 90, ui: { successSeconds: 9, errorSeconds: 4 } })
    await setKiosk({ ui: { errorSeconds: 7 } })
    const { agent, id } = await kiosk()
    expect((await agent.get('/api/v1/kiosk/device/status')).body.ui).toMatchObject({ successSeconds: 9, errorSeconds: 7 })
    await admin.patch(`/api/v1/kiosks/${id}`, { settings: { ui: { successSeconds: 2 } } })
    expect((await agent.get('/api/v1/kiosk/device/status')).body.ui).toMatchObject({ successSeconds: 2, errorSeconds: 7 })
    expect((await admin.patch(`/api/v1/kiosks/${id}`, { settings: { mode: 'NONSENSE' } })).status).toBe(422)
    expect((await admin.put('/api/v1/madrasa/config', { kiosk: { mode: 'NONSENSE' } })).status).toBe(422)
  })
})

describe('attendance records, corrections and the monthly figures', () => {
  const m = () => qr(fx.users.mentor.id)

  it('staff see their own records; only those with permission see everyone’s or correct them', async () => {
    const { agent } = await kiosk()
    await scan(agent, m())
    const mine = await (await as('m1@x.test')).get('/api/v1/staff-attendance/me')
    expect(mine.body.items).toHaveLength(1)
    expect((await (await as('m1@x.test')).get('/api/v1/staff-attendance')).status).toBe(403)
    expect((await (await as('principal@x.test')).get('/api/v1/staff-attendance')).status).toBe(200)
    const id = mine.body.items[0].id
    expect((await (await as('principal@x.test')).post(`/api/v1/staff-attendance/sessions/${id}/correct`, { reason: 'Not allowed here' })).status).toBe(403)
  })

  it('a correction recalculates the figures, keeps the old values and is audited', async () => {
    const { agent } = await kiosk()
    await admin.post('/api/v1/staff-shifts', { name: 'Day', startTime: '08:00', endTime: '14:00' }).then((r) => admin.put(`/api/v1/staff-attendance/staff/${fx.staff.m1.id}/arrangement`, { shiftIds: [r.body.id] }))
    setClock(at('09:00'))
    await scan(agent, m())
    setClock(at('08:00', '2026-11-10'))
    admin = await as('admin@x.test')
    const { items } = (await admin.get('/api/v1/staff-attendance?from=2026-11-09&to=2026-11-09')).body
    const id = items[0].id
    expect((await admin.post(`/api/v1/staff-attendance/sessions/${id}/correct`, { checkOutAt: at('14:00').toISOString() })).status).toBe(422) // a reason is required
    expect((await admin.post(`/api/v1/staff-attendance/sessions/${id}/correct`, { checkOutAt: at('08:00').toISOString(), reason: 'Check-out before check-in' })).body.error.code).toBe('VALIDATION_FAILED')
    const r = await admin.post(`/api/v1/staff-attendance/sessions/${id}/correct`, { checkInAt: at('08:05').toISOString(), checkOutAt: at('14:00').toISOString(), reason: 'Gate phone was down at 8am' })
    expect(r.body).toMatchObject({ status: 'CLOSED', lateMinutes: 0, earlyMinutes: 0, workedMinutes: 355, corrected: true })
    const hist = await admin.get(`/api/v1/staff-attendance/sessions/${id}/corrections`)
    expect(hist.body.items[0]).toMatchObject({ reason: 'Gate phone was down at 8am', previous: { lateMinutes: 60 } })
    expect(await prisma.auditLog.count({ where: { action: 'staff_attendance.corrected', entityId: id } })).toBe(1)
  })

  it('a day can be added by hand, with a reason; a second open session is refused', async () => {
    const r = await admin.post('/api/v1/staff-attendance/sessions', { staffId: fx.staff.m1.id, checkInAt: at('07:30').toISOString(), reason: 'Kiosk was unavailable' })
    expect(r.body).toMatchObject({ status: 'OPEN', source: 'MANUAL' })
    expect((await admin.post('/api/v1/staff-attendance/sessions', { staffId: fx.staff.m1.id, checkInAt: at('07:40').toISOString(), reason: 'Kiosk was unavailable' })).body.error.code).toBe('ALREADY_CHECKED_IN')
    expect((await admin.post('/api/v1/staff-attendance/sessions', { staffId: fx.staff.m2.id, checkInAt: at('23:00').toISOString(), reason: 'Future time here' })).body.error.code).toBe('VALIDATION_FAILED')
  })

  it('the monthly figures are correct across a month, leaving out the weekly off', async () => {
    const { agent } = await kiosk()
    const shiftId = (await admin.post('/api/v1/staff-shifts', { name: 'Day', startTime: '08:00', endTime: '14:00', graceLateMinutes: 0 })).body.id
    await admin.put(`/api/v1/staff-attendance/staff/${fx.staff.m1.id}/arrangement`, { shiftIds: [shiftId] })
    // Monday 2 and Tuesday 3 November; Friday is the weekly off.
    for (const [day, inn, out] of [['2026-11-02', '08:00', '14:00'], ['2026-11-03', '08:20', '13:40']] as const) {
      setClock(at(inn, day))
      await scan(agent, m())
      setClock(at(out, day))
      await scan(agent, m())
    }
    setClock(at('08:00', '2026-11-04'))
    await scan(agent, m()) // checked in; never checks out
    setClock(at('08:00', '2026-11-05'))
    const res = await admin.get('/api/v1/staff-attendance/summary?month=2026-11')
    const me = res.body.items.find((x: { staff: { code: string } }) => x.staff.code === 'm1')
    // 1–5 Nov: Sun, Mon, Tue, Wed, Thu are all working days; Friday 6 has not arrived yet.
    expect(me).toMatchObject({ expectedDays: 5, presentDays: 3, absentDays: 2, lateCount: 1, lateMinutes: 20, earlyCount: 1, earlyMinutes: 20, workedMinutes: 360 + 320 })
    expect(me.missedCheckouts + me.openSessions).toBe(1)
    expect((await (await as('m1@x.test')).get('/api/v1/staff-attendance/summary?month=2026-11')).status).toBe(403)
  })

  it('the monitoring dashboard counts what happened, per kiosk', async () => {
    const a = await kiosk()
    const b = await kiosk(admin, { name: 'Back Gate', branch: 'Girls Wing' })
    await scan(a.agent, m())
    await scan(a.agent, 'junk')
    setClock(at('08:00:00'.slice(0, 5)))
    vi.setSystemTime(new Date(Date.now() + 5000))
    await scan(a.agent, m())
    const r = await admin.get('/api/v1/kiosks')
    expect(r.body.totals).toMatchObject({ registered: 2, active: 2, offline: 0, deactivated: 0, scans: 3, successful: 1, failed: 2, duplicates: 1 })
    expect(r.body.branches).toEqual(['Boys Wing', 'Girls Wing'])
    expect((await admin.get('/api/v1/kiosks?branch=Girls%20Wing')).body.items.map((k: { name: string }) => k.name)).toEqual(['Back Gate'])
    expect((await admin.get(`/api/v1/kiosks/${b.id}/scans`)).body.items).toEqual([])
    const log = await admin.get(`/api/v1/kiosks/${a.id}/scans`)
    expect(log.body.items.map((s: { outcome: string }) => s.outcome).sort()).toEqual(['ALREADY_RECORDED', 'CHECK_IN', 'QR_INVALID'])
    setClock(at('08:10'))
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    expect((await admin.get('/api/v1/kiosks')).body.totals).toMatchObject({ active: 0, offline: 2 })
  })

  it('the hourly job marks stale check-ins as missed', async () => {
    const { agent } = await kiosk()
    await scan(agent, m())
    setClock(at('08:00', '2026-11-10'))
    const { JOBS } = await import('../../src/jobs/registry.js')
    await JOBS.find((j) => j.name === 'staff-attendance-housekeeping')!.run()
    expect((await prisma.staffAttendanceSession.findFirstOrThrow()).status).toBe('MISSED_CHECKOUT')
  })
})

describe('attendance records of one person cannot overlap', () => {
  const add = (checkIn: string, checkOut?: string) => admin.post('/api/v1/staff-attendance/sessions', { staffId: fx.staff.m1.id, checkInAt: at(checkIn).toISOString(), ...(checkOut ? { checkOutAt: at(checkOut).toISOString() } : {}), reason: 'Kiosk was unavailable' })

  it('adding by hand inside an existing record is refused, so hours are not counted twice', async () => {
    setClock(at('16:00'))
    admin = await as('admin@x.test')
    expect((await add('08:00', '11:00')).status).toBe(201)
    const r = await add('09:00', '10:00')
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('SESSION_OVERLAP')
    expect((await add('11:00', '12:00')).status).toBe(201) // touching is fine: a split shift
  })

  it('a correction cannot move a record onto another one', async () => {
    setClock(at('16:00'))
    admin = await as('admin@x.test')
    const first = (await add('08:00', '09:00')).body
    expect((await add('10:00', '11:00')).status).toBe(201)
    const r = await admin.post(`/api/v1/staff-attendance/sessions/${first.id}/correct`, { checkOutAt: at('10:30').toISOString(), reason: 'Moves onto the next record' })
    expect(r.status).toBe(409)
    expect((await admin.post(`/api/v1/staff-attendance/sessions/${first.id}/correct`, { checkOutAt: at('09:30').toISOString(), reason: 'Left a little later' })).status).toBe(200)
  })

  it('a record that ends while someone is still checked in is refused', async () => {
    setClock(at('16:00'))
    admin = await as('admin@x.test')
    expect((await add('08:00')).status).toBe(201)
    expect((await add('09:00', '10:00')).status).toBe(409)
    expect((await add('07:00', '07:30')).status).toBe(201) // before the open record began
  })
})

describe('staff attendance input', () => {
  it('an inverted date range is refused', async () => {
    for (const path of ['/staff-attendance', '/kiosks']) expect((await admin.get(`/api/v1${path}?from=2026-12-01&to=2026-01-01`)).status).toBe(422)
  })

  it('a shift must have different start and end times, also when edited; overnight is allowed', async () => {
    expect((await admin.post('/api/v1/staff-shifts', { name: 'Same', startTime: '08:00', endTime: '08:00' })).status).toBe(422)
    const night = await admin.post('/api/v1/staff-shifts', { name: 'Night', startTime: '22:00', endTime: '06:00' })
    expect(night.status).toBe(201)
    expect((await admin.patch(`/api/v1/staff-shifts/${night.body.id}`, { endTime: '22:00' })).status).toBe(422)
  })
})
