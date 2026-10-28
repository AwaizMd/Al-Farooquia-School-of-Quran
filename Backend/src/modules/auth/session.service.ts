import type { CookieOptions, Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Role, SessionStage } from '../../generated/prisma/enums.js'
import { env } from '../../config/env.js'
import { hashToken, newToken } from '../../common/crypto.js'
import { prisma } from '../../database/prisma.js'
import { STAFF_ROLES } from './permissions.js'

type Db = Prisma.TransactionClient | typeof prisma

// __Host- prefix: browser enforces Secure, Path=/ and no Domain, so a sibling
// subdomain cannot plant or overwrite the cookie.
export const SESSION_COOKIE = env.COOKIE_SECURE ? '__Host-mms_session' : 'mms_session'

const MIN = 60
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Approved timeouts: staff 30 min idle / 12 h; families 24 h idle / 30 days; MFA steps are brief. */
export function timeoutsFor(stage: SessionStage, roles: readonly Role[]) {
  if (stage === 'PRE_MFA') return { idleSec: 5 * MIN, absoluteSec: 5 * MIN }
  if (stage === 'MFA_ENROLLMENT') return { idleSec: 15 * MIN, absoluteSec: 15 * MIN }
  if (roles.some((r) => STAFF_ROLES.includes(r))) return { idleSec: 30 * MIN, absoluteSec: 12 * HOUR }
  return { idleSec: DAY, absoluteSec: 30 * DAY }
}

export interface NewSession {
  userId: string
  roles: readonly Role[]
  stage: SessionStage
  recoveryRequestId?: string | null
  reauthenticated?: boolean
}

export async function createSession(req: Request, res: Response, s: NewSession, db: Db = prisma) {
  const token = newToken()
  const { idleSec, absoluteSec } = timeoutsFor(s.stage, s.roles)
  const now = new Date()
  const session = await db.session.create({
    data: {
      tokenHash: hashToken(token),
      csrfToken: randomBytes(24).toString('base64url'),
      userId: s.userId,
      stage: s.stage,
      recoveryRequestId: s.recoveryRequestId ?? null,
      idleTimeoutSec: idleSec,
      absoluteExpiresAt: new Date(now.getTime() + absoluteSec * 1000),
      reauthenticatedAt: s.reauthenticated ? now : null,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
    },
  })
  res.cookie(SESSION_COOKIE, token, cookieOptions(absoluteSec))
  return session
}

export function cookieOptions(maxAgeSec?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    ...(maxAgeSec ? { maxAge: maxAgeSec * 1000 } : {}),
  }
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions())
}

export async function revokeSession(id: string, reason: string, db: Db = prisma) {
  await db.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } })
}

export async function revokeAllSessions(userId: string, reason: string, db: Db = prisma, exceptSessionId?: string) {
  const r = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  })
  return r.count
}

/** Look up a session from its cookie token; returns null for missing, revoked, expired or disabled. */
export async function findActiveSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { roles: true } } },
  })
  if (!session || session.revokedAt) return null
  const now = Date.now()
  const idleExpired = now - session.lastSeenAt.getTime() > session.idleTimeoutSec * 1000
  if (idleExpired || now >= session.absoluteExpiresAt.getTime()) {
    await revokeSession(session.id, 'expired')
    return null
  }
  if (session.user.status !== 'ACTIVE') {
    await revokeSession(session.id, 'account_inactive')
    return null
  }
  // Touch at most once a minute to keep writes low.
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
  }
  return session
}
