import type { Request, Response } from 'express'
import type { Role, SessionStage } from '../../generated/prisma/enums.js'
import { env } from '../../config/env.js'
import { AppError } from '../../common/errors.js'
import { LIMITS, clear, consume, hit } from '../../common/rateLimit.js'
import { prisma } from '../../database/prisma.js'
import { sendMail } from '../../integrations/mail/mailer.js'
import { audit } from '../audit-logs/audit.service.js'
import * as mfa from '../mfa/mfa.service.js'
import { hashPassword, verifyPassword } from './password.js'
import { clearSessionCookie, createSession, revokeAllSessions, revokeSession } from './session.service.js'
import { consumeToken, issueToken, peekToken } from './tokens.js'

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'The sign-in details are not correct.')

export const normaliseIdentifier = (s: string) => s.trim().toLowerCase()

const STAGE_NAME: Record<SessionStage, 'full' | 'mfa_required' | 'mfa_enrollment_required'> = {
  FULL: 'full',
  PRE_MFA: 'mfa_required',
  MFA_ENROLLMENT: 'mfa_enrollment_required',
}

/** What the client may know about the current session. Restricted stages reveal only the name. */
export async function sessionView(userId: string, stage: SessionStage, csrfToken: string) {
  if (stage !== 'FULL') {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } })
    return { stage: STAGE_NAME[stage], csrfToken, user: { displayName: u.displayName } }
  }
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: true, staffProfile: { select: { id: true, code: true } }, guardianProfile: { select: { id: true, code: true } }, studentProfile: { select: { id: true, admissionNo: true } } },
  })
  const roles = u.roles.map((r) => r.role)
  // Which people records this account represents (for the web app's role views).
  const links = { staff: u.staffProfile, guardian: u.guardianProfile, student: u.studentProfile }
  const [enabled, required, codesLeft] = await Promise.all([mfa.activeCredential(u.id), mfa.isMfaRequired(roles), mfa.remainingRecoveryCodes(u.id)])
  return {
    stage: STAGE_NAME[stage],
    csrfToken,
    user: { id: u.id, displayName: u.displayName, email: u.email, username: u.username, locale: u.locale, roles, links, mfa: { enabled: !!enabled, required, recoveryCodesRemaining: codesLeft } },
  }
}

const rolesOf = async (userId: string) => (await prisma.userRole.findMany({ where: { userId } })).map((r) => r.role)

/** Replace the caller's session with a new one (new token = no session fixation). */
async function startSession(req: Request, res: Response, userId: string, stage: SessionStage, roles: Role[], extra: { recoveryRequestId?: string | null; reauthenticated?: boolean } = {}) {
  if (req.auth) await revokeSession(req.auth.session.id, 'replaced')
  const s = await createSession(req, res, { userId, roles, stage, ...extra })
  return sessionView(userId, stage, s.csrfToken)
}

export async function login(req: Request, res: Response, identifier: string, password: string) {
  const id = normaliseIdentifier(identifier)
  await consume(LIMITS.loginPerIp, req.ip ?? 'unknown')
  await consume(LIMITS.loginPerAccount, id)

  const user = await prisma.user.findFirst({ where: { OR: [{ email: id }, { username: id }] }, include: { roles: true } })
  const ok = await verifyPassword(user?.passwordHash, password)
  if (!user || !ok || user.status !== 'ACTIVE') {
    await audit({ action: 'auth.login_failed', summary: 'Failed sign-in attempt', entityType: 'user', entityId: user?.id, actor: { userId: null, name: 'Anonymous', role: 'anonymous' } }, req)
    throw invalidCredentials()
  }
  await clear(LIMITS.loginPerAccount, id)
  const actor = { userId: user.id, name: user.displayName, role: user.roles.map((r) => r.role).join(',') }

  if (user.mfaRecoveryPending) {
    // Correct password, but the authenticator was reset: only the recovery link or ticket can continue.
    await audit({ action: 'auth.login_blocked_recovery_pending', summary: 'Sign-in blocked until MFA recovery is completed', entityType: 'user', entityId: user.id, actor }, req)
    throw new AppError(403, 'MFA_RECOVERY_REQUIRED', 'Your two-step verification was reset. Use the recovery link or ticket from the office to continue.')
  }

  const roles = user.roles.map((r) => r.role)
  const [cred, required] = await Promise.all([mfa.activeCredential(user.id), mfa.isMfaRequired(roles)])
  const stage: SessionStage = cred ? 'PRE_MFA' : required ? 'MFA_ENROLLMENT' : 'FULL'
  await audit({ action: stage === 'FULL' ? 'auth.login' : 'auth.password_verified', summary: stage === 'FULL' ? 'Signed in' : 'Password verified; two-step verification pending', entityType: 'user', entityId: user.id, actor }, req)
  return startSession(req, res, user.id, stage, roles, { reauthenticated: stage === 'FULL' })
}

export async function logout(req: Request, res: Response) {
  if (req.auth) {
    await revokeSession(req.auth.session.id, 'logout')
    await audit({ action: 'auth.logout', summary: 'Signed out', entityType: 'user', entityId: req.auth.user.id }, req)
  }
  clearSessionCookie(res)
}

async function recordMfaFailure(req: Request) {
  const s = await prisma.session.update({ where: { id: req.auth!.session.id }, data: { failedMfaAttempts: { increment: 1 } } })
  await audit({ action: 'mfa.verify_failed', summary: 'Incorrect two-step verification code', entityType: 'user', entityId: req.auth!.user.id }, req)
  if (s.failedMfaAttempts >= 5) {
    await revokeSession(s.id, 'too_many_mfa_failures')
    throw new AppError(401, 'MFA_ATTEMPTS_EXCEEDED', 'Too many incorrect codes. Sign in again.')
  }
}

export async function verifyMfa(req: Request, res: Response, code: string) {
  const userId = req.auth!.user.id
  await consume(LIMITS.mfaPerUser, userId)
  if (!(await mfa.verifyCode(userId, code))) {
    await recordMfaFailure(req)
    throw new AppError(400, 'INVALID_CODE', 'That code is not valid.')
  }
  await audit({ action: 'auth.login', summary: 'Signed in with two-step verification', entityType: 'user', entityId: userId }, req)
  return startSession(req, res, userId, 'FULL', req.auth!.roles, { reauthenticated: true })
}

export async function useRecoveryCode(req: Request, res: Response, code: string) {
  const user = req.auth!.user
  await consume(LIMITS.mfaPerUser, user.id)
  if (!(await mfa.useRecoveryCode(user.id, code))) {
    await recordMfaFailure(req)
    throw new AppError(400, 'INVALID_CODE', 'That recovery code is not valid or was already used.')
  }
  const left = await mfa.remainingRecoveryCodes(user.id)
  await audit({ action: 'mfa.recovery_code_used', summary: `Signed in with a recovery code (${left} left)`, entityType: 'user', entityId: user.id }, req)
  if (user.email) await sendMail({ to: user.email, subject: 'A recovery code was used to sign in', text: `Assalamu Alaikum ${user.displayName},\n\nA one-time recovery code was just used to sign in to your account. ${left} codes remain.\n\nIf this was not you, contact the Madarsa office immediately.` })
  return startSession(req, res, user.id, 'FULL', req.auth!.roles, { reauthenticated: true })
}

export async function beginEnrollment(req: Request) {
  const a = req.auth!
  if (a.session.stage === 'FULL' && (await mfa.activeCredential(a.user.id))) {
    throw new AppError(409, 'MFA_ALREADY_ENABLED', 'Two-step verification is already on. Turn it off first to switch phones.')
  }
  const result = await mfa.startEnrollment(a.user)
  await audit({ action: 'mfa.enrollment_started', summary: 'Two-step verification setup started', entityType: 'user', entityId: a.user.id }, req)
  return result
}

export async function confirmEnrollment(req: Request, res: Response, code: string) {
  const a = req.auth!
  await consume(LIMITS.mfaPerUser, a.user.id)
  let codes: string[]
  try {
    codes = await mfa.confirmEnrollment(a.user.id, code)
  } catch (err) {
    await audit({ action: 'mfa.enrollment_failed', summary: 'Two-step verification setup code rejected', entityType: 'user', entityId: a.user.id }, req)
    throw err
  }
  await audit({ action: 'mfa.enrollment_activated', summary: 'Two-step verification turned on', entityType: 'user', entityId: a.user.id }, req)

  if (a.session.recoveryRequestId) {
    await prisma.$transaction([
      prisma.mfaRecoveryRequest.update({ where: { id: a.session.recoveryRequestId }, data: { status: 'COMPLETED', completedAt: new Date() } }),
      prisma.user.update({ where: { id: a.user.id }, data: { mfaRecoveryPending: false } }),
    ])
    await audit({ action: 'mfa.recovery_completed', summary: 'Authenticator recovery completed with a new device', entityType: 'user', entityId: a.user.id }, req)
    if (a.user.email) await sendMail({ to: a.user.email, subject: 'Two-step verification recovery completed', text: `Assalamu Alaikum ${a.user.displayName},\n\nYour new authenticator app is now active. Your old device no longer works for this account.\n\nIf you did not do this, contact the Madarsa office immediately.` })
  }
  // Enrollment proves possession of the new authenticator; issue a full session.
  const session = a.session.stage === 'FULL' ? await sessionView(a.user.id, 'FULL', a.session.csrfToken) : await startSession(req, res, a.user.id, 'FULL', a.roles, { reauthenticated: true })
  return { session, recoveryCodes: codes }
}

export async function reauthenticate(req: Request, password: string, code: string | undefined) {
  const a = req.auth!
  await consume(LIMITS.reauthPerUser, a.user.id)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })
  const cred = await mfa.activeCredential(user.id)
  const ok = (await verifyPassword(user.passwordHash, password)) && (!cred || (code !== undefined && (await mfa.verifyCode(user.id, code))))
  if (!ok) {
    await audit({ action: 'auth.reauth_failed', summary: 'Failed confirmation for a sensitive action', entityType: 'user', entityId: user.id }, req)
    throw new AppError(401, 'REAUTH_FAILED', cred ? 'Password or code is not correct.' : 'Password is not correct.')
  }
  await prisma.session.update({ where: { id: a.session.id }, data: { reauthenticatedAt: new Date() } })
  return { reauthenticatedAt: new Date().toISOString() }
}

export async function disableMfa(req: Request) {
  const a = req.auth!
  if (await mfa.isMfaRequired(a.roles)) throw new AppError(403, 'MFA_MANDATORY', 'Two-step verification is required for your role and cannot be turned off.')
  const n = await mfa.revokeAllCredentials(a.user.id)
  if (n === 0) throw new AppError(409, 'MFA_NOT_ENABLED', 'Two-step verification is not turned on.')
  await audit({ action: 'mfa.disabled', summary: 'Two-step verification turned off by the user', entityType: 'user', entityId: a.user.id }, req)
  if (a.user.email) await sendMail({ to: a.user.email, subject: 'Two-step verification turned off', text: `Assalamu Alaikum ${a.user.displayName},\n\nTwo-step verification was turned off for your account. If this was not you, contact the Madarsa office immediately.` })
}

export async function regenerateRecoveryCodes(req: Request) {
  const codes = await mfa.regenerateRecoveryCodes(req.auth!.user.id)
  await audit({ action: 'mfa.recovery_codes_regenerated', summary: 'New recovery codes generated; old codes invalidated', entityType: 'user', entityId: req.auth!.user.id }, req)
  return codes
}

// ---------- Passwords ----------

export async function forgotPassword(req: Request, email: string) {
  const id = normaliseIdentifier(email)
  await consume(LIMITS.forgotPerIp, req.ip ?? 'unknown')
  // Same response whatever happens below, so the endpoint cannot be used to discover accounts.
  const { count } = await hit(LIMITS.forgotPerAccount, id)
  if (count > LIMITS.forgotPerAccount.max) return
  const user = await prisma.user.findUnique({ where: { email: id } })
  if (!user || user.status !== 'ACTIVE' || !user.email) return
  const { raw } = await issueToken(user.id, 'PASSWORD_RESET')
  await sendMail({ to: user.email, subject: 'Reset your password', text: `Assalamu Alaikum ${user.displayName},\n\nUse this link within 30 minutes to choose a new password:\n${env.APP_BASE_URL}/reset-password?token=${raw}\n\nIf you did not ask for this, ignore this email; your password will not change.` })
  await audit({ action: 'auth.password_reset_requested', summary: 'Password reset link sent', entityType: 'user', entityId: user.id, actor: { userId: null, name: 'Anonymous', role: 'anonymous' } }, req)
}

export async function resetPassword(req: Request, token: string, password: string) {
  await consume(LIMITS.tokenPerIp, req.ip ?? 'unknown')
  const t = await consumeToken(token, 'PASSWORD_RESET')
  if (!t) throw new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has expired. Request a new one.')
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() } })
    await revokeAllSessions(u.id, 'password_reset', tx)
    return u
  })
  await audit({ action: 'auth.password_reset', summary: 'Password reset with emailed link; all sessions signed out', entityType: 'user', entityId: user.id, actor: { userId: user.id, name: user.displayName, role: 'self' } }, req)
  if (user.email) await sendMail({ to: user.email, subject: 'Your password was changed', text: `Assalamu Alaikum ${user.displayName},\n\nYour password was just reset and all devices were signed out. If this was not you, contact the Madarsa office immediately.` })
}

export async function changePassword(req: Request, current: string, next: string) {
  const a = req.auth!
  const user = await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } })
  if (!(await verifyPassword(user.passwordHash, current))) throw new AppError(401, 'REAUTH_FAILED', 'Current password is not correct.')
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } })
    await revokeAllSessions(user.id, 'password_changed', tx, a.session.id)
  })
  await audit({ action: 'auth.password_changed', summary: 'Password changed; other sessions signed out', entityType: 'user', entityId: user.id }, req)
}

export async function acceptInvite(req: Request, token: string, password: string) {
  await consume(LIMITS.tokenPerIp, req.ip ?? 'unknown')
  const t = await consumeToken(token, 'INVITE')
  if (!t) throw new AppError(400, 'INVALID_TOKEN', 'This invitation is invalid or has expired. Ask the office for a new one.')
  const user = await prisma.user.findUniqueOrThrow({ where: { id: t.userId } })
  if (user.status === 'DISABLED') throw new AppError(400, 'INVALID_TOKEN', 'This invitation is invalid or has expired. Ask the office for a new one.')
  await prisma.user.update({
    where: { id: user.id },
    // Receiving the link proves control of the email address, when there is one.
    data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), status: 'ACTIVE', ...(user.email ? { emailVerifiedAt: new Date() } : {}) },
  })
  await audit({ action: 'auth.invite_accepted', summary: 'Account activated from invitation', entityType: 'user', entityId: user.id, actor: { userId: user.id, name: user.displayName, role: 'self' } }, req)
}

/** Second half of an administrator MFA reset: recovery token + the user's own password. */
export async function startRecovery(req: Request, res: Response, token: string, identifier: string, password: string) {
  await consume(LIMITS.tokenPerIp, req.ip ?? 'unknown')
  await consume(LIMITS.loginPerAccount, normaliseIdentifier(identifier))
  const user = await prisma.user.findFirst({ where: { OR: [{ email: normaliseIdentifier(identifier) }, { username: normaliseIdentifier(identifier) }] } })
  const passwordOk = await verifyPassword(user?.passwordHash, password)
  if (!user || !passwordOk || user.status !== 'ACTIVE') throw invalidCredentials()
  // Consume only after the password matches and the token is this user's, so a
  // typo or someone else's credentials cannot burn the link.
  const owned = await peekToken(token, 'MFA_RECOVERY')
  const t =
    owned && owned.userId === user.id
      ? await prisma.$transaction(async (tx) => {
          const tok = await consumeToken(token, 'MFA_RECOVERY', tx)
          if (!tok) return null
          const r = await tx.mfaRecoveryRequest.findUnique({ where: { tokenId: tok.id } })
          return r && r.status === 'PENDING' ? r : null
        })
      : null
  if (!t) {
    await audit({ action: 'mfa.recovery_failed', summary: 'Invalid or expired recovery link/ticket used', entityType: 'user', entityId: user.id, actor: { userId: user.id, name: user.displayName, role: 'self' } }, req)
    throw new AppError(400, 'INVALID_TOKEN', 'This recovery link or ticket is invalid, expired or already used. Contact the office.')
  }
  await audit({ action: 'mfa.recovery_identity_verified', summary: `Recovery ${t.method === 'IN_PERSON' ? 'ticket' : 'link'} and password verified`, entityType: 'user', entityId: user.id, actor: { userId: user.id, name: user.displayName, role: 'self' } }, req)
  return startSession(req, res, user.id, 'MFA_ENROLLMENT', await rolesOf(user.id), { recoveryRequestId: t.id })
}
