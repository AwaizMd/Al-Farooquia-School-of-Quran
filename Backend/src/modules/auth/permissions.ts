import type { Role } from '../../generated/prisma/enums.js'

// Permissions are granted per role in code so they are reviewed and tested with
// the code that relies on them. A user with several roles gets the union.
export const PERMISSIONS = [
  'users.read',
  'users.manage',
  'mfa.reset',
  'security.manage',
  'audit.read',
  'settings.manage',
  // Institution-wide read of every student (others get row-level scopes, see policies/students.ts).
  'students.read',
  'students.write',
  'guardians.read',
  'staff.read',
  'staff.manage',
  'groups.manage',
  'concessions.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const GRANTS: Record<Role, readonly Permission[]> = {
  ADMIN: ['users.read', 'users.manage', 'mfa.reset', 'security.manage', 'audit.read', 'settings.manage', 'students.read', 'students.write', 'guardians.read', 'staff.read', 'staff.manage', 'groups.manage', 'concessions.manage'],
  // Approved: the Principal sees institution-wide information but not security administration.
  PRINCIPAL: ['users.read', 'audit.read', 'students.read', 'guardians.read', 'staff.read'],
  MENTOR: [],
  STUDENT: [],
  PARENT: [],
  WARDEN: [],
}

export function permissionsFor(roles: readonly Role[]) {
  return new Set<Permission>(roles.flatMap((r) => GRANTS[r]))
}

/** Roles whose sessions use the shorter staff timeouts. */
export const STAFF_ROLES: readonly Role[] = ['ADMIN', 'PRINCIPAL', 'MENTOR', 'WARDEN']
