import { Router } from 'express'
import { z } from 'zod'
import { unauthenticated } from '../../common/errors.js'
import { doc } from '../../docs/route.js'
import { requireAuth, requireRecentAuth, requireStage } from '../../middleware/auth.js'
import { body } from '../../middleware/validate.js'
import { prisma } from '../../database/prisma.js'
import { audit } from '../audit-logs/audit.service.js'
import * as auth from './auth.service.js'
import { passwordSchema } from './password.js'
import { revokeAllSessions, revokeSession } from './session.service.js'

export const authRouter = Router()
const T = 'Auth'

const Login = z.object({ identifier: z.string().min(1).max(254), password: z.string().min(1).max(128) })
const Code = z.object({ code: z.string().trim().min(6).max(16) })
const Reauth = z.object({ password: z.string().min(1).max(128), code: z.string().trim().min(6).max(6).optional() })
const Forgot = z.object({ email: z.string().email().max(254) })
const TokenPassword = z.object({ token: z.string().min(20).max(100), password: passwordSchema })
const ChangePassword = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
const Recovery = z.object({ token: z.string().min(20).max(100), identifier: z.string().min(1).max(254), password: z.string().min(1).max(128) })
const SessionId = z.object({ id: z.string().uuid() })

doc('post', '/auth/login', T, 'Sign in with email/username and password', { body: Login })
authRouter.post('/login', async (req, res) => {
  const { identifier, password } = body(req, Login)
  res.json(await auth.login(req, res, identifier, password))
})

doc('post', '/auth/logout', T, 'Sign out of this device')
authRouter.post('/logout', async (req, res) => {
  await auth.logout(req, res)
  res.status(204).end()
})

doc('get', '/auth/session', T, 'Current session, stage and CSRF token')
authRouter.get('/session', async (req, res) => {
  if (!req.auth) throw unauthenticated()
  res.json(await auth.sessionView(req.auth.user.id, req.auth.session.stage, req.auth.session.csrfToken))
})

doc('post', '/auth/reauthenticate', T, 'Confirm password (and code) before a sensitive action', { body: Reauth, auth: 'full session' })
authRouter.post('/reauthenticate', requireAuth, async (req, res) => {
  const { password, code } = body(req, Reauth)
  res.json(await auth.reauthenticate(req, password, code))
})

// ---------- MFA ----------

doc('post', '/auth/mfa/verify', T, 'Complete sign-in with an authenticator code', { body: Code, auth: 'pre-MFA session' })
authRouter.post('/mfa/verify', requireStage('PRE_MFA'), async (req, res) => {
  res.json(await auth.verifyMfa(req, res, body(req, Code).code))
})

doc('post', '/auth/mfa/recovery-code', T, 'Complete sign-in with a one-time recovery code', { body: Code, auth: 'pre-MFA session' })
authRouter.post('/mfa/recovery-code', requireStage('PRE_MFA'), async (req, res) => {
  res.json(await auth.useRecoveryCode(req, res, body(req, Code).code))
})

// Enrollment: mandatory users arrive in an enrollment-only session; optional
// users opt in from a full session after confirming their password.
const enrollmentGate = [
  requireStage('MFA_ENROLLMENT', 'FULL'),
  ((req, res, next) => (req.auth!.session.stage === 'FULL' ? requireRecentAuth()(req, res, next) : next())) satisfies import('express').RequestHandler,
]

doc('post', '/auth/mfa/enrollment', T, 'Start authenticator setup (returns the QR code once)', { auth: 'enrollment session, or full session + recent re-authentication' })
authRouter.post('/mfa/enrollment', ...enrollmentGate, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(await auth.beginEnrollment(req))
})

doc('post', '/auth/mfa/enrollment/confirm', T, 'Activate the authenticator with its first code; returns recovery codes once', { body: Code })
authRouter.post('/mfa/enrollment/confirm', ...enrollmentGate, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(await auth.confirmEnrollment(req, res, body(req, Code).code))
})

doc('delete', '/auth/mfa', T, 'Turn off two-step verification (optional roles only)', { auth: 'full session + recent re-authentication' })
authRouter.delete('/mfa', requireAuth, requireRecentAuth(), async (req, res) => {
  await auth.disableMfa(req)
  res.status(204).end()
})

doc('post', '/auth/mfa/recovery-codes', T, 'Replace recovery codes (shown once)', { auth: 'full session + recent re-authentication' })
authRouter.post('/mfa/recovery-codes', requireAuth, requireRecentAuth(), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ recoveryCodes: await auth.regenerateRecoveryCodes(req) })
})

doc('post', '/auth/mfa/recovery/start', T, 'Begin authenticator recovery with the link/ticket and your password', { body: Recovery })
authRouter.post('/mfa/recovery/start', async (req, res) => {
  const { token, identifier, password } = body(req, Recovery)
  res.json(await auth.startRecovery(req, res, token, identifier, password))
})

// ---------- Passwords and invitations ----------

doc('post', '/auth/password/forgot', T, 'Email a password reset link (always 202)', { body: Forgot })
authRouter.post('/password/forgot', async (req, res) => {
  await auth.forgotPassword(req, body(req, Forgot).email)
  res.status(202).json({ message: 'If an account uses this email, a reset link has been sent.' })
})

doc('post', '/auth/password/reset', T, 'Set a new password with a reset link', { body: TokenPassword })
authRouter.post('/password/reset', async (req, res) => {
  const { token, password } = body(req, TokenPassword)
  await auth.resetPassword(req, token, password)
  res.status(204).end()
})

doc('post', '/auth/password/change', T, 'Change password; signs out other devices', { body: ChangePassword, auth: 'full session' })
authRouter.post('/password/change', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = body(req, ChangePassword)
  await auth.changePassword(req, currentPassword, newPassword)
  res.status(204).end()
})

doc('post', '/auth/invite/accept', T, 'Activate an invited account by choosing a password', { body: TokenPassword })
authRouter.post('/invite/accept', async (req, res) => {
  const { token, password } = body(req, TokenPassword)
  await auth.acceptInvite(req, token, password)
  res.status(204).end()
})

// ---------- Own sessions ----------

doc('get', '/auth/sessions', T, 'Your signed-in devices', { auth: 'full session' })
authRouter.get('/sessions', requireAuth, async (req, res) => {
  const rows = await prisma.session.findMany({
    where: { userId: req.auth!.user.id, revokedAt: null, stage: 'FULL', absoluteExpiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
    orderBy: { lastSeenAt: 'desc' },
  })
  res.json({ items: rows.map((s) => ({ ...s, current: s.id === req.auth!.session.id })) })
})

doc('delete', '/auth/sessions/:id', T, 'Sign out one of your devices', { auth: 'full session' })
authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const { id } = SessionId.parse(req.params)
  // Scoped to the caller: another user's session id behaves like a missing one.
  const s = await prisma.session.findFirst({ where: { id, userId: req.auth!.user.id } })
  if (s) {
    await revokeSession(s.id, 'revoked_by_user')
    await audit({ action: 'auth.session_revoked', summary: 'Signed out a device', entityType: 'session', entityId: s.id }, req)
  }
  res.status(204).end()
})

doc('post', '/auth/sessions/revoke-others', T, 'Sign out every other device', { auth: 'full session' })
authRouter.post('/sessions/revoke-others', requireAuth, async (req, res) => {
  const n = await revokeAllSessions(req.auth!.user.id, 'revoked_by_user', prisma, req.auth!.session.id)
  await audit({ action: 'auth.sessions_revoked', summary: `Signed out ${n} other device(s)`, entityType: 'user', entityId: req.auth!.user.id }, req)
  res.json({ revoked: n })
})
