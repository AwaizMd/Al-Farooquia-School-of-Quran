import type { Request } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import type { LearningCategory, RevisionDone, TajweedQuality, TargetStatus, Track } from '../../generated/prisma/enums.js'
import { AppError, forbidden, notFound } from '../../common/errors.js'
import { addDaysIso, daysBetween, institutionToday } from '../../common/clock.js'
import { prisma } from '../../database/prisma.js'
import { academicScope } from '../../policies/students.js'
import { audit } from '../audit-logs/audit.service.js'
import { notifyStudentFamily } from '../notifications/notify.service.js'
import { isoDate, toDate } from '../students/students.service.js'
import { QAIDA_LESSON_COUNT, ayahRangeError, juzOf } from './quran.js'

/** Which kinds of record each learning track uses (matches the web app's SABAQ_CATEGORIES). */
export const CATEGORIES_FOR_TRACK: Record<Track, LearningCategory[]> = {
  HIFZ: ['SABAQ', 'SABQI', 'MANZIL'],
  NAZIRA: ['NAZIRA'],
  QAIDA: ['QAIDA'],
  ALIM: ['MANZIL', 'NAZIRA'],
}
/** How far back a mentor may record a lesson (administration has no limit). */
const MENTOR_BACKDATE_DAYS = 7
/** How long the author may edit their record. */
const MENTOR_EDIT_DAYS = 1

export interface LearningInput {
  studentId: string
  date: string
  category: LearningCategory
  surah?: number | undefined
  fromAyah?: number | undefined
  toAyah?: number | undefined
  qaidaLesson?: number | undefined
  performance: number
  mistakes: number
  fluency: number
  tajweed: TajweedQuality
  prevRevision: RevisionDone
  revisionQuality?: number | null | undefined
  targetStatus: TargetStatus
  comments: string
  nextTarget: string
  followUp: boolean
}

const fieldError = (path: string, message: string) => new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path, message }])

function shape(input: LearningInput, track: Track) {
  if (!CATEGORIES_FOR_TRACK[track].includes(input.category)) throw fieldError('category', `This category is not used for the ${track.toLowerCase()} track.`)
  if (input.category === 'QAIDA') {
    if (!input.qaidaLesson || input.qaidaLesson < 1 || input.qaidaLesson > QAIDA_LESSON_COUNT) throw fieldError('qaidaLesson', `Choose a lesson from 1 to ${QAIDA_LESSON_COUNT}.`)
    return { surah: null, fromAyah: null, toAyah: null, juz: null, qaidaLesson: input.qaidaLesson }
  }
  if (!input.surah || !input.fromAyah || !input.toAyah) throw fieldError('surah', 'Choose the Surah and ayah range.')
  const err = ayahRangeError(input.surah, input.fromAyah, input.toAyah)
  if (err) throw fieldError(err.startsWith('Select') ? 'surah' : err.startsWith('Starting') ? 'fromAyah' : 'toAyah', err)
  return { surah: input.surah, fromAyah: input.fromAyah, toAyah: input.toAyah, juz: juzOf(input.surah, input.fromAyah), qaidaLesson: null }
}

async function authorise(req: Request, studentId: string) {
  const auth = req.auth!
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { group: { include: { mentors: { where: { endedAt: null }, include: { staff: true } } } } } })
  if (!student) throw notFound()
  const manage = auth.permissions.has('learning.manage')
  const teaches = student.group.mentors.some((m) => m.staff.userId === auth.user.id && m.staff.status === 'ACTIVE')
  if (!manage && !teaches) {
    // Do not reveal whether an unrelated student exists.
    const visible = academicScope(auth)
    if (!visible || !(await prisma.student.count({ where: { AND: [visible, { id: studentId }] } }))) throw notFound()
    throw forbidden('Only the student’s mentor can record their lessons.')
  }
  return { student, manage, teachingStaffId: student.group.mentors[0]?.staff.id ?? null }
}

const INCLUDE = { student: { select: { admissionNo: true, name: true } }, mentor: { select: { code: true, displayName: true } }, _count: { select: { revisions: true } } } satisfies Prisma.LearningRecordInclude
type Row = Prisma.LearningRecordGetPayload<{ include: typeof INCLUDE }>

export const view = (r: Row) => ({
  id: r.id, studentId: r.studentId, admissionNo: r.student.admissionNo, studentName: r.student.name, mentor: r.mentor, date: isoDate(r.date), createdAt: r.createdAt,
  category: r.category, surah: r.surah, fromAyah: r.fromAyah, toAyah: r.toAyah, juz: r.juz, qaidaLesson: r.qaidaLesson,
  performance: r.performance, mistakes: r.mistakes, fluency: r.fluency, tajweed: r.tajweed, prevRevision: r.prevRevision, revisionQuality: r.revisionQuality,
  targetStatus: r.targetStatus, comments: r.comments, nextTarget: r.nextTarget, followUp: r.followUp, edited: r._count.revisions > 0,
})

export async function createRecord(req: Request, input: LearningInput) {
  const { student, manage, teachingStaffId } = await authorise(req, input.studentId)
  const today = await institutionToday()
  if (input.date > today) throw fieldError('date', 'The lesson date cannot be in the future.')
  if (input.date < isoDate(student.admissionDate)!) throw fieldError('date', 'The lesson date is before the student’s admission.')
  if (!manage && daysBetween(input.date, today) > MENTOR_BACKDATE_DAYS) throw fieldError('date', `Mentors can record lessons from the last ${MENTOR_BACKDATE_DAYS} days only.`)
  if (student.status !== 'ACTIVE') throw new AppError(409, 'STUDENT_INACTIVE', 'This student is not active.')
  const parts = shape(input, student.group.track)
  const ownStaff = await prisma.staffProfile.findUnique({ where: { userId: req.auth!.user.id }, select: { id: true } })
  const record = await prisma.$transaction(async (tx) => {
    const r = await tx.learningRecord.create({
      data: {
        studentId: student.id, mentorId: ownStaff?.id ?? teachingStaffId, recordedById: req.auth!.user.id, date: toDate(input.date), category: input.category, ...parts,
        performance: input.performance, mistakes: input.mistakes, fluency: input.fluency, tajweed: input.tajweed, prevRevision: input.prevRevision,
        revisionQuality: input.revisionQuality ?? null, targetStatus: input.targetStatus, comments: input.comments.trim(), nextTarget: input.nextTarget.trim(), followUp: input.followUp,
      },
      include: INCLUDE,
    })
    await notifyStudentFamily(tx, student.id, { category: 'PROGRESS', title: `New lesson record for ${student.name.split(' ')[0]}`, body: `${input.category.charAt(0)}${input.category.slice(1).toLowerCase()} on ${input.date}. Next target: ${input.nextTarget.trim()}`, link: '/sabaq' })
    await audit({ action: 'learning.recorded', summary: `${input.category} on ${input.date} · performance ${input.performance}/5`, entityType: 'student', entityId: student.id, metadata: { recordId: r.id } }, req, tx)
    return r
  })
  const sameDay = await prisma.learningRecord.count({ where: { studentId: student.id, date: toDate(input.date), category: input.category } })
  return { record: view(record), duplicateForDay: sameDay > 1 }
}

export async function updateRecord(req: Request, id: string, patch: Partial<Omit<LearningInput, 'studentId'>>, reason: string | undefined) {
  const existing = await prisma.learningRecord.findUnique({ where: { id }, include: INCLUDE })
  if (!existing) throw notFound()
  const { student, manage } = await authorise(req, existing.studentId)
  const today = await institutionToday()
  if (!manage) {
    if (existing.recordedById !== req.auth!.user.id) throw forbidden('Only the mentor who recorded this lesson can change it.')
    if (daysBetween(isoDate(existing.createdAt)!, today) > MENTOR_EDIT_DAYS) throw forbidden('This record can no longer be changed by a mentor. Ask the office.')
  }
  if (manage && !reason) throw fieldError('reason', 'Give a reason for changing a saved record.')
  const merged: LearningInput = { ...view(existing), studentId: existing.studentId, date: patch.date ?? isoDate(existing.date)!, ...stripUndefined(patch) } as LearningInput
  if (merged.date > today) throw fieldError('date', 'The lesson date cannot be in the future.')
  const parts = shape(merged, student.group.track)
  const updated = await prisma.$transaction(async (tx) => {
    await tx.learningRecordRevision.create({ data: { recordId: id, previous: JSON.parse(JSON.stringify(view(existing))), reason: reason ?? null, editedById: req.auth!.user.id } })
    const r = await tx.learningRecord.update({
      where: { id },
      data: {
        date: toDate(merged.date), category: merged.category, ...parts, performance: merged.performance, mistakes: merged.mistakes, fluency: merged.fluency,
        tajweed: merged.tajweed, prevRevision: merged.prevRevision, revisionQuality: merged.revisionQuality ?? null, targetStatus: merged.targetStatus,
        comments: merged.comments.trim(), nextTarget: merged.nextTarget.trim(), followUp: merged.followUp,
      },
      include: INCLUDE,
    })
    await audit({ action: 'learning.edited', summary: `Lesson record of ${isoDate(existing.date)} edited${reason ? `: ${reason}` : ''}`, entityType: 'student', entityId: existing.studentId, metadata: { recordId: id } }, req, tx)
    return r
  })
  return view(updated)
}

const stripUndefined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>

export async function listRecords(req: Request, q: { from?: string | undefined; to?: string | undefined; studentId?: string | undefined; page: number; pageSize: number }) {
  const scope = academicScope(req.auth!)
  const today = await institutionToday()
  const to = q.to ?? today
  const from = q.from ?? addDaysIso(to, -89)
  if (!scope) return { from, to, total: 0, page: q.page, pageSize: q.pageSize, items: [] }
  const where: Prisma.LearningRecordWhereInput = { date: { gte: toDate(from), lte: toDate(to) }, student: scope, ...(q.studentId ? { studentId: q.studentId } : {}) }
  const [total, rows] = await Promise.all([
    prisma.learningRecord.count({ where }),
    prisma.learningRecord.findMany({ where, include: INCLUDE, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ])
  return { from, to, total, page: q.page, pageSize: q.pageSize, items: rows.map(view) }
}

export async function revisionsOf(req: Request, id: string) {
  const scope = academicScope(req.auth!)
  const r = scope && (await prisma.learningRecord.findFirst({ where: { id, student: scope }, include: { revisions: { orderBy: { at: 'asc' } } } }))
  if (!r) throw notFound()
  return { items: r.revisions.map((v) => ({ at: v.at, reason: v.reason, previous: v.previous })) }
}
