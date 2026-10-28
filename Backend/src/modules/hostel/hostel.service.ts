import type { Request } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import type { HostelRollStatus } from '../../generated/prisma/enums.js'
import { AppError, conflict, notFound } from '../../common/errors.js'
import { addDaysIso, daysBetween, institutionToday } from '../../common/clock.js'
import { prisma } from '../../database/prisma.js'
import { audit } from '../audit-logs/audit.service.js'
import { notifyStudentFamily } from '../notifications/notify.service.js'
import { isoDate, toDate } from '../students/students.service.js'

type Tx = Prisma.TransactionClient

export async function overview() {
  const rooms = await prisma.hostelRoom.findMany({
    where: { active: true },
    include: { beds: { where: { active: true }, orderBy: { label: 'asc' }, include: { assignments: { where: { endedAt: null }, include: { student: { select: { id: true, admissionNo: true, name: true } } } } } } },
    orderBy: { code: 'asc' },
  })
  const residents = await prisma.student.findMany({ where: { hostelResident: true, status: 'ACTIVE' }, select: { id: true, admissionNo: true, name: true, bedAssignments: { where: { endedAt: null }, select: { bedId: true } } } })
  return {
    rooms: rooms.map((r) => ({ id: r.id, code: r.code, block: r.block, floor: r.floor, beds: r.beds.map((b) => ({ id: b.id, label: b.label, occupant: b.assignments[0]?.student ?? null })) })),
    unassigned: residents.filter((s) => s.bedAssignments.length === 0).map(({ bedAssignments: _b, ...s }) => s),
  }
}

/** Assign or transfer a resident. Database constraints make double-booking impossible even under races. */
export async function assignBed(req: Request, bedId: string, studentId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const bed = await tx.hostelBed.findUnique({ where: { id: bedId }, include: { room: true, assignments: { where: { endedAt: null } } } })
      if (!bed || !bed.active) throw notFound()
      if (bed.assignments.length) throw conflict('BED_OCCUPIED', 'This bed is already occupied. Release it first.')
      const student = await tx.student.findUnique({ where: { id: studentId }, include: { bedAssignments: { where: { endedAt: null }, include: { bed: { include: { room: true } } } } } })
      if (!student) throw notFound()
      if (!student.hostelResident || student.status !== 'ACTIVE') throw conflict('NOT_RESIDENT', 'Only active hostel residents can be given a bed. Mark the student as a hostel resident first.')
      const from = student.bedAssignments[0]
      if (from) await tx.bedAssignment.update({ where: { id: from.id }, data: { endedAt: new Date(), endReason: 'transferred' } })
      await tx.bedAssignment.create({ data: { bedId, studentId, assignedById: req.auth!.user.id } })
      await audit({ action: from ? 'hostel.transferred' : 'hostel.assigned', summary: `${student.name}: ${from ? `${from.bed.room.code} ${from.bed.label} → ` : ''}${bed.room.code} ${bed.label}`, entityType: 'student', entityId: studentId }, req, tx)
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('BED_OCCUPIED', 'This bed was just assigned to someone else.')
    throw err
  }
  return overview()
}

export async function releaseBed(req: Request, bedId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const a = await tx.bedAssignment.findFirst({ where: { bedId, endedAt: null }, include: { student: true, bed: { include: { room: true } } } })
    if (!a) throw conflict('BED_EMPTY', 'This bed is not occupied.')
    await tx.bedAssignment.update({ where: { id: a.id }, data: { endedAt: new Date(), endReason: reason } })
    await audit({ action: 'hostel.released', summary: `${a.student.name} left ${a.bed.room.code} ${a.bed.label}: ${reason}`, entityType: 'student', entityId: a.studentId }, req, tx)
  })
  return overview()
}

/** Close any open bed when a student stops being an active resident (used by student updates). */
export async function releaseIfNotResident(tx: Tx, studentId: string) {
  const s = await tx.student.findUnique({ where: { id: studentId }, select: { hostelResident: true, status: true } })
  if (s && (!s.hostelResident || s.status !== 'ACTIVE')) await tx.bedAssignment.updateMany({ where: { studentId, endedAt: null }, data: { endedAt: new Date(), endReason: 'no_longer_resident' } })
}

export async function history(studentId?: string) {
  const rows = await prisma.bedAssignment.findMany({ where: studentId ? { studentId } : {}, include: { bed: { include: { room: true } }, student: { select: { admissionNo: true, name: true } } }, orderBy: { startedAt: 'desc' }, take: 200 })
  return { items: rows.map((a) => ({ id: a.id, student: a.student, room: a.bed.room.code, bed: a.bed.label, startedAt: a.startedAt, endedAt: a.endedAt, endReason: a.endReason })) }
}

/** Night roll call. Earlier days can be changed with a reason (kept in the audit log). */
export async function saveRollCall(req: Request, input: { date: string; entries: { studentId: string; status: HostelRollStatus; note?: string | undefined }[]; reason?: string | undefined }) {
  const today = await institutionToday()
  if (input.date > today) throw new AppError(422, 'FUTURE_DATE', 'Roll call cannot be recorded for a future date.')
  // Night roll call is often taken after midnight, so "yesterday" still counts as the current night.
  const pastNight = daysBetween(input.date, today) > 1
  const ids = input.entries.map((e) => e.studentId)
  if (new Set(ids).size !== ids.length) throw new AppError(422, 'VALIDATION_FAILED', 'Each resident may appear once.')
  const residents = await prisma.student.count({ where: { id: { in: ids }, hostelResident: true, status: 'ACTIVE' } })
  if (residents !== ids.length) throw new AppError(422, 'NOT_RESIDENT', 'Some students are not active hostel residents.')
  const day = toDate(input.date)
  return prisma.$transaction(async (tx) => {
    const existing = new Map((await tx.hostelRollEntry.findMany({ where: { date: day, studentId: { in: ids } } })).map((e) => [e.studentId, e]))
    const changes: { studentId: string; from: string; to: string }[] = []
    let created = 0
    for (const e of input.entries) {
      const prev = existing.get(e.studentId)
      if (prev && prev.status === e.status) continue
      if (prev && pastNight && !input.reason) throw new AppError(422, 'REASON_REQUIRED', 'Give a reason for changing an earlier roll call.')
      await tx.hostelRollEntry.upsert({ where: { studentId_date: { studentId: e.studentId, date: day } }, create: { studentId: e.studentId, date: day, status: e.status, note: e.note ?? null, markedById: req.auth!.user.id }, update: { status: e.status, note: e.note ?? null, markedById: req.auth!.user.id } })
      if (prev) changes.push({ studentId: e.studentId, from: prev.status, to: e.status })
      else created++
      if (e.status === 'ABSENT' && prev?.status !== 'ABSENT') await notifyStudentFamily(tx, e.studentId, { category: 'ATTENDANCE', title: 'Absent from hostel roll call', body: `Night of ${input.date}. Please contact the warden.`, link: '/journey' })
    }
    if (created || changes.length) await audit({ action: changes.length ? 'hostel.roll_corrected' : 'hostel.roll_call', summary: `Roll call ${input.date}: ${created} marked${changes.length ? `, ${changes.length} changed${input.reason ? ` (${input.reason})` : ''}` : ''}`, entityType: 'hostel', metadata: { date: input.date, changes } }, req, tx)
    return { created, changed: changes.length }
  })
}

export async function rollCalls(q: { from?: string | undefined; to?: string | undefined }) {
  const today = await institutionToday()
  const to = q.to ?? today
  const from = q.from ?? addDaysIso(to, -30)
  const rows = await prisma.hostelRollEntry.findMany({ where: { date: { gte: toDate(from), lte: toDate(to) } }, select: { date: true, status: true, student: { select: { admissionNo: true } } } })
  const days: Record<string, Record<string, string>> = {}
  for (const r of rows) (days[isoDate(r.date)!] ||= {})[r.student.admissionNo] = r.status.toLowerCase()
  return { from, to, days }
}
