import { Router } from 'express'
import { z } from 'zod'
import { Role, UserStatus } from '../../generated/prisma/enums.js'
import { doc } from '../../docs/route.js'
import { requirePermission, requireRecentAuth } from '../../middleware/auth.js'
import { body, query } from '../../middleware/validate.js'
import * as users from './users.service.js'

export const adminRouter = Router()
const T = 'Administration'

const RoleEnum = z.enum(Role)
const IdParam = z.object({ id: z.string().uuid() })
const Page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }
const ListUsers = z.object({ search: z.string().trim().max(100).optional(), role: RoleEnum.optional(), status: z.enum(UserStatus).optional(), ...Page })
const CreateUser = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254).optional(),
    username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,40}$/, 'Use 3–40 letters, numbers, dots, dashes or underscores.').optional(),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).optional(),
    roles: z.array(RoleEnum).min(1).max(6),
    link: z.object({ kind: z.enum(['staff', 'guardian', 'student']), id: z.string().uuid() }).optional(),
  })
  .refine((v) => v.email || v.username, { message: 'Give an email or a username.', path: ['email'] })
const SetRoles = z.object({ roles: z.array(RoleEnum).min(1).max(6) })
const SetStatus = z.object({ active: z.boolean() })
const ResetMfa = z.object({ reason: z.string().trim().min(5).max(500), method: z.enum(['EMAIL_LINK', 'IN_PERSON']) })
const Policy = z.object({ policy: z.array(z.object({ role: RoleEnum, required: z.boolean() })).min(1).max(6) })
const AuditQuery = z.object({ entityId: z.string().max(64).optional(), action: z.string().max(64).optional(), ...Page })

const uniq = <T>(xs: T[]) => [...new Set(xs)]

doc('get', '/admin/users', T, 'List accounts', { query: ListUsers, auth: 'users.read' })
adminRouter.get('/users', requirePermission('users.read'), async (req, res) => {
  res.json(await users.listUsers(query(req, ListUsers)))
})

doc('get', '/admin/users/:id', T, 'Get one account', { auth: 'users.read' })
adminRouter.get('/users/:id', requirePermission('users.read'), async (req, res) => {
  res.json(await users.getUser(IdParam.parse(req.params).id))
})

doc('post', '/admin/users', T, 'Create an account and send its invitation', { body: CreateUser, auth: 'users.manage + recent re-authentication' })
adminRouter.post('/users', requirePermission('users.manage'), requireRecentAuth(), async (req, res) => {
  const input = body(req, CreateUser)
  res.setHeader('Cache-Control', 'no-store')
  res.status(201).json(await users.createUser(req, { ...input, roles: uniq(input.roles) }))
})

doc('post', '/admin/users/:id/invite', T, 'Send the invitation again', { auth: 'users.manage' })
adminRouter.post('/users/:id/invite', requirePermission('users.manage'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(await users.resendInvite(req, IdParam.parse(req.params).id))
})

doc('put', '/admin/users/:id/roles', T, 'Replace an account’s roles', { body: SetRoles, auth: 'users.manage + recent re-authentication' })
adminRouter.put('/users/:id/roles', requirePermission('users.manage'), requireRecentAuth(), async (req, res) => {
  res.json(await users.setRoles(req, IdParam.parse(req.params).id, uniq(body(req, SetRoles).roles)))
})

doc('post', '/admin/users/:id/status', T, 'Activate or deactivate an account', { body: SetStatus, auth: 'users.manage + recent re-authentication' })
adminRouter.post('/users/:id/status', requirePermission('users.manage'), requireRecentAuth(), async (req, res) => {
  res.json(await users.setStatus(req, IdParam.parse(req.params).id, body(req, SetStatus).active))
})

doc('post', '/admin/users/:id/mfa/reset', T, 'Reset MFA / lost authenticator device', { body: ResetMfa, auth: 'mfa.reset + recent re-authentication' })
adminRouter.post('/users/:id/mfa/reset', requirePermission('mfa.reset'), requireRecentAuth(), async (req, res) => {
  const { reason, method } = body(req, ResetMfa)
  res.setHeader('Cache-Control', 'no-store')
  res.json(await users.resetMfa(req, IdParam.parse(req.params).id, reason, method))
})

doc('get', '/admin/security/mfa-policy', T, 'Which roles must use two-step verification', { auth: 'security.manage' })
adminRouter.get('/security/mfa-policy', requirePermission('security.manage'), async (_req, res) => {
  res.json({ policy: await users.getMfaPolicy() })
})

doc('put', '/admin/security/mfa-policy', T, 'Change the MFA policy', { body: Policy, auth: 'security.manage + recent re-authentication' })
adminRouter.put('/security/mfa-policy', requirePermission('security.manage'), requireRecentAuth(), async (req, res) => {
  res.json({ policy: await users.setMfaPolicy(req, body(req, Policy).policy) })
})

doc('get', '/admin/audit-logs', T, 'Activity log', { query: AuditQuery, auth: 'audit.read' })
adminRouter.get('/audit-logs', requirePermission('audit.read'), async (req, res) => {
  res.json(await users.listAuditLogs(query(req, AuditQuery)))
})
