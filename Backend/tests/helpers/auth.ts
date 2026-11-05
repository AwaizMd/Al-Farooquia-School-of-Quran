import request from 'supertest'
import { vi } from 'vitest'
import type { Role } from '../../src/generated/prisma/enums.js'
import { createApp } from '../../src/app.js'
import { ORG_ROLES } from '../../src/tenancy/access.js'
import { currentMadrasa, prisma, seedMadrasa } from './db.js'
import { hashPassword } from '../../src/modules/auth/password.js'
import { codeAt } from '../../src/modules/mfa/totp.js'

export const app = createApp()
export const PASSWORD = 'correct horse battery'

/** Organization roles go to user_roles; madrasa roles become memberships of the given (default: current test) madrasa. */
export async function makeUser(opts: { email?: string; username?: string; roles: Role[]; status?: 'ACTIVE' | 'INVITED' | 'DISABLED'; name?: string; madrasaId?: string; expiresAt?: Date }) {
  const local = opts.roles.filter((r) => !ORG_ROLES.includes(r))
  // Accounts are created in a madrasa (their home), like the admin screen does.
  const madrasaId = opts.madrasaId ?? currentMadrasa() ?? (await seedMadrasa()).id
  return prisma.user.create({
    data: {
      displayName: opts.name ?? 'Test User',
      email: opts.email ?? null,
      emailVerifiedAt: opts.email ? new Date() : null,
      username: opts.username ?? null,
      passwordHash: opts.status === 'INVITED' ? null : await hashPassword(PASSWORD),
      status: opts.status ?? 'ACTIVE',
      roles: { create: opts.roles.filter((r) => ORG_ROLES.includes(r)).map((role) => ({ role })) },
      homeMadrasaId: madrasaId,
      memberships: { create: local.map((role) => ({ madrasaId, role, expiresAt: opts.expiresAt ?? null })) },
    },
  })
}

/** A cookie-keeping client that also echoes the CSRF token, like the web app does. */
export function client() {
  const agent = request.agent(app)
  let csrf = ''
  const remember = (res: request.Response) => {
    const token = res.body?.csrfToken ?? res.body?.session?.csrfToken
    if (typeof token === 'string') csrf = token
    return res
  }
  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, body?: object) => {
    const r = agent[method](url).set('X-CSRF-Token', csrf)
    return (body ? r.send(body) : r).then(remember)
  }
  return {
    agent,
    get csrf() {
      return csrf
    },
    set csrf(v: string) {
      csrf = v
    },
    get: (url: string) => agent.get(url).then(remember),
    post: (url: string, body?: object) => send('post', url, body),
    put: (url: string, body?: object) => send('put', url, body),
    patch: (url: string, body?: object) => send('patch', url, body),
    del: (url: string) => send('delete', url),
  }
}

export type Client = ReturnType<typeof client>

/** Reads the manual-entry key from an enrollment response. */
export const secretFrom = (enrollment: { manualEntryKey: string }) => enrollment.manualEntryKey.replace(/\s/g, '')

/** Move the (faked) clock past the current TOTP step so a fresh code is accepted. */
export const tick = (seconds = 31) => vi.setSystemTime(new Date(Date.now() + seconds * 1000))

export const nextCode = (secret: string) => codeAt(secret)

/** Sign in and finish MFA enrollment for a mandatory-MFA user. Returns the TOTP secret. */
export async function signInEnrolled(c: Client, identifier: string) {
  const login = await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })
  if (login.body.stage !== 'mfa_enrollment_required') throw new Error(`unexpected stage ${login.body.stage}`)
  const enr = await c.post('/api/v1/auth/mfa/enrollment')
  const secret = secretFrom(enr.body)
  const done = await c.post('/api/v1/auth/mfa/enrollment/confirm', { code: nextCode(secret) })
  if (done.status !== 200) throw new Error(`enrollment failed: ${JSON.stringify(done.body)}`)
  return { secret, recoveryCodes: done.body.recoveryCodes as string[] }
}

export async function reauth(c: Client, secret?: string) {
  if (secret) tick()
  const r = await c.post('/api/v1/auth/reauthenticate', { password: PASSWORD, ...(secret ? { code: nextCode(secret) } : {}) })
  if (r.status !== 200) throw new Error(`reauth failed: ${JSON.stringify(r.body)}`)
}
