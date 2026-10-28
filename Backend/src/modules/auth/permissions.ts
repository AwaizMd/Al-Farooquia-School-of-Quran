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
  // Mark or change any halqa's attendance (mentors may mark their own halqas without this).
  'attendance.manage',
  // Correct attendance on past days (with a reason).
  'attendance.correct',
  // Record or edit learning records for any student (mentors may for their own halqas).
  'learning.manage',
  // Schedule any exam, publish results, change the grading scale.
  'exams.manage',
  'fees.read',
  'fees.record',
  'fees.invoice',
  'fees.adjust',
  'fees.refund',
  'hostel.read',
  'hostel.manage',
  // Add library resources (and edit one's own).
  'library.upload',
  // Edit or archive anyone's library resources.
  'library.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const GRANTS: Record<Role, readonly Permission[]> = {
  ADMIN: ['users.read', 'users.manage', 'mfa.reset', 'security.manage', 'audit.read', 'settings.manage', 'students.read', 'students.write', 'guardians.read', 'staff.read', 'staff.manage', 'groups.manage', 'concessions.manage', 'attendance.manage', 'attendance.correct', 'learning.manage', 'exams.manage', 'fees.read', 'fees.record', 'fees.invoice', 'fees.adjust', 'fees.refund', 'hostel.read', 'hostel.manage', 'library.upload', 'library.manage'],
  // Approved: the Principal sees institution-wide information but not security administration.
  PRINCIPAL: ['users.read', 'audit.read', 'students.read', 'guardians.read', 'staff.read', 'attendance.correct', 'fees.read', 'hostel.read'],
  MENTOR: ['library.upload'],
  STUDENT: [],
  PARENT: [],
  WARDEN: ['hostel.read', 'hostel.manage'],
}

export function permissionsFor(roles: readonly Role[]) {
  return new Set<Permission>(roles.flatMap((r) => GRANTS[r]))
}

/** Roles whose sessions use the shorter staff timeouts. */
export const STAFF_ROLES: readonly Role[] = ['ADMIN', 'PRINCIPAL', 'MENTOR', 'WARDEN']
