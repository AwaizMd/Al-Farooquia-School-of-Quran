import { Router } from 'express'
import { z } from 'zod'
import { AttendanceStatus, LearningCategory, RevisionDone, TajweedQuality, TargetStatus } from '../../generated/prisma/enums.js'
import { doc } from '../../docs/route.js'
import { requireAuth } from '../../middleware/auth.js'
import { body, query } from '../../middleware/validate.js'
import * as attendance from '../attendance/attendance.service.js'
import * as learning from './learning.service.js'

export const learningRouter = Router()

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine((s) => !Number.isNaN(Date.parse(s)), 'Not a valid date.')
const Id = z.string().uuid()
const Rating = z.number().int().min(1).max(5)

const Mark = z.object({
  groupId: Id,
  date: Iso,
  records: z.array(z.object({ studentId: Id, status: z.enum(AttendanceStatus), note: z.string().trim().max(200).optional() })).min(1).max(200),
  reason: z.string().trim().min(3).max(300).optional(),
})
const Range = z.object({ from: Iso.optional(), to: Iso.optional(), groupId: Id.optional() })

const Fields = {
  date: Iso,
  category: z.enum(LearningCategory),
  surah: z.number().int().min(1).max(114).optional(),
  fromAyah: z.number().int().min(1).max(286).optional(),
  toAyah: z.number().int().min(1).max(286).optional(),
  qaidaLesson: z.number().int().min(1).max(17).optional(),
  performance: Rating,
  mistakes: z.number().int().min(0).max(99),
  fluency: Rating,
  tajweed: z.enum(TajweedQuality),
  prevRevision: z.enum(RevisionDone),
  revisionQuality: Rating.nullable().optional(),
  targetStatus: z.enum(TargetStatus),
  comments: z.string().trim().max(1000),
  nextTarget: z.string().trim().min(1).max(300),
  followUp: z.boolean(),
}
const CreateRecord = z.object({ studentId: Id, ...Fields })
const UpdateRecord = z.object({ ...Object.fromEntries(Object.entries(Fields).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof Fields]: z.ZodOptional<(typeof Fields)[K]> }, reason: z.string().trim().min(3).max(300).optional() })
const ListRecords = z.object({ from: Iso.optional(), to: Iso.optional(), studentId: Id.optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(1000).default(500) })

doc('post', '/attendance', 'Attendance', 'Save a halqa register for a day (corrections after the day need a reason)', { body: Mark })
learningRouter.post('/attendance', requireAuth, async (req, res) => {
  res.json(await attendance.markAttendance(req, body(req, Mark)))
})

doc('get', '/attendance', 'Attendance', 'Class attendance of visible students in a date range', { query: Range })
learningRouter.get('/attendance', requireAuth, async (req, res) => {
  res.json(await attendance.listAttendance(req, query(req, Range)))
})

doc('get', '/attendance/:studentId/:date/corrections', 'Attendance', 'Correction history of one mark')
learningRouter.get('/attendance/:studentId/:date/corrections', requireAuth, async (req, res) => {
  res.json(await attendance.correctionsFor(req, Id.parse(req.params.studentId), Iso.parse(req.params.date)))
})

doc('get', '/learning-records', 'Learning', 'Lesson records of visible students', { query: ListRecords })
learningRouter.get('/learning-records', requireAuth, async (req, res) => {
  res.json(await learning.listRecords(req, query(req, ListRecords)))
})

doc('post', '/learning-records', 'Learning', 'Record a lesson (the student’s mentor or administration)', { body: CreateRecord })
learningRouter.post('/learning-records', requireAuth, async (req, res) => {
  res.status(201).json(await learning.createRecord(req, body(req, CreateRecord)))
})

doc('patch', '/learning-records/:id', 'Learning', 'Edit a lesson record (keeps the previous version)', { body: UpdateRecord })
learningRouter.patch('/learning-records/:id', requireAuth, async (req, res) => {
  const { reason, ...patch } = body(req, UpdateRecord)
  res.json(await learning.updateRecord(req, Id.parse(req.params.id), patch, reason))
})

doc('get', '/learning-records/:id/revisions', 'Learning', 'Earlier versions of a lesson record')
learningRouter.get('/learning-records/:id/revisions', requireAuth, async (req, res) => {
  res.json(await learning.revisionsOf(req, Id.parse(req.params.id)))
})
