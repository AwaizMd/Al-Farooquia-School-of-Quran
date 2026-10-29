import type { Request } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Role, UserStatus } from '../../generated/prisma/enums.js'
import { env } from '../../config/env.js'
import { AppError, conflict, notFound } from '../../common/errors.js'
import { prisma } from '../../database/prisma.js'
import { sendMail } from '../../integrations/mail/mailer.js'
import { audit } from '../audit-logs/audit.service.js'
import { revokeAllCredentials } from '../mfa/mfa.service.js'
import { normaliseIdentifier } from '../auth/auth.service.js'
import { revokeAllSessions } from '../auth/session.service.js'
import { TOKEN_TTL_MS, issueToken } from '../auth/tokens.js'

const IN_PERSON_TICKET_TTL_MS = 15 * 60 * 1000

const publicUser = { id: true, email: true, username: true, displayName: true, phone: true, status: true, locale: true, createdAt: true, emailVerifiedAt: true, mfaRecoveryPending: true, roles: { select: { role: true } } } satisfies Prisma.UserSelect

type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUser }>
const view = async (u: PublicUser) => ({
  ...u,
  roles: u.roles.map((r) => r.role),
  mfaEnabled: (await prisma.mfaCredential.count({ where: { userId: u.id, status: 'ACTIVE' } })) > 0,
})

export async function listUsers(q: { search?: string; role?: Role; status?: UserStatus; page: number; pageSize: number }) {
  const where: Prisma.UserWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.role ? { roles: { some: { role: q.role } } } : {}),
    ...(q.search ? { OR: [{ displayName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search.toLowerCase() } }, { username: { contains: q.search.toLowerCase() } }] } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: publicUser, orderBy: { displayName: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ])
  return { total, page: q.page, pageSize: q.pageSize, items: await Promise.all(rows.map(view)) }
}

export async function getUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: publicUser })
  if (!u) throw notFound()
  return view(u)
}

/** Sends the invitation. Accounts without email get a setup link for the office to hand over in person. */
async function deliverInvite(user: { id: string; email: string | null; displayName: string }) {
  const { raw } = await issueToken(user.id, 'INVITE')
  const link = `${env.APP_BASE_URL}/accept-invite?token=${raw}`
  if (!user.email) return { delivery: 'in_person' as const, setupLink: link, expiresAt: new Date(Date.now() + TOKEN_TTL_MS.INVITE) }
  const sent = await sendMail({ to: user.email, subject: 'Your Madarsa account', text: `Assalamu Alaikum ${user.displayName},\n\nAn account has been created for you. Choose your password within 72 hours using this link:\n${link}\n\nIf you were not expecting this, you can ignore this email.` })
  return { delivery: sent.ok ? ('email' as const) : ('email_failed' as const) }
}

export type AccountLink = { kind: 'staff' | 'guardian' | 'student'; id: string }
const LINK_ROLES: Record<AccountLink['kind'], Role[]> = { staff: ['ADMIN', 'PRINCIPAL', 'MENTOR', 'WARDEN'], guardian: ['PARENT'], student: ['STUDENT'] }

export async function createUser(req: Request, input: { displayName: string; email?: string | undefined; username?: string | undefined; phone?: string | undefined; roles: Role[]; link?: AccountLink | undefined }) {
  const email = input.email ? normaliseIdentifier(input.email) : null
  const username = input.username ? normaliseIdentifier(input.username) : null
  if (!email && !username) throw new AppError(422, 'VALIDATION_FAILED', 'Give an email or a username.')
  if (input.link && !input.roles.some((r) => LINK_ROLES[input.link!.kind].includes(r))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'link', message: `A ${input.link.kind} record needs a matching role.` }])
  }
  const clash = await prisma.user.findFirst({ where: { OR: [...(email ? [{ email }, { username: email }] : []), ...(username ? [{ username }, { email: username }] : [])] } })
  if (clash) throw conflict('USER_EXISTS', 'An account with this email or username already exists.')
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { displayName: input.displayName, email, username, phone: input.phone ?? null, status: 'INVITED', roles: { create: input.roles.map((role) => ({ role })) } },
      select: publicUser,
    })
    if (input.link) {
      // Conditional update: a record that already has an account is never re-linked.
      const where = { id: input.link.id, userId: null }
      const n = input.link.kind === 'staff' ? await tx.staffProfile.updateMany({ where, data: { userId: u.id } })
        : input.link.kind === 'guardian' ? await tx.guardian.updateMany({ where, data: { userId: u.id } })
        : await tx.student.updateMany({ where, data: { userId: u.id } })
      if (n.count !== 1) throw conflict('LINK_UNAVAILABLE', 'That record does not exist or already has an account.')
    }
    await audit({ action: 'user.created', summary: `Account created with roles ${input.roles.join(', ')}${input.link ? ` and linked to a ${input.link.kind} record` : ''}`, entityType: 'user', entityId: u.id, metadata: input.link ? { link: input.link } : undefined }, req, tx)
    return u
  })
  const invite = await deliverInvite(user)
  return { user: await view(user), invite }
}

export async function resendInvite(req: Request, id: string) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw notFound()
  if (user.status !== 'INVITED') throw conflict('NOT_INVITED', 'This account is already set up.')
  const invite = await deliverInvite(user)
  await audit({ action: 'user.invite_resent', summary: 'Invitation sent again', entityType: 'user', entityId: id }, req)
  return invite
}

async function assertNotLastAdmin(userId: string, tx: Prisma.TransactionClient) {
  const others = await tx.user.count({ where: { id: { not: userId }, status: 'ACTIVE', roles: { some: { role: 'ADMIN' } } } })
  if (others === 0) throw conflict('LAST_ADMIN', 'This is the only active administrator. Add another administrator first.')
}

export async function setRoles(req: Request, id: string, roles: Role[]) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, include: { roles: true } })
    if (!user) throw notFound()
    const before = user.roles.map((r) => r.role)
    if (before.includes('ADMIN') && !roles.includes('ADMIN')) {
      if (id === req.auth!.user.id) throw conflict('SELF_DEMOTION', 'You cannot remove your own administrator role.')
      await assertNotLastAdmin(id, tx)
    }
    await tx.userRole.deleteMany({ where: { userId: id } })
    await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, role })) })
    // Permissions are read per request, but sign out so the new role's MFA policy applies at next sign-in.
    await revokeAllSessions(id, 'roles_changed', tx)
    await audit({ action: 'user.roles_changed', summary: `Roles changed from ${before.join(', ') || 'none'} to ${roles.join(', ')}`, entityType: 'user', entityId: id, metadata: { before, after: roles } }, req, tx)
    return getUserTx(tx, id)
  })
}

const getUserTx = async (tx: Prisma.TransactionClient, id: string) => view(await tx.user.findUniqueOrThrow({ where: { id }, select: publicUser }))

export async function setStatus(req: Request, id: string, active: boolean) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, include: { roles: true } })
    if (!user) throw notFound()
    if (!active) {
      if (id === req.auth!.user.id) throw conflict('SELF_DEACTIVATION', 'You cannot deactivate your own account.')
      if (user.roles.some((r) => r.role === 'ADMIN')) await assertNotLastAdmin(id, tx)
      await tx.user.update({ where: { id }, data: { status: 'DISABLED' } })
      await revokeAllSessions(id, 'account_disabled', tx)
    } else {
      if (user.status !== 'DISABLED') throw conflict('NOT_DISABLED', 'This account is not deactivated.')
      await tx.user.update({ where: { id }, data: { status: user.passwordHash ? 'ACTIVE' : 'INVITED' } })
    }
    await audit({ action: active ? 'user.activated' : 'user.deactivated', summary: active ? 'Account reactivated' : 'Account deactivated; all sessions signed out', entityType: 'user', entityId: id }, req, tx)
    return getUserTx(tx, id)
  })
}

/**
 * "Reset MFA / lost authenticator". Revokes the old authenticator and every session
 * immediately (the lost phone may be in someone else's hands), then issues a
 * single-use recovery link or in-person ticket. The QR code is only shown after
 * the user proves identity with that link/ticket plus their own password.
 */
export async function resetMfa(req: Request | null, id: string, reason: string, method: 'EMAIL_LINK' | 'IN_PERSON', actorOverride?: { name: string }) {
  if (req?.auth?.user.id === id) throw conflict('SELF_RESET', 'Use your own security settings to change your authenticator.')
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user || user.status === 'DISABLED') throw notFound()
  if (method === 'EMAIL_LINK' && (!user.email || !user.emailVerifiedAt)) {
    throw conflict('NO_VERIFIED_EMAIL', 'This user has no verified email. Use the in-person procedure instead.')
  }
  const actor = req?.auth ? undefined : { userId: null, name: actorOverride?.name ?? 'System', role: 'system' }

  const { raw, request, revokedCredentials, revokedSessions } = await prisma.$transaction(async (tx) => {
    // Lock the user row so concurrent resets run one after another; the newer
    // one then supersedes any request still pending.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`
    await tx.mfaRecoveryRequest.updateMany({ where: { userId: id, status: 'PENDING' }, data: { status: 'CANCELLED' } })
    const revokedCredentials = await revokeAllCredentials(id, tx)
    const revokedSessions = await revokeAllSessions(id, 'mfa_reset', tx)
    await tx.user.update({ where: { id }, data: { mfaRecoveryPending: true } })
    const { raw, row } = await issueToken(id, 'MFA_RECOVERY', tx, method === 'IN_PERSON' ? IN_PERSON_TICKET_TTL_MS : undefined)
    const request = await tx.mfaRecoveryRequest.create({ data: { userId: id, initiatedById: req?.auth?.user.id ?? null, reason, method, tokenId: row.id } })
    await audit({ action: 'mfa.reset_by_admin', summary: `Authenticator reset (${method === 'IN_PERSON' ? 'in-person' : 'email link'}): ${reason}`, entityType: 'user', entityId: id, metadata: { method, revokedCredentials, revokedSessions, recoveryRequestId: request.id }, ...(actor ? { actor } : {}) }, req ?? undefined, tx)
    return { raw, request, revokedCredentials, revokedSessions }
  })

  const link = `${env.APP_BASE_URL}/mfa-recovery?token=${raw}`
  let notification: 'sent' | 'failed' | 'none' = 'none'
  if (user.email) {
    const text =
      method === 'EMAIL_LINK'
        ? `Assalamu Alaikum ${user.displayName},\n\nThe Madarsa office reset two-step verification on your account. To set up your new phone, open this link within 30 minutes and sign in with your password:\n${link}\n\nThis link works once. It does not contain your authenticator code. If you did not ask for this, contact the office immediately.`
        : `Assalamu Alaikum ${user.displayName},\n\nThe Madarsa office reset two-step verification on your account after an in-person check. If this was not you, contact the office immediately.`
    notification = (await sendMail({ to: user.email, subject: 'Two-step verification was reset', text })).ok ? 'sent' : 'failed'
  }
  if (notification === 'failed') {
    await audit({ action: 'mfa.reset_notification_failed', summary: 'Recovery email could not be sent; use the in-person procedure', entityType: 'user', entityId: id, ...(actor ? { actor } : {}) }, req ?? undefined)
  }
  return {
    recoveryRequestId: request.id,
    revokedCredentials,
    revokedSessions,
    notification,
    // An in-person ticket is shown once to the administrator to hand over; it is useless without the user's password.
    ...(method === 'IN_PERSON' ? { inPersonTicket: raw, ticketExpiresAt: new Date(Date.now() + IN_PERSON_TICKET_TTL_MS) } : {}),
  }
}

export async function getMfaPolicy() {
  return prisma.mfaPolicy.findMany({ orderBy: { role: 'asc' }, select: { role: true, required: true } })
}

/** Roles that must always use MFA. The policy can add roles to this list but never remove them. */
export const MFA_BASELINE: readonly Role[] = ['ADMIN', 'PRINCIPAL', 'MENTOR']

export async function setMfaPolicy(req: Request, policy: { role: Role; required: boolean }[]) {
  const lowered = policy.filter((p) => !p.required && MFA_BASELINE.includes(p.role)).map((p) => p.role)
  if (lowered.length) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'policy', message: `Two-step verification is always required for ${lowered.join(', ')}.` }])
  }
  await prisma.$transaction(policy.map((p) => prisma.mfaPolicy.upsert({ where: { role: p.role }, update: { required: p.required }, create: p })))
  await audit({ action: 'security.mfa_policy_changed', summary: `MFA policy: ${policy.map((p) => `${p.role}=${p.required ? 'required' : 'optional'}`).join(', ')}`, entityType: 'mfa_policy', metadata: policy }, req)
  return getMfaPolicy()
}

export async function listAuditLogs(q: { page: number; pageSize: number; entityId?: string | undefined; action?: string | undefined }) {
  const where: Prisma.AuditLogWhereInput = { ...(q.entityId ? { entityId: q.entityId } : {}), ...(q.action ? { action: { startsWith: q.action } } : {}) }
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, omit: { ip: true } }),
  ])
  return { total, page: q.page, pageSize: q.pageSize, items }
}
