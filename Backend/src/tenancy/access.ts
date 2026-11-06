import type { RequestHandler } from 'express'
import type { Role } from '../generated/prisma/enums.js'
import { notFound } from '../common/errors.js'
import { prisma } from '../database/prisma.js'
import { permissionsFor, rolesWith, type Permission } from '../modules/auth/permissions.js'
import { asOrg, runInTenant } from './context.js'
import { assertFeature, madrasaProfile } from './settings.js'
import type { Feature } from '../generated/prisma/enums.js'

/** Roles held through user_roles (not tied to one madrasa). */
export const ORG_ROLES: readonly Role[] = ['SUPER_ADMIN', 'PARENT', 'STUDENT']

export interface MadrasaRef { id: string; code: string; name: string; shortName: string; roles: Role[] }

/**
 * Everything a user can reach: their org roles, the madrasas they may use and the
 * roles they hold in each. Memberships that are switched off or expired count as absent.
 */
export async function accessOf(userId: string) {
  return asOrg('resolve the madrasas a user may use', async () => {
    const now = new Date()
    const [orgRoles, memberships, kids, self] = await Promise.all([
      prisma.userRole.findMany({ where: { userId }, select: { role: true } }),
      prisma.madrasaMembership.findMany({ where: { userId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], madrasa: { active: true } }, select: { madrasaId: true, role: true } }),
      prisma.studentGuardian.findMany({ where: { guardian: { userId } }, select: { madrasaId: true } }),
      prisma.student.findMany({ where: { userId }, select: { madrasaId: true } }),
    ])
    const org = orgRoles.map((r) => r.role)
    const superAdmin = org.includes('SUPER_ADMIN')
    const madrasas = await prisma.madrasa.findMany({ where: superAdmin ? { active: true } : { active: true, id: { in: [...new Set([...memberships.map((m) => m.madrasaId), ...kids.map((k) => k.madrasaId), ...self.map((s) => s.madrasaId)])] } }, orderBy: { createdAt: 'asc' }, select: { id: true, code: true, name: true, shortName: true } })
    const family = new Set<string>([...(org.includes('PARENT') ? kids.map((k) => k.madrasaId) : []), ...(org.includes('STUDENT') ? self.map((s) => s.madrasaId) : [])])
    const list: MadrasaRef[] = madrasas.map((m) => {
      const roles = new Set<Role>(memberships.filter((x) => x.madrasaId === m.id).map((x) => x.role))
      if (superAdmin) roles.add('SUPER_ADMIN').add('MADRASA_ADMIN')
      if (family.has(m.id)) for (const r of org) if (r === 'PARENT' || r === 'STUDENT') roles.add(r)
      return { ...m, roles: [...roles] }
    })
    /** Every role anywhere: decides MFA and session timeouts (the strictest role wins). */
    const allRoles = [...new Set<Role>([...org, ...memberships.map((m) => m.role)])]
    const home = (await prisma.user.findUnique({ where: { id: userId }, select: { homeMadrasaId: true } }))?.homeMadrasaId ?? null
    return { orgRoles: org, madrasas: list, allRoles, family: [...family], home }
  })
}

/** Org roles plus every active membership role: for MFA and timeouts before a madrasa is chosen. */
export async function allRolesOf(userId: string): Promise<Role[]> {
  const now = new Date()
  const [org, mem] = await Promise.all([
    prisma.userRole.findMany({ where: { userId }, select: { role: true } }),
    prisma.madrasaMembership.findMany({ where: { userId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { role: true } }),
  ])
  return [...new Set<Role>([...org.map((r) => r.role), ...mem.map((m) => m.role)])]
}

const FAMILY_ROLES: readonly Role[] = ['PARENT', 'STUDENT']

/**
 * Where the app opens when no madrasa was chosen: staff in their home madrasa (where
 * the account was created) or else their first one; a family with children in one
 * madrasa uses it; a family across several reads across all of them (null).
 */
export function defaultMadrasa(access: { madrasas: MadrasaRef[]; home: string | null }): MadrasaRef | null {
  const staffIn = access.madrasas.filter((m) => m.roles.some((r) => !FAMILY_ROLES.includes(r)))
  return staffIn.find((m) => m.id === access.home) ?? staffIn[0] ?? (access.madrasas.length === 1 ? access.madrasas[0]! : null)
}

/**
 * Resolve the active madrasa for a fully signed-in request and run the rest of the
 * request inside it. The X-Madrasa-Id header is only a choice: it must be one of the
 * caller's madrasas, otherwise the answer is 404 (no hint that the madrasa exists).
 */
export const resolveMadrasa: RequestHandler = async (req, _res, next) => {
  const auth = req.auth
  if (!auth || auth.session.stage !== 'FULL') return next()
  const access = await accessOf(auth.user.id)
  const wanted = req.get('x-madrasa-id')
  let active: MadrasaRef | null
  if (wanted) {
    active = access.madrasas.find((m) => m.id === wanted) ?? null
    if (!active) return next(notFound())
  } else {
    active = defaultMadrasa(access)
  }
  const familyOnly = active ? active.roles.every((r) => FAMILY_ROLES.includes(r)) : true
  // A family-only user without a chosen madrasa reads across all their children's madrasas.
  const ids = active ? [active.id] : access.family
  // Without an active madrasa (a family across madrasas, or a Super Admin before the first madrasa exists).
  const roles: Role[] = active ? active.roles : [...new Set([...access.madrasas.flatMap((m) => m.roles), ...access.orgRoles])]
  auth.roles = roles
  auth.permissions = permissionsFor(roles)
  auth.madrasa = { activeId: active?.id ?? null, ids, list: access.madrasas, allRoles: access.allRoles, familyOnly }
  runInTenant({ ids, active: active?.id ?? null }, next)
}

/**
 * Reject requests to a module the active madrasa has switched off (CR-01 §1): the
 * API refuses, hiding the menu is only a convenience. A family reading across
 * several madrasas only sees the madrasas where the module is on.
 */
export const requireFeature =
  (feature: Feature): RequestHandler =>
  async (req, _res, next) => {
    const m = req.auth?.madrasa
    if (!m) return next() // not signed in: the route itself answers 401
    if (m.activeId) {
      await assertFeature(feature, m.activeId)
      return next()
    }
    const ids: string[] = []
    for (const id of m.ids) if ((await madrasaProfile(id)).features[feature]) ids.push(id)
    runInTenant({ ids, active: null }, next)
  }

/** Active accounts that hold a permission in a madrasa (e.g. everyone who can verify its payments). */
export async function usersWith(permission: Permission, madrasaId: string) {
  const roles = rolesWith(permission)
  const now = new Date()
  const rows = await asOrg('find the staff of one madrasa who hold a permission', () => prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { memberships: { some: { madrasaId, role: { in: roles }, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
        ...(roles.includes('SUPER_ADMIN') ? [{ roles: { some: { role: 'SUPER_ADMIN' as const } } }] : []),
      ],
    },
    select: { id: true },
  }))
  return rows.map((r) => r.id)
}
