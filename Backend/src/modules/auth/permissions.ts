import type { Role } from '../../generated/prisma/enums.js'

// The permission matrix (CR-01 §10). Permissions are granted per role in code so
// they are reviewed and tested with the code that relies on them. A user's roles
// are those they hold in the ACTIVE madrasa (plus organization roles); several
// roles give the union. Routes check permissions, never role names.
export const PERMISSIONS = [
  // Organization: create madrasas, switch features, manage org-level users.
  'org.manage',
  'users.read',
  'users.manage',
  'mfa.reset',
  'security.manage',
  'audit.read',
  // This madrasa's details, settings and feature flags.
  'settings.manage',
  // Every student of the madrasa (others get row-level scopes, see policies/students.ts).
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
  // Approve or reject bank transfer / UPI payments reported by families.
  'fees.verify',
  // Bank details and the UPI QR code families pay to.
  'payments.configure',
  'hostel.read',
  'hostel.manage',
  // Accounts module (CR-01 §6).
  'accounts.read',
  'accounts.write',
  'accounts.export',
  'accounts.close_period',
  // Register, configure and monitor attendance kiosks.
  'kiosks.manage',
  // See every salary and payslip of the madrasa.
  'payroll.read',
  // Set salaries and rules, and prepare a month's payroll.
  'payroll.manage',
  // Approve a prepared payroll and record that it was paid.
  'payroll.approve',
  // Halaqa programs, sessions and participants.
  'halaqa.read',
  'halaqa.manage',
  // Mark attendance in the Halaqas this person teaches (row-level check in the service).
  'halaqa.attendance',
  // The Mureed directory and its records.
  'mureeds.read',
  'mureeds.manage',
  // Private notes: every read is audited.
  'mureeds.private_notes',
  // Website content; publishing is separate from drafting.
  'site.manage',
  'site.publish',
  // Public applications: Principal only, not even administrators.
  'applications.read',
  'applications.decide',
  // Everyone's attendance, shifts and monthly figures.
  'staff_attendance.read',
  // Correct attendance, manage shifts and exemptions, cancel QR codes.
  'staff_attendance.manage',
  // Dashboards (CR-01 §7): aggregates; drill-down to individual students is separate.
  'analytics.read',
  'analytics.students',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const MADRASA_ADMIN: readonly Permission[] = [
  'users.read', 'users.manage', 'mfa.reset', 'security.manage', 'audit.read', 'settings.manage', 'students.read', 'students.write', 'guardians.read', 'staff.read',
  'staff.manage', 'groups.manage', 'concessions.manage', 'attendance.manage', 'attendance.correct', 'learning.manage', 'exams.manage', 'fees.read', 'fees.record',
  'fees.invoice', 'fees.adjust', 'fees.refund', 'fees.verify', 'payments.configure', 'hostel.read', 'hostel.manage', 'accounts.read', 'accounts.write',
  'accounts.export', 'accounts.close_period', 'analytics.read', 'analytics.students', 'kiosks.manage', 'staff_attendance.read', 'staff_attendance.manage',
  'payroll.read', 'payroll.manage', 'payroll.approve', 'halaqa.read', 'halaqa.manage', 'site.manage',
]

const GRANTS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: ['org.manage', ...MADRASA_ADMIN],
  MADRASA_ADMIN,
  // Academic oversight with drill-down; sees fees and accounts as summaries only.
  PRINCIPAL: ['halaqa.read', 'halaqa.manage', 'halaqa.attendance', 'mureeds.read', 'mureeds.manage', 'mureeds.private_notes', 'site.manage', 'site.publish', 'applications.read', 'applications.decide', 'users.read', 'audit.read', 'students.read', 'guardians.read', 'staff.read', 'attendance.correct', 'fees.read', 'hostel.read', 'analytics.read', 'analytics.students', 'staff_attendance.read'],
  // Read-only, aggregates; drill-down only where the madrasa allows it (committeeCanViewStudents).
  COMMITTEE_MEMBER: ['analytics.read'],
  // Read-only accounts and exports. Never writes.
  CA: ['fees.read', 'accounts.read', 'accounts.export'],
  ACCOUNTANT: ['students.read', 'guardians.read', 'fees.read', 'fees.record', 'fees.invoice', 'fees.verify', 'accounts.read', 'accounts.write', 'accounts.export', 'accounts.close_period', 'staff_attendance.read', 'payroll.read', 'payroll.manage'],
  MENTOR: ['halaqa.attendance', ],
  STUDENT: [],
  PARENT: [],
  WARDEN: ['hostel.read', 'hostel.manage'],
}

export function permissionsFor(roles: readonly Role[]) {
  return new Set<Permission>(roles.flatMap((r) => GRANTS[r]))
}

/** Roles that use the shorter staff session timeouts (everyone but families). */
export const STAFF_ROLES: readonly Role[] = ['SUPER_ADMIN', 'MADRASA_ADMIN', 'PRINCIPAL', 'COMMITTEE_MEMBER', 'CA', 'ACCOUNTANT', 'MENTOR', 'WARDEN']

/** Roles that hold a permission (for example, to notify everyone who can verify payments). */
export const rolesWith = (p: Permission) => (Object.keys(GRANTS) as Role[]).filter((r) => GRANTS[r].includes(p))

/** The matrix itself, for documentation and the frontend's navigation. */
export const permissionMatrix = () => Object.fromEntries((Object.keys(GRANTS) as Role[]).map((r) => [r, [...GRANTS[r]]]))
