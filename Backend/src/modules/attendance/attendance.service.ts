import type { Request } from 'express'
import type { AttendanceStatus } from '../../generated/prisma/enums.js'
import { AppError, conflict, forbidden, notFound } from '../../common/errors.js'
import { addDaysIso, daysBetween, institutionToday } from '../../common/clock.js'
import { prisma } from '../../database/prisma.js'
import { studentScope, taughtGroupsWhere } from '../../policies/students.js'
import { audit } from '../audit-logs/audit.service.js'
import { notifyStudentFamily } from '../notifications/notify.service.js'
import { isoDate, toDate } from '../students/students.service.js'

export interface MarkInput {
  groupId: string
  date: string
  records: { studentId: string; status: AttendanceStatus; note?: string | undefined }[]
  reason?: string | undefined
}

const MAX_RANGE_DAYS = 120

/**
 * Save a halqa's register for one day.
 * - Mentors mark their own halqas, for today only; they may change today's marks.
 * - Changing marks on an earlier day is a correction: attendance.correct and a reason.
 * - Nothing is assumed: students without a mark simply have no record yet.
 */
export async function markAttendance(req: Request, input: MarkInput) {
  const auth = req.auth!
  const today = await institutionToday()
  if (input.date > today) throw new AppError(422, 'FUTURE_DATE', 'Attendance cannot be marked for a future date.')
  const group = await prisma.group.findUnique({ where: { id: input.groupId } })
  if (!group) throw notFound()

  const canManage = auth.permissions.has('attendance.manage')
  const teaches = !canManage && (await prisma.group.count({ where: { id: group.id, ...taughtGroupsWhere(auth.user.id) } })) === 1
  const canCorrect = auth.permissions.has('attendance.correct')
  if (!canManage && !teaches && !canCorrect) throw forbidden('You can mark attendance only for your own halqas.')
  const pastDay = input.date < today
  if (pastDay && !canManage && !canCorrect) throw forbidden('Mentors can mark and correct attendance for today only. Ask the office to correct an earlier day.')

  const ids = [...new Set(input.records.map((r) => r.studentId))]
  if (ids.length !== input.records.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'records', message: 'Each student may appear once.' }])
  const day = toDate(input.date)
  // Only students enrolled in this halqa on that date can be on its register.
  const enrolled = await prisma.groupEnrollment.findMany({
    where: { groupId: group.id, studentId: { in: ids }, startedOn: { lte: day }, OR: [{ endedOn: null }, { endedOn: { gt: day } }] },
    select: { studentId: true },
  })
  const enrolledSet = new Set(enrolled.map((e) => e.studentId))
  const outside = ids.filter((id) => !enrolledSet.has(id))
  if (outside.length) throw new AppError(422, 'NOT_IN_HALQA', 'Some students were not in this halqa on that date.', outside)

  const result = await prisma.$transaction(async (tx) => {
    // Serialise saves of the same register (e.g. a double tap or two devices).
    await tx.$queryRaw`SELECT id FROM groups WHERE id = ${group.id}::uuid FOR UPDATE`
    const session = await tx.attendanceSession.upsert({
      where: { groupId_date: { groupId: group.id, date: day } },
      create: { groupId: group.id, date: day, markedById: auth.user.id },
      update: { markedById: auth.user.id },
    })
    const existing = await tx.attendanceRecord.findMany({ where: { studentId: { in: ids }, date: day } })
    const byStudent = new Map(existing.map((r) => [r.studentId, r]))
    let created = 0
    const corrections: { from: AttendanceStatus; to: AttendanceStatus }[] = []
    for (const r of input.records) {
      const prev = byStudent.get(r.studentId)
      if (!prev) {
        await tx.attendanceRecord.create({ data: { sessionId: session.id, studentId: r.studentId, date: day, status: r.status, note: r.note ?? null, markedById: auth.user.id } })
        created++
        continue
      }
      if (prev.sessionId !== session.id) throw conflict('MARKED_ELSEWHERE', 'A student was already marked in another halqa that day.')
      if (prev.status === r.status && (r.note ?? null) === prev.note) continue
      if (pastDay && !input.reason) throw new AppError(422, 'REASON_REQUIRED', 'Give a reason for correcting attendance on an earlier day.')
      if (prev.status !== r.status) {
        await tx.attendanceCorrection.create({ data: { recordId: prev.id, fromStatus: prev.status, toStatus: r.status, reason: input.reason ?? null, correctedById: auth.user.id } })
        corrections.push({ from: prev.status, to: r.status })
      }
      await tx.attendanceRecord.update({ where: { id: prev.id }, data: { status: r.status, note: r.note ?? null, markedById: auth.user.id } })
    }
    // Families hear about an absence the same day (once per newly recorded absence).
    for (const r of input.records) {
      const prev = byStudent.get(r.studentId)
      if (r.status === 'ABSENT' && prev?.status !== 'ABSENT') await notifyStudentFamily(tx, r.studentId, { category: 'ATTENDANCE', title: 'Marked absent', body: `${group.name} · ${input.date}. Please let the mentor know if this is not correct.`, link: '/journey' })
    }
    if (created || corrections.length) {
      await audit({
        action: corrections.length ? 'attendance.corrected' : 'attendance.marked',
        summary: `${group.name} · ${input.date}: ${created} marked${corrections.length ? `, ${corrections.length} corrected${input.reason ? ` (${input.reason})` : ''}` : ''}`,
        entityType: 'attendance_session', entityId: session.id, metadata: { date: input.date, created, corrections },
      }, req, tx)
    }
    return { sessionId: session.id, created, corrected: corrections.length }
  })
  return result
}

/** Class attendance for the students the caller may see, as { date: { admissionNo: status } }. */
export async function listAttendance(req: Request, q: { from?: string | undefined; to?: string | undefined; groupId?: string | undefined }) {
  const today = await institutionToday()
  const to = q.to ?? today
  const from = q.from ?? addDaysIso(to, -59)
  if (daysBetween(from, to) < 0 || daysBetween(from, to) > MAX_RANGE_DAYS) throw new AppError(422, 'RANGE_TOO_LARGE', `Choose a range of at most ${MAX_RANGE_DAYS} days.`)
  const scope = studentScope(req.auth!)
  if (!scope) return { from, to, today, days: {}, sessions: [] }
  const records = await prisma.attendanceRecord.findMany({
    where: { date: { gte: toDate(from), lte: toDate(to) }, student: scope, ...(q.groupId ? { session: { groupId: q.groupId } } : {}) },
    select: { date: true, status: true, student: { select: { admissionNo: true } } },
  })
  const days: Record<string, Record<string, string>> = {}
  for (const r of records) (days[isoDate(r.date)!] ||= {})[r.student.admissionNo] = r.status.toLowerCase()
  const sessions = await prisma.attendanceSession.findMany({
    where: { date: { gte: toDate(from), lte: toDate(to) }, group: { students: { some: scope } } },
    select: { date: true, group: { select: { code: true } }, updatedAt: true },
  })
  return { from, to, today, days, sessions: sessions.map((s) => ({ date: isoDate(s.date), groupCode: s.group.code, updatedAt: s.updatedAt })) }
}

/** Correction history of one student's record on one day (staff only). */
export async function correctionsFor(req: Request, studentId: string, date: string) {
  const scope = studentScope(req.auth!)
  if (!scope || !(req.auth!.permissions.has('attendance.correct') || req.auth!.roles.includes('MENTOR'))) throw forbidden()
  const rec = await prisma.attendanceRecord.findFirst({ where: { studentId, date: toDate(date), student: scope }, include: { corrections: { orderBy: { at: 'asc' } } } })
  if (!rec) throw notFound()
  return { status: rec.status, corrections: rec.corrections.map((c) => ({ from: c.fromStatus, to: c.toStatus, reason: c.reason, at: c.at })) }
}
