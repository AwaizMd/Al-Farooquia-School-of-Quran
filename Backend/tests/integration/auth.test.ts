import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { testOutbox } from '../../src/integrations/mail/mailer.js'
import { unseal } from '../../src/common/crypto.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, makeUser, nextCode, reauth, secretFrom, signInEnrolled, tick } from '../helpers/auth.js'

const MFA_POLICY = [
  ['ADMIN', true], ['PRINCIPAL', true], ['MENTOR', true], ['STUDENT', false], ['PARENT', false], ['WARDEN', false],
] as const

beforeEach(async () => {
  await resetDatabase()
  await prisma.mfaPolicy.createMany({ data: MFA_POLICY.map(([role, required]) => ({ role, required })) })
  testOutbox.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date())
})
afterEach(() => {
  vi.useRealTimers()
})

describe('sign-in', () => {
  it('gives the same answer for unknown accounts, wrong passwords, invited and disabled accounts', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    await makeUser({ email: 'inv@x.test', roles: ['PARENT'], status: 'INVITED' })
    await makeUser({ email: 'off@x.test', roles: ['PARENT'], status: 'DISABLED' })
    const c = client()
    const answers = await Promise.all([
      c.post('/api/v1/auth/login', { identifier: 'nobody@x.test', password: PASSWORD }),
      c.post('/api/v1/auth/login', { identifier: 'p@x.test', password: 'wrong password!' }),
      c.post('/api/v1/auth/login', { identifier: 'inv@x.test', password: PASSWORD }),
      c.post('/api/v1/auth/login', { identifier: 'off@x.test', password: PASSWORD }),
    ])
    for (const r of answers) {
      expect(r.status).toBe(401)
      expect(r.body.error.code).toBe('INVALID_CREDENTIALS')
      expect(r.body.error.message).toBe(answers[0]!.body.error.message)
    }
  })

  it('signs an optional-MFA parent straight in; logout revokes the session server-side', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'], name: 'Javed Khan' })
    const c = client()
    const r = await c.post('/api/v1/auth/login', { identifier: '  P@X.test ', password: PASSWORD })
    expect(r.body).toMatchObject({ stage: 'full', user: { displayName: 'Javed Khan', roles: ['PARENT'], mfa: { enabled: false, required: false } } })
    expect(r.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i)
    expect(r.headers['set-cookie']?.[0]).toMatch(/SameSite=Lax/i)
    expect((await c.get('/api/v1/auth/session')).status).toBe(200)
    expect((await c.post('/api/v1/auth/logout')).status).toBe(204)
    expect((await c.get('/api/v1/auth/session')).status).toBe(401)
    expect(await prisma.session.count({ where: { revokedReason: 'logout' } })).toBe(1)
  })

  it('lets students sign in with their admission number', async () => {
    await makeUser({ username: 's-1001', roles: ['STUDENT'] })
    const r = await client().post('/api/v1/auth/login', { identifier: 'S-1001', password: PASSWORD })
    expect(r.body.stage).toBe('full')
  })

  it('rate limits repeated failures against one account', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    const c = client()
    for (let i = 0; i < 8; i++) expect((await c.post('/api/v1/auth/login', { identifier: 'p@x.test', password: 'nope nope nope' })).status).toBe(401)
    const blocked = await c.post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })
    expect(blocked.status).toBe(429)
    expect(blocked.headers['retry-after']).toBeTruthy()
  })

  it('expires idle sessions', async () => {
    await makeUser({ email: 'w@x.test', roles: ['WARDEN'] })
    const c = client()
    await c.post('/api/v1/auth/login', { identifier: 'w@x.test', password: PASSWORD })
    await prisma.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 31 * 60 * 1000) } })
    expect((await c.get('/api/v1/auth/session')).status).toBe(401)
  })
})

describe('mandatory MFA (admin, principal, mentor)', () => {
  it.each(['ADMIN', 'PRINCIPAL', 'MENTOR'] as const)('%s must enroll before reaching anything else', async (role) => {
    await makeUser({ email: 'staff@x.test', roles: [role] })
    const c = client()
    const login = await c.post('/api/v1/auth/login', { identifier: 'staff@x.test', password: PASSWORD })
    expect(login.body.stage).toBe('mfa_enrollment_required')
    expect(login.body.user).toEqual({ displayName: 'Test User' })
    // Direct API calls cannot skip enrollment.
    const bypass = await c.get('/api/v1/admin/users')
    expect(bypass.status).toBe(401)
    const sessions = await c.get('/api/v1/auth/sessions')
    expect(sessions.status).toBe(403)
    expect(sessions.body.error.code).toBe('MFA_ENROLLMENT_REQUIRED')
  })

  it('enrolls with a QR code, stores the secret encrypted, and returns ten one-time recovery codes', async () => {
    const u = await makeUser({ email: 'a@x.test', roles: ['ADMIN'] })
    const c = client()
    await c.post('/api/v1/auth/login', { identifier: 'a@x.test', password: PASSWORD })
    const enr = await c.post('/api/v1/auth/mfa/enrollment')
    expect(enr.status).toBe(200)
    expect(enr.headers['cache-control']).toBe('no-store')
    expect(enr.body.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    const secret = secretFrom(enr.body)

    const row = await prisma.mfaCredential.findFirstOrThrow({ where: { userId: u.id } })
    expect(row.status).toBe('PENDING')
    expect(Buffer.from(row.secretCiphertext).toString('latin1')).not.toContain(secret)
    expect(unseal({ ciphertext: row.secretCiphertext, iv: row.secretIv, tag: row.secretTag, keyVersion: row.keyVersion }, `mfa:${u.id}:${row.id}`)).toBe(secret)

    expect((await c.post('/api/v1/auth/mfa/enrollment/confirm', { code: '000000' })).body.error.code).toBe('INVALID_CODE')
    const ok = await c.post('/api/v1/auth/mfa/enrollment/confirm', { code: nextCode(secret) })
    expect(ok.status).toBe(200)
    expect(ok.body.session.stage).toBe('full')
    expect(ok.body.recoveryCodes).toHaveLength(10)
    expect(await prisma.recoveryCode.count({ where: { codeHash: { in: ok.body.recoveryCodes } } })).toBe(0) // only hashes stored
    expect((await c.get('/api/v1/admin/users')).status).toBe(200)
    // The QR is never shown again once enrollment is complete.
    expect((await c.post('/api/v1/auth/mfa/enrollment')).body.error.code).toBe('MFA_ALREADY_ENABLED')
  })

  it('expires an unfinished enrollment', async () => {
    await makeUser({ email: 'm@x.test', roles: ['MENTOR'] })
    const c = client()
    await c.post('/api/v1/auth/login', { identifier: 'm@x.test', password: PASSWORD })
    const secret = secretFrom((await c.post('/api/v1/auth/mfa/enrollment')).body)
    tick(11 * 60)
    const r = await c.post('/api/v1/auth/mfa/enrollment/confirm', { code: nextCode(secret) })
    expect(r.status).toBe(410)
    expect(r.body.error.code).toBe('ENROLLMENT_EXPIRED')
  })

  it('requires the code at every later sign-in, rejects replays and wrong codes', async () => {
    await makeUser({ email: 'a@x.test', roles: ['ADMIN'] })
    const { secret } = await signInEnrolled(client(), 'a@x.test')

    tick()
    const code = nextCode(secret)
    const c1 = client()
    const pre = await c1.post('/api/v1/auth/login', { identifier: 'a@x.test', password: PASSWORD })
    expect(pre.body.stage).toBe('mfa_required')
    expect((await c1.get('/api/v1/admin/users')).status).toBe(401) // password alone is not enough
    expect((await c1.post('/api/v1/auth/mfa/verify', { code: '123456' })).body.error.code).toBe('INVALID_CODE')
    const ok = await c1.post('/api/v1/auth/mfa/verify', { code })
    expect(ok.body.stage).toBe('full')
    expect((await c1.get('/api/v1/admin/users')).status).toBe(200)

    // Same code, second device, same time step: replay is refused.
    const c2 = client()
    await c2.post('/api/v1/auth/login', { identifier: 'a@x.test', password: PASSWORD })
    expect((await c2.post('/api/v1/auth/mfa/verify', { code })).status).toBe(400)
  })

  it('ends the pre-MFA session after five wrong codes', async () => {
    await makeUser({ email: 'a@x.test', roles: ['ADMIN'] })
    await signInEnrolled(client(), 'a@x.test')
    const c = client()
    await c.post('/api/v1/auth/login', { identifier: 'a@x.test', password: PASSWORD })
    for (let i = 0; i < 4; i++) expect((await c.post('/api/v1/auth/mfa/verify', { code: '000000' })).status).toBe(400)
    const last = await c.post('/api/v1/auth/mfa/verify', { code: '000000' })
    expect(last.body.error.code).toBe('MFA_ATTEMPTS_EXCEEDED')
    expect((await c.post('/api/v1/auth/mfa/verify', { code: '000000' })).status).toBe(401)
  })

  it('accepts each recovery code once and tells the user', async () => {
    await makeUser({ email: 'a@x.test', roles: ['ADMIN'] })
    const { recoveryCodes } = await signInEnrolled(client(), 'a@x.test')
    const code = recoveryCodes[0]!
    const c = client()
    await c.post('/api/v1/auth/login', { identifier: 'a@x.test', password: PASSWORD })
    const ok = await c.post('/api/v1/auth/mfa/recovery-code', { code: code.toLowerCase().replace('-', ' ') })
    expect(ok.body.stage).toBe('full')
    expect(ok.body.user.mfa.recoveryCodesRemaining).toBe(9)
    expect(testOutbox.at(-1)?.subject).toMatch(/recovery code was used/)
    expect(testOutbox.at(-1)?.text).not.toContain(code)

    const again = client()
    await again.post('/api/v1/auth/login', { identifier: 'a@x.test', password: PASSWORD })
    expect((await again.post('/api/v1/auth/mfa/recovery-code', { code })).status).toBe(400)
  })

  it('cannot be turned off by a mandatory role', async () => {
    await makeUser({ email: 'm@x.test', roles: ['MENTOR'] })
    const c = client()
    const { secret } = await signInEnrolled(c, 'm@x.test')
    await reauth(c, secret)
    const r = await c.del('/api/v1/auth/mfa')
    expect(r.body.error.code).toBe('MFA_MANDATORY')
  })

  it('applies the strictest policy to an account with several roles', async () => {
    await makeUser({ email: 'pm@x.test', roles: ['PARENT', 'MENTOR'] })
    const r = await client().post('/api/v1/auth/login', { identifier: 'pm@x.test', password: PASSWORD })
    expect(r.body.stage).toBe('mfa_enrollment_required')
  })
})

describe('optional MFA (student, parent, warden)', () => {
  it('can be enabled after re-authentication, is then enforced, and can be disabled', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    const c = client()
    await c.post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })
    tick(6 * 60) // the sign-in confirmation is no longer "recent"
    expect((await c.post('/api/v1/auth/mfa/enrollment')).body.error.code).toBe('REAUTH_REQUIRED')
    await reauth(c)
    const secret = secretFrom((await c.post('/api/v1/auth/mfa/enrollment')).body)
    const on = await c.post('/api/v1/auth/mfa/enrollment/confirm', { code: nextCode(secret) })
    expect(on.body.session.user.mfa.enabled).toBe(true)

    const next = client()
    expect((await next.post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })).body.stage).toBe('mfa_required')

    await reauth(c, secret)
    expect((await c.del('/api/v1/auth/mfa')).status).toBe(204)
    expect((await client().post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })).body.stage).toBe('full')
  })

  it('needs password and current code to re-authenticate once MFA is on', async () => {
    await makeUser({ email: 'w@x.test', roles: ['WARDEN'] })
    const c = client()
    await c.post('/api/v1/auth/login', { identifier: 'w@x.test', password: PASSWORD })
    const secret = secretFrom((await c.post('/api/v1/auth/mfa/enrollment')).body)
    await c.post('/api/v1/auth/mfa/enrollment/confirm', { code: nextCode(secret) })
    expect((await c.post('/api/v1/auth/reauthenticate', { password: PASSWORD })).body.error.code).toBe('REAUTH_FAILED')
  })
})

describe('CSRF and request hygiene', () => {
  it('rejects state changes without the session CSRF token', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    const c = client()
    await c.post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })
    c.csrf = 'wrong'
    expect((await c.post('/api/v1/auth/logout')).body.error.code).toBe('CSRF_FAILED')
  })
  it('blocks foreign origins and non-JSON bodies', async () => {
    const c = client()
    const foreign = await c.agent.post('/api/v1/auth/login').set('Origin', 'https://evil.example').send({ identifier: 'a', password: 'b' })
    expect(foreign.status).toBe(403)
    const form = await c.agent.post('/api/v1/auth/login').type('form').send('identifier=a&password=b')
    expect(form.status).toBe(415)
  })
  it('strips unknown fields (no mass assignment)', async () => {
    const r = await client().post('/api/v1/auth/login', { identifier: 'x@x.test', password: 'y', role: 'ADMIN' })
    expect(r.status).toBe(401)
  })
})

describe('password reset and invitations', () => {
  it('answers the same for unknown emails and sends nothing', async () => {
    const r = await client().post('/api/v1/auth/password/forgot', { email: 'nobody@x.test' })
    expect(r.status).toBe(202)
    expect(testOutbox).toHaveLength(0)
  })

  it('resets with a single-use link and signs out every session', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    const old = client()
    await old.post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })
    await client().post('/api/v1/auth/password/forgot', { email: 'p@x.test' })
    const token = /token=([\w-]+)/.exec(testOutbox[0]!.text)![1]!
    expect((await client().post('/api/v1/auth/password/reset', { token, password: 'a brand new passphrase' })).status).toBe(204)
    expect((await old.get('/api/v1/auth/session')).status).toBe(401)
    expect((await client().post('/api/v1/auth/password/reset', { token, password: 'another new passphrase' })).body.error.code).toBe('INVALID_TOKEN')
    expect((await client().post('/api/v1/auth/login', { identifier: 'p@x.test', password: 'a brand new passphrase' })).body.stage).toBe('full')
  })

  it('rejects an expired reset link', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    await client().post('/api/v1/auth/password/forgot', { email: 'p@x.test' })
    const token = /token=([\w-]+)/.exec(testOutbox[0]!.text)![1]!
    tick(31 * 60)
    expect((await client().post('/api/v1/auth/password/reset', { token, password: 'a brand new passphrase' })).status).toBe(400)
  })

  it('does not let a password reset bypass MFA', async () => {
    await makeUser({ email: 'a@x.test', roles: ['ADMIN'] })
    await signInEnrolled(client(), 'a@x.test')
    await client().post('/api/v1/auth/password/forgot', { email: 'a@x.test' })
    const token = /token=([\w-]+)/.exec(testOutbox.at(-1)!.text)![1]!
    await client().post('/api/v1/auth/password/reset', { token, password: 'a brand new passphrase' })
    expect((await client().post('/api/v1/auth/login', { identifier: 'a@x.test', password: 'a brand new passphrase' })).body.stage).toBe('mfa_required')
  })

  it('activates an invited account and verifies its email', async () => {
    const admin = await makeUser({ email: 'a@x.test', roles: ['ADMIN'] })
    const c = client()
    const { secret } = await signInEnrolled(c, admin.email!)
    await reauth(c, secret)
    const created = await c.post('/api/v1/admin/users', { displayName: 'Qari Test', email: 'Q@x.test', roles: ['MENTOR'] })
    expect(created.status).toBe(201)
    expect(created.body.invite.delivery).toBe('email')
    const token = /token=([\w-]+)/.exec(testOutbox.at(-1)!.text)![1]!
    expect((await client().post('/api/v1/auth/invite/accept', { token, password: 'short' })).status).toBe(422)
    expect((await client().post('/api/v1/auth/invite/accept', { token, password: 'my own passphrase' })).status).toBe(204)
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'q@x.test' } })
    expect(u.status).toBe('ACTIVE')
    expect(u.emailVerifiedAt).not.toBeNull()
  })

  it('gives the office a one-time setup link for accounts without email', async () => {
    await makeUser({ email: 'a@x.test', roles: ['ADMIN'] })
    const c = client()
    const { secret } = await signInEnrolled(c, 'a@x.test')
    await reauth(c, secret)
    const r = await c.post('/api/v1/admin/users', { displayName: 'Abdullah Khan', username: 'S-1001', roles: ['STUDENT'] })
    expect(r.body.invite.delivery).toBe('in_person')
    expect(r.body.invite.setupLink).toMatch(/accept-invite\?token=/)
  })
})

describe('malformed input', () => {
  it('answers NUL characters and undecodable addresses with 400, never a database error', async () => {
    await makeUser({ email: 'p@x.test', roles: ['PARENT'] })
    const c = client()
    expect((await c.post('/api/v1/auth/login', { identifier: 'a\u0000b', password: 'x' })).status).toBe(400)
    await c.post('/api/v1/auth/login', { identifier: 'p@x.test', password: PASSWORD })
    for (const url of ['/api/v1/students/%00', '/api/v1/students?search=%00', '/api/v1/report-cards/S-1%00', '/api/v1/students/%C0%AF']) {
      expect((await c.get(url)).status, url).toBe(400)
    }
    expect((await c.post('/api/v1/audit/events', { action: 'export.csv', entity: 'ab\u0000cd' })).status).toBe(400)
  })
})
