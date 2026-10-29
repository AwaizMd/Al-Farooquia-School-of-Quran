import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { failNextMail, testOutbox } from '../../src/integrations/mail/mailer.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, makeUser, nextCode, reauth, secretFrom, signInEnrolled, tick, type Client } from '../helpers/auth.js'

beforeEach(async () => {
  await resetDatabase()
  await prisma.mfaPolicy.createMany({
    data: [
      { role: 'ADMIN', required: true }, { role: 'PRINCIPAL', required: true }, { role: 'MENTOR', required: true },
      { role: 'STUDENT', required: false }, { role: 'PARENT', required: false }, { role: 'WARDEN', required: false },
    ],
  })
  testOutbox.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date())
})
afterEach(() => {
  vi.useRealTimers()
})

async function adminSession(): Promise<{ c: Client; secret: string }> {
  await makeUser({ email: 'admin@x.test', roles: ['ADMIN'], name: 'Admin' })
  await makeUser({ email: 'admin2@x.test', roles: ['ADMIN'], name: 'Second Admin' })
  const c = client()
  const { secret } = await signInEnrolled(c, 'admin@x.test')
  return { c, secret }
}

async function enrolledMentor() {
  const u = await makeUser({ email: 'mentor@x.test', roles: ['MENTOR'], name: 'Qari Mentor' })
  const c = client()
  const { secret } = await signInEnrolled(c, 'mentor@x.test')
  return { user: u, c, secret }
}

const linkToken = (text: string) => /token=([\w-]+)/.exec(text)?.[1]

describe('administrative MFA reset (lost authenticator)', () => {
  it('is refused without permission and without recent re-authentication', async () => {
    const { user } = await enrolledMentor()
    await makeUser({ email: 'principal@x.test', roles: ['PRINCIPAL'] })
    const p = client()
    await signInEnrolled(p, 'principal@x.test')
    const denied = await p.post(`/api/v1/admin/users/${user.id}/mfa/reset`, { reason: 'Lost phone', method: 'EMAIL_LINK' })
    expect(denied.status).toBe(403)
    expect(denied.body.error.code).toBe('FORBIDDEN')

    const { c } = await adminSession()
    tick(6 * 60)
    const stale = await c.post(`/api/v1/admin/users/${user.id}/mfa/reset`, { reason: 'Lost phone', method: 'EMAIL_LINK' })
    expect(stale.body.error.code).toBe('REAUTH_REQUIRED')
    expect(await prisma.mfaCredential.count({ where: { userId: user.id, status: 'ACTIVE' } })).toBe(1)
  })

  it('revokes the old authenticator and sessions, and recovers only with link + password + new device', async () => {
    const mentor = await enrolledMentor()
    const { c: admin, secret: adminSecret } = await adminSession()
    await reauth(admin, adminSecret)

    const reset = await admin.post(`/api/v1/admin/users/${mentor.user.id}/mfa/reset`, { reason: 'Phone stolen, reported in person', method: 'EMAIL_LINK' })
    expect(reset.status).toBe(200)
    expect(reset.body).toMatchObject({ revokedCredentials: 1, revokedSessions: 1, notification: 'sent' })
    expect(reset.body.inPersonTicket).toBeUndefined()

    // The mentor's existing session is gone and the old device is useless.
    expect((await mentor.c.get('/api/v1/auth/session')).status).toBe(401)
    expect(await prisma.mfaCredential.count({ where: { userId: mentor.user.id, status: 'ACTIVE' } })).toBe(0)

    // Password alone no longer gets in (blocks an attacker who knows the password).
    const blocked = await client().post('/api/v1/auth/login', { identifier: 'mentor@x.test', password: PASSWORD })
    expect(blocked.body.error.code).toBe('MFA_RECOVERY_REQUIRED')

    // The email carries a single-use link, never a secret or QR payload.
    const mail = testOutbox.find((m) => m.to === 'mentor@x.test' && /reset/.test(m.subject))!
    expect(mail.text).not.toMatch(/otpauth|secret=|data:image/i)
    const token = linkToken(mail.text)!

    // A wrong password does not consume the link.
    const r = client()
    expect((await r.post('/api/v1/auth/mfa/recovery/start', { token, identifier: 'mentor@x.test', password: 'wrong password!' })).status).toBe(401)
    const start = await r.post('/api/v1/auth/mfa/recovery/start', { token, identifier: 'mentor@x.test', password: PASSWORD })
    expect(start.body.stage).toBe('mfa_enrollment_required')
    expect((await r.get('/api/v1/auth/sessions')).status).toBe(403) // still enrollment-only

    const fresh = secretFrom((await r.post('/api/v1/auth/mfa/enrollment')).body)
    expect(fresh).not.toBe(mentor.secret)
    const done = await r.post('/api/v1/auth/mfa/enrollment/confirm', { code: nextCode(fresh) })
    expect(done.body.session.stage).toBe('full')
    expect(testOutbox.some((m) => m.to === 'mentor@x.test' && /recovery completed/.test(m.subject))).toBe(true)

    // Link is single-use; old authenticator codes fail; new ones work.
    expect((await client().post('/api/v1/auth/mfa/recovery/start', { token, identifier: 'mentor@x.test', password: PASSWORD })).status).toBe(400)
    tick()
    const later = client()
    await later.post('/api/v1/auth/login', { identifier: 'mentor@x.test', password: PASSWORD })
    expect((await later.post('/api/v1/auth/mfa/verify', { code: nextCode(mentor.secret) })).status).toBe(400)
    expect((await later.post('/api/v1/auth/mfa/verify', { code: nextCode(fresh) })).body.stage).toBe('full')

    const actions = (await prisma.auditLog.findMany({ where: { entityId: mentor.user.id }, orderBy: { at: 'asc' } })).map((a) => a.action)
    expect(actions).toEqual(expect.arrayContaining(['mfa.reset_by_admin', 'mfa.recovery_identity_verified', 'mfa.enrollment_activated', 'mfa.recovery_completed', 'mfa.verify_failed']))
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'mfa.reset_by_admin' } })
    expect(JSON.stringify(audit)).not.toContain(token)
  })

  it('rejects an expired recovery link', async () => {
    const mentor = await enrolledMentor()
    const { c: admin, secret } = await adminSession()
    await reauth(admin, secret)
    await admin.post(`/api/v1/admin/users/${mentor.user.id}/mfa/reset`, { reason: 'Lost phone', method: 'EMAIL_LINK' })
    const token = linkToken(testOutbox.find((m) => m.to === 'mentor@x.test' && /reset/.test(m.subject))!.text)!
    tick(31 * 60)
    expect((await client().post('/api/v1/auth/mfa/recovery/start', { token, identifier: 'mentor@x.test', password: PASSWORD })).status).toBe(400)
  })

  it('a newer reset cancels an older pending one (concurrent requests)', async () => {
    const mentor = await enrolledMentor()
    const { c: admin, secret } = await adminSession()
    await reauth(admin, secret)
    const [a, b] = await Promise.all([
      admin.post(`/api/v1/admin/users/${mentor.user.id}/mfa/reset`, { reason: 'Lost phone (desk 1)', method: 'IN_PERSON' }),
      admin.post(`/api/v1/admin/users/${mentor.user.id}/mfa/reset`, { reason: 'Lost phone (desk 2)', method: 'IN_PERSON' }),
    ])
    expect([a.status, b.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1)
    expect(await prisma.mfaRecoveryRequest.count({ where: { userId: mentor.user.id, status: 'PENDING' } })).toBe(1)
    const tickets = [a, b].filter((r) => r.status === 200).map((r) => r.body.inPersonTicket as string)
    const results = []
    for (const t of tickets) results.push((await client().post('/api/v1/auth/mfa/recovery/start', { token: t, identifier: 'mentor@x.test', password: PASSWORD })).status)
    expect(results.filter((s) => s === 200)).toHaveLength(1)
  })

  it('still revokes access when the notification fails, and records the failure', async () => {
    const mentor = await enrolledMentor()
    const { c: admin, secret } = await adminSession()
    await reauth(admin, secret)
    failNextMail()
    const r = await admin.post(`/api/v1/admin/users/${mentor.user.id}/mfa/reset`, { reason: 'Lost phone', method: 'EMAIL_LINK' })
    expect(r.body.notification).toBe('failed')
    expect(await prisma.mfaCredential.count({ where: { userId: mentor.user.id, status: 'ACTIVE' } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { action: 'mfa.reset_notification_failed' } })).toBe(1)
  })

  it('requires a verified email for the link method and supports the in-person ticket', async () => {
    const student = await makeUser({ username: 's-1001', roles: ['STUDENT'] })
    const { c: admin, secret } = await adminSession()
    await reauth(admin, secret)
    const noEmail = await admin.post(`/api/v1/admin/users/${student.id}/mfa/reset`, { reason: 'Lost phone', method: 'EMAIL_LINK' })
    expect(noEmail.body.error.code).toBe('NO_VERIFIED_EMAIL')
    const t = await admin.post(`/api/v1/admin/users/${student.id}/mfa/reset`, { reason: 'Verified with school ID card', method: 'IN_PERSON' })
    expect(t.body.inPersonTicket).toBeTruthy()
    const start = await client().post('/api/v1/auth/mfa/recovery/start', { token: t.body.inPersonTicket, identifier: 's-1001', password: PASSWORD })
    expect(start.body.stage).toBe('mfa_enrollment_required')
  })

  it('cannot be aimed at yourself, and administrators can never read a secret', async () => {
    const { c: admin, secret } = await adminSession()
    await reauth(admin, secret)
    const me = (await admin.get('/api/v1/auth/session')).body.user.id
    expect((await admin.post(`/api/v1/admin/users/${me}/mfa/reset`, { reason: 'test reason', method: 'IN_PERSON' })).body.error.code).toBe('SELF_RESET')
    const listing = JSON.stringify((await admin.get('/api/v1/admin/users')).body)
    expect(listing).not.toMatch(/secret|passwordHash|codeHash/i)
  })
})

describe('account administration guards', () => {
  it('protects the last administrator and blocks self-deactivation', async () => {
    await makeUser({ email: 'solo@x.test', roles: ['ADMIN'] })
    const c = client()
    const { secret } = await signInEnrolled(c, 'solo@x.test')
    await reauth(c, secret)
    const me = (await c.get('/api/v1/auth/session')).body.user.id
    expect((await c.post(`/api/v1/admin/users/${me}/status`, { active: false })).body.error.code).toBe('SELF_DEACTIVATION')
    expect((await c.put(`/api/v1/admin/users/${me}/roles`, { roles: ['MENTOR'] })).body.error.code).toBe('SELF_DEMOTION')
  })

  it('deactivating a user ends their sessions immediately', async () => {
    const p = await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    const pc = client()
    await pc.post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })
    const { c: admin, secret } = await adminSession()
    await reauth(admin, secret)
    expect((await admin.post(`/api/v1/admin/users/${p.id}/status`, { active: false })).body.status).toBe('DISABLED')
    expect((await pc.get('/api/v1/auth/session')).status).toBe(401)
  })

  it('cannot revoke another user’s session by id', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    await makeUser({ email: 'q@x.test', roles: ['PARENT'] })
    const p = client()
    await p.post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })
    const q = client()
    await q.post('/api/v1/auth/login', { identifier: 'q@x.test', password: PASSWORD })
    const qSession = await prisma.session.findFirstOrThrow({ where: { user: { email: 'q@x.test' }, revokedAt: null } })
    expect((await p.del(`/api/v1/auth/sessions/${qSession.id}`)).status).toBe(204)
    expect((await q.get('/api/v1/auth/session')).status).toBe(200)
  })

  it('keeps the audit log append-only at the database level', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    await client().post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })
    const row = await prisma.auditLog.findFirstOrThrow()
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { summary: 'tampered' } })).rejects.toThrow()
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow()
  })

  it('lets administrators change the MFA policy (with re-authentication)', async () => {
    const { c, secret } = await adminSession()
    await reauth(c, secret)
    const r = await c.put('/api/v1/admin/security/mfa-policy', { policy: [{ role: 'WARDEN', required: true }] })
    expect(r.body.policy).toContainEqual({ role: 'WARDEN', required: true })
    await makeUser({ email: 'w@x.test', roles: ['WARDEN'] })
    expect((await client().post('/api/v1/auth/login', { identifier: 'w@x.test', password: PASSWORD })).body.stage).toBe('mfa_enrollment_required')
  })

  it('never lets the policy make MFA optional for Admin, Principal or Mentor', async () => {
    const { c, secret } = await adminSession()
    await reauth(c, secret)
    for (const role of ['ADMIN', 'PRINCIPAL', 'MENTOR'] as const) {
      const r = await c.put('/api/v1/admin/security/mfa-policy', { policy: [{ role, required: false }] })
      expect(r.status).toBe(422)
    }
    expect(await prisma.mfaPolicy.count({ where: { role: { in: ['ADMIN', 'PRINCIPAL', 'MENTOR'] }, required: false } })).toBe(0)
  })
})
