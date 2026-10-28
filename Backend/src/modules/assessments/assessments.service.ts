import type { Request } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Track } from '../../generated/prisma/enums.js'
import { AppError, conflict, forbidden, notFound } from '../../common/errors.js'
import { institutionToday } from '../../common/clock.js'
import { prisma } from '../../database/prisma.js'
import { academicScope, accessLevel, ACCESS_INCLUDE, taughtGroupsWhere } from '../../policies/students.js'
import { audit } from '../audit-logs/audit.service.js'
import { isoDate, toDate } from '../students/students.service.js'

/** Default subjects per track (same as the web app's exam templates). */
export const DEFAULT_SUBJECTS: Record<Track, { name: string; max: number }[]> = {
  HIFZ: [{ name: 'Sabaq Recitation', max: 25 }, { name: 'Sabqi', max: 25 }, { name: 'Manzil', max: 25 }, { name: 'Tajweed', max: 25 }],
  NAZIRA: [{ name: 'Reading Fluency', max: 30 }, { name: 'Tajweed', max: 30 }, { name: 'Makharij', max: 20 }, { name: 'Duas & Masail', max: 20 }],
  QAIDA: [{ name: 'Letter Recognition', max: 30 }, { name: 'Makharij', max: 30 }, { name: 'Joining & Harakat', max: 25 }, { name: 'Duas', max: 15 }],
  ALIM: [{ name: 'Nahw (Grammar)', max: 50 }, { name: 'Fiqh', max: 50 }, { name: 'Hadith', max: 50 }, { name: 'Seerah', max: 50 }],
}

type Band = { grade: string; arabic: string | null; minPercent: number; meaning: string | null }
export function gradeFor(pct: number, bands: Band[]) {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent)
  return sorted.find((b) => pct >= b.minPercent) ?? sorted[sorted.length - 1]!
}

export async function activeScale(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const s = await db.gradingScale.findFirst({ where: { active: true }, include: { bands: true } })
  if (!s) throw new AppError(500, 'NO_GRADING_SCALE', 'No grading scale is configured.')
  return s
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isStaff = (req: Request) => req.auth!.permissions.has('students.read') || req.auth!.roles.includes('MENTOR')
/** Families only ever see results once an exam is published. */
const canSeeUnpublished = isStaff

const EXAM_INCLUDE = {
  groups: { include: { group: { select: { id: true, code: true, name: true } } } },
  subjects: { orderBy: { position: 'asc' } },
  examiner: { select: { id: true, code: true, displayName: true } },
  gradingScale: { include: { bands: true } },
} satisfies Prisma.ExamInclude
type ExamRow = Prisma.ExamGetPayload<{ include: typeof EXAM_INCLUDE }>

const examView = (e: ExamRow) => ({
  id: e.id, code: e.code, title: e.title, type: e.type, track: e.track, date: isoDate(e.date), status: e.status, publishedAt: e.publishedAt,
  groups: e.groups.map((g) => g.group), examiner: e.examiner, subjects: e.subjects.map((s) => ({ id: s.id, name: s.name, max: s.maxMarks })),
  gradingVersion: e.gradingScale?.version ?? null,
  // Published exams carry the scale they were graded with.
  grading: e.gradingScale ? e.gradingScale.bands.sort((x, y) => y.minPercent - x.minPercent).map((b) => ({ grade: b.grade, arabic: b.arabic, min: b.minPercent, meaning: b.meaning })) : null,
})

/** Exams the caller may see: everything for administration, own halqas for mentors, children's halqas for families. */
function examScope(req: Request): Prisma.ExamWhereInput | null {
  const auth = req.auth!
  if (auth.permissions.has('students.read')) return {}
  const or: Prisma.ExamWhereInput[] = []
  if (auth.roles.includes('MENTOR')) or.push({ groups: { some: { group: taughtGroupsWhere(auth.user.id) } } }, { examiner: { userId: auth.user.id } })
  const scope = academicScope(auth)
  if (scope) or.push({ groups: { some: { group: { students: { some: scope } } } } })
  return or.length ? { OR: or } : null
}

export async function listExams(req: Request) {
  const scope = examScope(req)
  if (!scope) return { items: [] }
  const rows = await prisma.exam.findMany({ where: { AND: [scope, { status: { not: 'CANCELLED' } }] }, include: EXAM_INCLUDE, orderBy: { date: 'asc' } })
  return { items: rows.map(examView) }
}

async function findExam(req: Request, id: string) {
  const scope = examScope(req)
  // Note: never pass `{ id: undefined }` to Prisma; it means "no filter".
  const byRef: Prisma.ExamWhereInput = UUID.test(id) ? { id } : { code: id }
  const e = scope && (await prisma.exam.findFirst({ where: { AND: [scope, byRef] }, include: EXAM_INCLUDE }))
  if (!e) throw notFound()
  return e
}

export interface ExamInput {
  title: string
  type: string
  track: Track
  date: string
  groupIds: string[]
  examinerId?: string | undefined
  subjects?: { name: string; max: number }[] | undefined
}

export async function createExam(req: Request, input: ExamInput) {
  const auth = req.auth!
  const groups = await prisma.group.findMany({ where: { id: { in: input.groupIds } }, include: { mentors: { where: { endedAt: null }, include: { staff: true } } } })
  if (groups.length !== input.groupIds.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'groupIds', message: 'Choose valid halqas.' }])
  if (groups.some((g) => g.track !== input.track)) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'groupIds', message: 'All halqas must follow the exam’s track.' }])
  const manage = auth.permissions.has('exams.manage')
  const ownStaff = await prisma.staffProfile.findUnique({ where: { userId: auth.user.id } })
  // Mentors may schedule tests for the halqas they teach.
  if (!manage && !(ownStaff && groups.every((g) => g.mentors.some((m) => m.staffId === ownStaff.id)))) throw forbidden('You can schedule tests only for your own halqas.')
  const subjects = input.subjects?.length ? input.subjects : DEFAULT_SUBJECTS[input.track]
  if (new Set(subjects.map((s) => s.name.toLowerCase())).size !== subjects.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'subjects', message: 'Subject names must be different.' }])
  const examinerId = input.examinerId ?? (manage ? groups[0]?.mentors[0]?.staffId : ownStaff?.id) ?? null
  const exam = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('exam_code_seq') AS n`
    const e = await tx.exam.create({
      data: {
        code: `EX-${String(row!.n).padStart(4, '0')}`, title: input.title.trim(), type: input.type, track: input.track, date: toDate(input.date), examinerId, createdById: auth.user.id,
        groups: { create: groups.map((g) => ({ groupId: g.id })) },
        subjects: { create: subjects.map((s, i) => ({ name: s.name.trim(), maxMarks: s.max, position: i })) },
      },
      include: EXAM_INCLUDE,
    })
    await audit({ action: 'exam.scheduled', summary: `${e.title} on ${input.date} · ${groups.map((g) => g.name).join(', ')}`, entityType: 'exam', entityId: e.id }, req, tx)
    return e
  })
  return examView(exam)
}

export interface ResultEntry { studentId: string; absent?: boolean | undefined; marks: Record<string, number>; remark?: string | undefined }

/** Enter or update marks. Marks are checked against each subject's maximum (and again by the database). */
export async function saveResults(req: Request, examRef: string, entries: ResultEntry[], reason: string | undefined) {
  const auth = req.auth!
  const exam = await findExam(req, examRef)
  if (exam.status === 'CANCELLED') throw conflict('EXAM_CANCELLED', 'This exam was cancelled.')
  const manage = auth.permissions.has('exams.manage')
  const ownStaff = await prisma.staffProfile.findUnique({ where: { userId: auth.user.id } })
  const teachesAll = ownStaff && (exam.examinerId === ownStaff.id || (await prisma.groupMentorAssignment.count({ where: { staffId: ownStaff.id, endedAt: null, groupId: { in: exam.groups.map((g) => g.group.id) } } })) > 0)
  if (!manage && !teachesAll) throw forbidden('Only the examiner or the halqa’s mentor can enter these marks.')
  if (exam.status === 'PUBLISHED' && !manage) throw forbidden('Results are published. Ask the office to correct them.')
  if (exam.status === 'PUBLISHED' && !reason) throw new AppError(422, 'REASON_REQUIRED', 'Give a reason for changing published results.')
  if (exam.date > toDate(await institutionToday())) throw new AppError(422, 'EXAM_NOT_HELD', 'Marks can be entered once the exam has been held.')

  const subjectByName = new Map(exam.subjects.map((s) => [s.name, s]))
  const errors: { path: string; message: string }[] = []
  entries.forEach((e, i) => {
    if (e.absent) return
    for (const s of exam.subjects) {
      const v = e.marks[s.name]
      if (v === undefined) errors.push({ path: `entries.${i}.marks.${s.name}`, message: `Enter marks for ${s.name}.` })
      else if (!Number.isInteger(v) || v < 0 || v > s.maxMarks) errors.push({ path: `entries.${i}.marks.${s.name}`, message: `${s.name} must be between 0 and ${s.maxMarks}.` })
    }
    for (const name of Object.keys(e.marks)) if (!subjectByName.has(name)) errors.push({ path: `entries.${i}.marks.${name}`, message: 'Unknown subject.' })
  })
  if (errors.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some marks are invalid.', errors)
  // Only students enrolled in one of the exam's halqas.
  const ids = entries.map((e) => e.studentId)
  const eligible = await prisma.student.count({ where: { id: { in: ids }, groupId: { in: exam.groups.map((g) => g.group.id) } } })
  if (eligible !== new Set(ids).size || ids.length !== new Set(ids).size) throw new AppError(422, 'NOT_IN_EXAM', 'Some students do not sit this exam.')

  await prisma.$transaction(async (tx) => {
    for (const e of entries) {
      const result = await tx.examResult.upsert({
        where: { examId_studentId: { examId: exam.id, studentId: e.studentId } },
        create: { examId: exam.id, studentId: e.studentId, absent: !!e.absent, remark: e.remark?.trim() || null, enteredById: auth.user.id },
        update: { absent: !!e.absent, remark: e.remark?.trim() || null, enteredById: auth.user.id },
      })
      await tx.examMark.deleteMany({ where: { resultId: result.id } })
      if (!e.absent) await tx.examMark.createMany({ data: exam.subjects.map((s) => ({ resultId: result.id, subjectId: s.id, marks: e.marks[s.name]! })) })
    }
    await audit({ action: exam.status === 'PUBLISHED' ? 'exam.results_corrected' : 'exam.results_saved', summary: `${exam.title}: marks saved for ${entries.length} student(s)${reason ? ` (${reason})` : ''}`, entityType: 'exam', entityId: exam.id }, req, tx)
  })
  return getResults(req, exam.id)
}

/** Results with totals and grades. Families see them only after publication. */
export async function getResults(req: Request, examRef: string) {
  const exam = await findExam(req, examRef)
  if (exam.status !== 'PUBLISHED' && !canSeeUnpublished(req)) return { exam: examView(exam), published: false, items: [] }
  const scope = academicScope(req.auth!)
  if (!scope) return { exam: examView(exam), published: exam.status === 'PUBLISHED', items: [] }
  const scale = exam.gradingScale ?? (await activeScale())
  const rows = await prisma.examResult.findMany({ where: { examId: exam.id, student: scope }, include: { marks: { include: { subject: true } }, student: { select: { id: true, admissionNo: true, name: true } } } })
  const max = exam.subjects.reduce((a, s) => a + s.maxMarks, 0)
  return {
    exam: examView(exam),
    published: exam.status === 'PUBLISHED',
    gradingVersion: scale.version,
    items: rows.map((r) => {
      const total = r.marks.reduce((a, m) => a + m.marks, 0)
      const pct = r.absent || !max ? 0 : Math.round((total / max) * 100)
      return {
        id: r.id, student: r.student, absent: r.absent, remark: r.remark,
        marks: Object.fromEntries(r.marks.map((m) => [m.subject.name, m.marks])),
        total, max, pct, grade: r.absent ? null : gradeFor(pct, scale.bands),
      }
    }),
  }
}

/** Every result the caller may see, across exams (same publication rules as getResults). */
export async function listAllResults(req: Request) {
  const examWhere = examScope(req)
  const scope = academicScope(req.auth!)
  if (!examWhere || !scope) return { items: [] }
  const rows = await prisma.examResult.findMany({
    where: { student: scope, exam: { AND: [examWhere, canSeeUnpublished(req) ? { status: { not: 'CANCELLED' } } : { status: 'PUBLISHED' }] } },
    include: { marks: { include: { subject: true } }, student: { select: { admissionNo: true } }, exam: { select: { code: true } } },
  })
  return { items: rows.map((r) => ({ id: r.id, examCode: r.exam.code, admissionNo: r.student.admissionNo, absent: r.absent, remark: r.remark, marks: Object.fromEntries(r.marks.map((m) => [m.subject.name, m.marks])) })) }
}

/** Publish: fixes the grading scale used and makes results visible to families. */
export async function publishExam(req: Request, examRef: string) {
  const exam = await findExam(req, examRef)
  if (exam.status !== 'SCHEDULED') throw conflict('NOT_PUBLISHABLE', 'Only a scheduled exam can be published.')
  const entered = await prisma.examResult.count({ where: { examId: exam.id } })
  if (entered === 0) throw conflict('NO_RESULTS', 'Enter results before publishing.')
  const updated = await prisma.$transaction(async (tx) => {
    const scale = await activeScale(tx)
    const r = await tx.exam.updateMany({ where: { id: exam.id, status: 'SCHEDULED' }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: req.auth!.user.id, gradingScaleId: scale.id } })
    if (r.count !== 1) throw conflict('NOT_PUBLISHABLE', 'This exam was already published.')
    await audit({ action: 'exam.published', summary: `${exam.title} published (${entered} results, grading v${scale.version})`, entityType: 'exam', entityId: exam.id }, req, tx)
    return tx.exam.findUniqueOrThrow({ where: { id: exam.id }, include: EXAM_INCLUDE })
  })
  return examView(updated)
}

export async function getGrading() {
  const s = await activeScale()
  return { version: s.version, bands: s.bands.sort((a, b) => b.minPercent - a.minPercent).map((b) => ({ grade: b.grade, arabic: b.arabic, min: b.minPercent, meaning: b.meaning })) }
}

export async function setGrading(req: Request, bands: { grade: string; arabic?: string | undefined; min: number; meaning?: string | undefined }[]) {
  const mins = bands.map((b) => b.min)
  if (new Set(mins).size !== mins.length) throw new AppError(422, 'VALIDATION_FAILED', 'Minimum percentages must be different.', [{ path: 'bands', message: 'Minimum percentages must be different.' }])
  if (!mins.includes(0)) throw new AppError(422, 'VALIDATION_FAILED', 'One grade must start at 0%.', [{ path: 'bands', message: 'One grade must start at 0% so every score has a grade.' }])
  await prisma.$transaction(async (tx) => {
    const current = await activeScale(tx)
    await tx.gradingScale.update({ where: { id: current.id }, data: { active: false } })
    await tx.gradingScale.create({ data: { version: current.version + 1, active: true, createdById: req.auth!.user.id, bands: { create: bands.map((b) => ({ grade: b.grade.trim(), arabic: b.arabic?.trim() || null, minPercent: b.min, meaning: b.meaning?.trim() || null })) } } })
    await audit({ action: 'exam.grading_changed', summary: `Grading scale v${current.version + 1}: ${bands.map((b) => `${b.grade} ≥ ${b.min}`).join(', ')}`, entityType: 'grading_scale' }, req, tx)
  })
  return getGrading()
}

/** A student's report card: every published (or, for staff, every) result, from stored records only. */
export async function reportCard(req: Request, studentRef: string) {
  const scope = academicScope(req.auth!)
  const s = scope && (await prisma.student.findFirst({ where: { AND: [scope, UUID.test(studentRef) ? { id: studentRef } : { admissionNo: studentRef }] }, include: ACCESS_INCLUDE }))
  if (!s || !accessLevel(req.auth!, s)) throw notFound()
  const results = await prisma.examResult.findMany({
    where: { studentId: s.id, exam: canSeeUnpublished(req) ? { status: { not: 'CANCELLED' } } : { status: 'PUBLISHED' } },
    include: { marks: { include: { subject: true } }, exam: { include: EXAM_INCLUDE } },
    orderBy: { exam: { date: 'asc' } },
  })
  const current = await activeScale()
  return {
    student: { id: s.id, admissionNo: s.admissionNo, name: s.name, group: { code: s.group.code, name: s.group.name } },
    items: results.map((r) => {
      const scale = r.exam.gradingScale ?? current
      const max = r.exam.subjects.reduce((a, x) => a + x.maxMarks, 0)
      const total = r.marks.reduce((a, m) => a + m.marks, 0)
      const pct = r.absent || !max ? 0 : Math.round((total / max) * 100)
      return { exam: examView(r.exam), absent: r.absent, remark: r.remark, marks: Object.fromEntries(r.marks.map((m) => [m.subject.name, m.marks])), total, max, pct, grade: r.absent ? null : gradeFor(pct, scale.bands), gradingVersion: scale.version }
    }),
  }
}
