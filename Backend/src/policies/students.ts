import type { Prisma } from '../generated/prisma/client.js'
import type { AuthContext } from '../types/express.js'

/**
 * How much of a student record a viewer may see:
 * - full:     administration, the Principal, linked guardians and the student themself
 * - teaching: the student's current mentor (no fee plan or concession)
 * - hostel:   wardens, for active hostel residents (identity, health, guardian contact)
 */
export type AccessLevel = 'full' | 'teaching' | 'hostel'
const RANK: Record<AccessLevel, number> = { hostel: 1, teaching: 2, full: 3 }

/** Fields needed to decide the access level of a fetched student. */
export const ACCESS_INCLUDE = {
  group: { include: { mentors: { where: { endedAt: null }, include: { staff: { select: { userId: true, code: true, displayName: true, title: true } } } } } },
  guardians: { include: { guardian: true } },
} satisfies Prisma.StudentInclude

type WithAccess = Prisma.StudentGetPayload<{ include: typeof ACCESS_INCLUDE }>

/**
 * Row-level scope for student queries. Returns null when the caller can see no
 * students at all. Every student query in the API must go through this.
 */
export function studentScope(auth: AuthContext): Prisma.StudentWhereInput | null {
  if (auth.permissions.has('students.read')) return {}
  const userId = auth.user.id
  const or: Prisma.StudentWhereInput[] = []
  if (auth.roles.includes('MENTOR')) or.push({ group: { mentors: { some: { endedAt: null, staff: { userId, status: 'ACTIVE' } } } } })
  if (auth.roles.includes('PARENT')) or.push({ guardians: { some: { guardian: { userId } } } })
  if (auth.roles.includes('STUDENT')) or.push({ userId })
  if (auth.roles.includes('WARDEN')) or.push({ hostelResident: true, status: 'ACTIVE' })
  return or.length ? { OR: or } : null
}

/** The highest level any of the caller's roles grants for this student (null = none). */
export function accessLevel(auth: AuthContext, s: WithAccess): AccessLevel | null {
  if (auth.permissions.has('students.read')) return 'full'
  const userId = auth.user.id
  const levels: AccessLevel[] = []
  if (auth.roles.includes('PARENT') && s.guardians.some((g) => g.guardian.userId === userId)) levels.push('full')
  if (auth.roles.includes('STUDENT') && s.userId === userId) levels.push('full')
  if (auth.roles.includes('MENTOR') && s.group.mentors.some((m) => m.staff.userId === userId)) levels.push('teaching')
  if (auth.roles.includes('WARDEN') && s.hostelResident && s.status === 'ACTIVE') levels.push('hostel')
  return levels.sort((a, b) => RANK[b] - RANK[a])[0] ?? null
}
