import type { RequestHandler } from 'express'
import type { SessionStage } from '../generated/prisma/enums.js'
import { env } from '../config/env.js'
import { safeEqual } from '../common/crypto.js'
import { AppError, forbidden, unauthenticated } from '../common/errors.js'
import { permissionsFor, type Permission } from '../modules/auth/permissions.js'
import { SESSION_COOKIE, findActiveSession } from '../modules/auth/session.service.js'
import { UPLOAD_TYPES } from '../modules/library/library.service.js'
import { PROOF_UPLOAD_TYPES } from '../modules/fees/manual.service.js'

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// The only routes that take a raw (non-JSON) body: file uploads, which still need the CSRF token.
const RAW_UPLOADS: { method: string; path: RegExp; types: string[] }[] = [
  { method: 'PUT', path: /^\/library\/[0-9a-f-]{36}\/file$/i, types: UPLOAD_TYPES },
  { method: 'POST', path: /^\/payments\/proofs$/, types: PROOF_UPLOAD_TYPES },
  { method: 'PUT', path: /^\/admin\/payment-settings\/upi-qr$/, types: ['image/png', 'image/jpeg', 'image/webp'] },
]

/** Attach req.auth when a valid session cookie is present. Never rejects on its own. */
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE]
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return next()
  const s = await findActiveSession(token)
  if (s) {
    const roles = s.user.roles.map((r) => r.role)
    req.auth = {
      session: { id: s.id, stage: s.stage, csrfToken: s.csrfToken, reauthenticatedAt: s.reauthenticatedAt, recoveryRequestId: s.recoveryRequestId },
      user: { id: s.user.id, displayName: s.user.displayName, email: s.user.email, username: s.user.username, locale: s.user.locale },
      roles,
      permissions: permissionsFor(roles),
    }
  }
  next()
}

/**
 * CSRF defence for cookie authentication:
 * 1. unsafe requests must come from an allowed Origin (when the browser sends one);
 * 2. unsafe requests must be JSON (HTML forms cannot send application/json cross-site);
 * 3. authenticated unsafe requests must echo the session's CSRF token in X-CSRF-Token.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (!UNSAFE.has(req.method)) return next()
  const origin = req.get('origin')
  if (origin && !env.CORS_ORIGINS.includes(origin)) return next(forbidden('Cross-site request blocked.'))
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined
  // The one exception: raw library uploads (still need the CSRF token below, which forms cannot send).
  const rawUpload = RAW_UPLOADS.some((u) => u.method === req.method && u.path.test(req.path) && req.is(u.types))
  if (hasBody && !req.is('application/json') && !rawUpload) return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Requests must be sent as JSON.'))
  if (req.auth) {
    const sent = req.get('x-csrf-token')
    if (!sent || !safeEqual(sent, req.auth.session.csrfToken)) return next(new AppError(403, 'CSRF_FAILED', 'Your session token is missing or out of date. Refresh and try again.'))
  }
  next()
}

/** Require a session in one of the given stages. */
export const requireStage =
  (...stages: SessionStage[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(unauthenticated())
    if (!stages.includes(req.auth.session.stage)) {
      const code = req.auth.session.stage === 'PRE_MFA' ? 'MFA_REQUIRED' : req.auth.session.stage === 'MFA_ENROLLMENT' ? 'MFA_ENROLLMENT_REQUIRED' : 'WRONG_SESSION_STAGE'
      return next(new AppError(403, code, 'Complete two-step verification to continue.'))
    }
    next()
  }

/** Fully signed in (password and, where applicable, MFA). Every protected API uses this. */
export const requireAuth = requireStage('FULL')

export const requirePermission =
  (...perms: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth || req.auth.session.stage !== 'FULL') return next(unauthenticated())
    if (!perms.every((p) => req.auth!.permissions.has(p))) return next(forbidden())
    next()
  }

/** Sensitive actions need a password (+MFA) confirmation within the last few minutes. */
export const requireRecentAuth =
  (maxAgeSec = 5 * 60): RequestHandler =>
  (req, _res, next) => {
    const at = req.auth?.session.reauthenticatedAt
    if (!at || Date.now() - at.getTime() > maxAgeSec * 1000) {
      return next(new AppError(403, 'REAUTH_REQUIRED', 'Please confirm your password to continue.'))
    }
    next()
  }
