import type { Request } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import type { StaffStatus } from '../../generated/prisma/enums.js'
import { conflict, notFound } from '../../common/errors.js'
import { prisma } from '../../database/prisma.js'
import { studentScope } from '../../policies/students.js'
import { audit } from '../audit-logs/audit.service.js'
import { isoDate, toDate } from '../students/students.service.js'

const openMentor = { mentors: { where: { endedAt: null }, include: { staff: true } } } satisfies Prisma.GroupInclude

/**
 * Halqas. Staff see all of them; families see only the halqas of the students
 * they can see.
 */
export async function listGroups(req: Request) {
  const staffView = req.auth!.permissions.has('staff.read') || req.auth!.roles.some((r) => r === 'MENTOR' || r === 'WARDEN')
  let where: Prisma.GroupWhereInput = {}
  if (!staffView) {
    const scope = studentScope(req.auth!)
    if (!scope) return { items: [] }
    where = { students: { some: scope } }
  }
  const rows = await prisma.group.findMany({ where, include: { ...openMentor, _count: { select: { students: { where: { status: 'ACTIVE' } } } } }, orderBy: { code: 'asc' } })
  return {
    items: rows.map((g) => {
      const m = g.mentors[0]?.staff
      return { id: g.id, code: g.code, name: g.name, short: g.short, track: g.track, room: g.room, timing: g.timing, gender: g.gender, active: g.active, activeStudents: g._count.students, mentor: m ? { id: m.id, code: m.code, displayName: m.displayName, title: m.title } : null }
    }),
  }
}

const STAFF_INCLUDE = { assignments: { where: { endedAt: null }, include: { group: true } }, user: { select: { roles: { select: { role: true } } } } } satisfies Prisma.StaffProfileInclude

/** Teaching staff: anyone with a halqa, without an account, or whose account has the Mentor role (not, say, the Principal or Warden). */
const teaches = (s: Prisma.StaffProfileGetPayload<{ include: typeof STAFF_INCLUDE }>) => s.assignments.length > 0 || !s.user || s.user.roles.some((r) => r.role === 'MENTOR')

const fullStaff = (s: Prisma.StaffProfileGetPayload<{ include: typeof STAFF_INCLUDE }>) => ({
  id: s.id, code: s.code, displayName: s.displayName, title: s.title, phone: s.phone, email: s.email, joinedOn: isoDate(s.joinedOn), status: s.status,
  qualification: s.qualification, specialisation: s.specialisation, hasAccount: !!s.userId, teaches: teaches(s),
  groups: s.assignments.map((a) => ({ id: a.group.id, code: a.group.code, name: a.group.name })),
})

/** Staff directory. Without staff.read, only the mentors of visible students' halqas, by name and title. */
export async function listStaff(req: Request) {
  const include = STAFF_INCLUDE
  if (req.auth!.permissions.has('staff.read')) {
    const rows = await prisma.staffProfile.findMany({ include, orderBy: { code: 'asc' } })
    return { items: rows.map(fullStaff) }
  }
  const scope = studentScope(req.auth!)
  const own = await prisma.staffProfile.findUnique({ where: { userId: req.auth!.user.id }, include })
  const rows = scope ? await prisma.staffProfile.findMany({ where: { assignments: { some: { endedAt: null, group: { students: { some: scope } } } } }, include, orderBy: { code: 'asc' } }) : []
  const items = rows.filter((s) => s.id !== own?.id).map((s) => ({ id: s.id, code: s.code, displayName: s.displayName, title: s.title, status: s.status, groups: s.assignments.map((a) => ({ id: a.group.id, code: a.group.code, name: a.group.name })) }))
  return { items: own ? [fullStaff(own), ...items] : items }
}

export interface StaffInput {
  displayName: string
  title: string
  phone?: string | undefined
  email?: string | undefined
  joinedOn?: string | undefined
  qualification?: string | undefined
  specialisation?: string | undefined
}

export async function createStaff(req: Request, input: StaffInput) {
  const staff = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('staff_code_seq') AS n`
    const s = await tx.staffProfile.create({
      data: { code: `ST-${String(row!.n).padStart(3, '0')}`, displayName: input.displayName.trim(), title: input.title.trim(), phone: input.phone?.trim() || null, email: input.email?.trim().toLowerCase() || null, joinedOn: input.joinedOn ? toDate(input.joinedOn) : null, qualification: input.qualification?.trim() || null, specialisation: input.specialisation?.trim() || null },
      include: STAFF_INCLUDE,
    })
    await audit({ action: 'staff.created', summary: `Staff profile created: ${s.title}`, entityType: 'staff', entityId: s.id }, req, tx)
    return s
  })
  return fullStaff(staff)
}

export async function setStaffStatus(req: Request, id: string, status: StaffStatus) {
  const s = await prisma.staffProfile.findUnique({ where: { id }, include: STAFF_INCLUDE })
  if (!s) throw notFound()
  if (status === 'INACTIVE' && s.assignments.length) {
    throw conflict('STAFF_ASSIGNED', `Assign another mentor to ${s.assignments.map((a) => a.group.name).join(', ')} before marking this mentor inactive.`)
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.staffProfile.update({ where: { id }, data: { status }, include: STAFF_INCLUDE })
    await audit({ action: 'staff.status_changed', summary: `Marked ${status.toLowerCase()}`, entityType: 'staff', entityId: id }, req, tx)
    return u
  })
  return fullStaff(updated)
}

/** Assign a halqa's mentor; the previous assignment is closed, not overwritten. */
export async function assignMentor(req: Request, groupId: string, staffId: string) {
  await prisma.$transaction(async (tx) => {
    // Serialise concurrent reassignments of the same halqa.
    await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId}::uuid FOR UPDATE`
    const group = await tx.group.findUnique({ where: { id: groupId }, include: openMentor })
    if (!group) throw notFound()
    const staff = await tx.staffProfile.findUnique({ where: { id: staffId } })
    if (!staff || staff.status !== 'ACTIVE') throw conflict('STAFF_INACTIVE', 'Choose an active staff member.')
    const current = group.mentors[0]
    if (current?.staffId === staffId) return
    if (current) await tx.groupMentorAssignment.update({ where: { id: current.id }, data: { endedAt: new Date() } })
    await tx.groupMentorAssignment.create({ data: { groupId, staffId } })
    const count = await tx.student.count({ where: { groupId, status: 'ACTIVE' } })
    await audit({ action: 'group.mentor_assigned', summary: `${staff.displayName} assigned to ${group.name}${current ? ` (replacing ${current.staff.displayName})` : ''} · ${count} students`, entityType: 'group', entityId: groupId, metadata: { from: current?.staff.code ?? null, to: staff.code } }, req, tx)
  })
  return listGroups(req)
}

export async function listGuardians(q: { search?: string | undefined; page: number; pageSize: number }) {
  const where: Prisma.GuardianWhereInput = q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }, { code: { contains: q.search, mode: 'insensitive' } }] } : {}
  const [total, rows] = await Promise.all([
    prisma.guardian.count({ where }),
    prisma.guardian.findMany({ where, include: { students: { include: { student: { select: { admissionNo: true, name: true } } } } }, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ])
  return {
    total, page: q.page, pageSize: q.pageSize,
    items: rows.map((g) => ({ id: g.id, code: g.code, name: g.name, relation: g.relation, phone: g.phone, email: g.email, occupation: g.occupation, hasAccount: !!g.userId, children: g.students.map((s) => s.student) })),
  }
}

export async function listFeePlans() {
  const rows = await prisma.feePlan.findMany({ where: { active: true }, orderBy: { code: 'asc' } })
  return { items: rows.map((p) => ({ id: p.id, code: p.code, name: p.name, amountMinor: p.amountMinor, currency: p.currency, cycle: p.cycle, covers: p.covers })) }
}
