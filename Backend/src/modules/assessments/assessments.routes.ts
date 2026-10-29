import { Router } from 'express'
import { z } from 'zod'
import { Track } from '../../generated/prisma/enums.js'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission } from '../../middleware/auth.js'
import { body, IsoDate } from '../../middleware/validate.js'
import * as exams from './assessments.service.js'

export const assessmentsRouter = Router()
const T = 'Assessments'
const Iso = IsoDate
const Ref = z.string().min(1).max(64)

const CreateExam = z.object({
  title: z.string().trim().min(3).max(120),
  type: z.enum(['Monthly Test', 'Term Exam', 'Oral Assessment', 'Hifz Juz Test', 'Weekly Test']),
  track: z.enum(Track),
  date: Iso,
  groupIds: z.array(z.string().uuid()).min(1).max(20),
  examinerId: z.string().uuid().optional(),
  subjects: z.array(z.object({ name: z.string().trim().min(2).max(60), max: z.number().int().min(1).max(1000) })).min(1).max(12).optional(),
})
const SaveResults = z.object({
  entries: z.array(z.object({ studentId: z.string().uuid(), absent: z.boolean().optional(), marks: z.record(z.string(), z.number()), remark: z.string().trim().max(300).optional() })).min(1).max(300),
  reason: z.string().trim().min(3).max(300).optional(),
})
const Grading = z.object({ bands: z.array(z.object({ grade: z.string().trim().min(1).max(40), arabic: z.string().trim().max(40).optional(), min: z.number().int().min(0).max(100), meaning: z.string().trim().max(80).optional() })).min(2).max(10) })

doc('get', '/exams', T, 'Exams the caller may see')
assessmentsRouter.get('/exams', requireAuth, async (req, res) => {
  res.json(await exams.listExams(req))
})

doc('post', '/exams', T, 'Schedule an exam (administration, or a mentor for own halqas)', { body: CreateExam })
assessmentsRouter.post('/exams', requireAuth, async (req, res) => {
  res.status(201).json(await exams.createExam(req, body(req, CreateExam)))
})

doc('get', '/exam-results', T, 'All results the caller may see (families: published only)')
assessmentsRouter.get('/exam-results', requireAuth, async (req, res) => {
  res.json(await exams.listAllResults(req))
})

doc('get', '/exams/:ref/results', T, 'Results with totals and grades (families: published only)')
assessmentsRouter.get('/exams/:ref/results', requireAuth, async (req, res) => {
  res.json(await exams.getResults(req, Ref.parse(req.params.ref)))
})

doc('put', '/exams/:ref/results', T, 'Enter or update marks', { body: SaveResults })
assessmentsRouter.put('/exams/:ref/results', requireAuth, async (req, res) => {
  const { entries, reason } = body(req, SaveResults)
  res.json(await exams.saveResults(req, Ref.parse(req.params.ref), entries, reason))
})

doc('post', '/exams/:ref/publish', T, 'Publish results to students and guardians', { auth: 'exams.manage' })
assessmentsRouter.post('/exams/:ref/publish', requirePermission('exams.manage'), async (req, res) => {
  res.json(await exams.publishExam(req, Ref.parse(req.params.ref)))
})

doc('get', '/grading', T, 'Current grading scale')
assessmentsRouter.get('/grading', requireAuth, async (_req, res) => {
  res.json(await exams.getGrading())
})

doc('put', '/grading', T, 'Replace the grading scale (creates a new version)', { body: Grading, auth: 'exams.manage' })
assessmentsRouter.put('/grading', requirePermission('exams.manage'), async (req, res) => {
  res.json(await exams.setGrading(req, body(req, Grading).bands))
})

doc('get', '/report-cards/:studentRef', T, 'A student’s report card from stored results')
assessmentsRouter.get('/report-cards/:studentRef', requireAuth, async (req, res) => {
  res.json(await exams.reportCard(req, Ref.parse(req.params.studentRef)))
})
