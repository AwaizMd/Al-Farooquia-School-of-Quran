import express, { Router } from 'express'
import { z } from 'zod'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission } from '../../middleware/auth.js'
import { IsoDate, body, query } from '../../middleware/validate.js'
import * as halaqa from './halaqa.service.js'
import * as mureeds from './mureeds.service.js'

export const halaqaRouter = Router()
const T = 'Halaqa'
const M = 'Mureeds'
const Id = z.string().uuid()
const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')
const Text = (max: number) => z.string().trim().max(max)
const Opt = (max: number) => Text(max).nullable().optional()
const Phone = z.string().trim().regex(/^[+\d][\d\s()-]{6,19}$/, 'Enter a valid phone number.')
const Email = z.string().trim().email('Enter a valid email address.').max(254)
const IMAGES = ['image/png', 'image/jpeg', 'image/webp']
const orderOk = (x: { startDate?: string | null | undefined; endDate?: string | null | undefined }) => !x.startDate || !x.endDate || x.startDate <= x.endDate
const orderMsg = { path: ['endDate'], message: 'The end date must not be before the start date.' }

// ---------- Dashboard, categories ----------

doc('get', '/halaqa/dashboard', T, 'Figures for the Halaqa dashboard', { auth: 'halaqa.read' })
halaqaRouter.get('/halaqa/dashboard', requirePermission('halaqa.read'), async (req, res) => {
  res.json(await halaqa.dashboard(req))
})
doc('get', '/halaqa/categories', T, 'Halaqa categories', { auth: 'halaqa.read' })
halaqaRouter.get('/halaqa/categories', requirePermission('halaqa.read'), async (_req, res) => {
  res.json(await halaqa.listCategories())
})
const NewCategory = z.object({ name: Text(60).min(2) }).strict()
const EditCategory = z.object({ name: Text(60).min(2).optional(), active: z.boolean().optional() }).strict()
doc('post', '/halaqa/categories', T, 'Add a category', { body: NewCategory, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/categories', requirePermission('halaqa.manage'), async (req, res) => {
  res.status(201).json(await halaqa.saveCategory(req, null, body(req, NewCategory)))
})
doc('patch', '/halaqa/categories/:id', T, 'Change a category', { body: EditCategory, auth: 'halaqa.manage' })
halaqaRouter.patch('/halaqa/categories/:id', requirePermission('halaqa.manage'), async (req, res) => {
  res.json(await halaqa.saveCategory(req, Id.parse(req.params.id), body(req, EditCategory)))
})

// ---------- Participants (declared before /halaqa/:id so these words are not read as ids) ----------

const ParticipantFields = { phone: Phone.nullable().optional(), email: Email.nullable().optional().or(z.literal('').transform(() => null)), address: Opt(300), guardianName: Opt(120), guardianPhone: Phone.nullable().optional(), dob: IsoDate.nullable().optional(), notes: Opt(1000), isMureed: z.boolean().optional(), mureedSince: IsoDate.nullable().optional() }
const NewParticipant = z.object({ fullName: Text(120).min(2).optional(), studentId: Id.optional(), confirmDuplicate: z.boolean().optional(), ...ParticipantFields }).strict().refine((x) => x.fullName || x.studentId, { path: ['fullName'], message: 'Enter a name or choose a student.' })
const EditParticipant = z.object({ fullName: Text(120).min(2).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), ...ParticipantFields }).strict()
const ListParticipants = z.object({ search: Text(100).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), mureed: z.enum(['true', 'false']).transform((v) => v === 'true').optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) })
doc('get', '/halaqa/participants', T, 'Participants', { query: ListParticipants, auth: 'halaqa.read' })
halaqaRouter.get('/halaqa/participants', requirePermission('halaqa.read'), async (req, res) => {
  res.json(await halaqa.listParticipants(req, query(req, ListParticipants)))
})
doc('post', '/halaqa/participants', T, 'Register a participant or add an existing student', { body: NewParticipant, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/participants', requirePermission('halaqa.manage'), async (req, res) => {
  res.status(201).json(await halaqa.createParticipant(req, body(req, NewParticipant)))
})
doc('get', '/halaqa/participants/:id', T, 'A participant, their Halaqas and history', { auth: 'halaqa.read' })
halaqaRouter.get('/halaqa/participants/:id', requirePermission('halaqa.read'), async (req, res) => {
  res.json(await halaqa.getParticipant(req, Id.parse(req.params.id)))
})
doc('patch', '/halaqa/participants/:id', T, 'Change a participant', { body: EditParticipant, auth: 'halaqa.manage' })
halaqaRouter.patch('/halaqa/participants/:id', requirePermission('halaqa.manage'), async (req, res) => {
  res.json(await halaqa.updateParticipant(req, Id.parse(req.params.id), body(req, EditParticipant)))
})
doc('put', '/halaqa/participants/:id/photo', T, 'Set a photograph (raw image body, max 3 MB)', { auth: 'halaqa.manage' })
halaqaRouter.put('/halaqa/participants/:id/photo', requirePermission('halaqa.manage'), express.raw({ type: IMAGES, limit: '3mb' }), async (req, res) => {
  res.json(await halaqa.setPhoto(req, Id.parse(req.params.id), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.get('content-type') ?? ''))
})
doc('get', '/halaqa/participants/:id/photo', T, 'A participant’s photograph', { auth: 'halaqa.read' })
halaqaRouter.get('/halaqa/participants/:id/photo', requirePermission('halaqa.read'), async (req, res) => {
  const f = await halaqa.getPhoto(Id.parse(req.params.id))
  res.setHeader('Content-Type', f.contentType).setHeader('X-Content-Type-Options', 'nosniff').setHeader('Content-Disposition', 'inline').end(f.body)
})
doc('get', '/halaqa/participants/:id/qr', T, 'A participant’s attendance card', { auth: 'halaqa.manage' })
halaqaRouter.get('/halaqa/participants/:id/qr', requirePermission('halaqa.manage'), async (req, res) => {
  res.json(await halaqa.participantQr(req, Id.parse(req.params.id), false))
})
doc('post', '/halaqa/participants/:id/qr', T, 'Replace a card; the old one stops working', { auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/participants/:id/qr', requirePermission('halaqa.manage'), async (req, res) => {
  res.json(await halaqa.participantQr(req, Id.parse(req.params.id), true))
})

// ---------- Memberships ----------

const Leave = z.object({ leftOn: IsoDate.optional() }).strict()
const Transfer = z.object({ toHalaqaId: Id }).strict()
doc('post', '/halaqa/memberships/:id/leave', T, 'Mark a person as having left a Halaqa', { body: Leave, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/memberships/:id/leave', requirePermission('halaqa.manage'), async (req, res) => {
  await halaqa.removeMember(req, Id.parse(req.params.id), body(req, Leave).leftOn)
  res.status(204).end()
})
doc('post', '/halaqa/memberships/:id/transfer', T, 'Move a person to another Halaqa', { body: Transfer, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/memberships/:id/transfer', requirePermission('halaqa.manage'), async (req, res) => {
  await halaqa.transferMember(req, Id.parse(req.params.id), body(req, Transfer).toHalaqaId)
  res.status(204).end()
})

// ---------- Sessions ----------

const SessionFields = { startTime: Clock.nullable().optional(), endTime: Clock.nullable().optional(), location: Opt(200), topic: Opt(200), description: Opt(2000), discussionNotes: Opt(5000), followUp: Opt(2000) }
const ListSessions = z.object({ halaqaId: Id.optional(), from: IsoDate.optional(), to: IsoDate.optional(), status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional() })
const EditSession = z.object({ date: IsoDate.optional(), ...SessionFields }).strict()
const StatusBody = z.object({ status: z.enum(['COMPLETED', 'CANCELLED']), reason: Text(300).optional() }).strict()
const Marks = z.object({ marks: z.array(z.object({ participantId: Id, status: z.enum(['PRESENT', 'ABSENT', 'EXCUSED']) }).strict()).min(1).max(500) }).strict()
const Scan = z.object({ token: z.string().min(10).max(300) }).strict()
const Correct = z.object({ status: z.enum(['PRESENT', 'ABSENT', 'EXCUSED']), reason: Text(300).min(5) }).strict()
const ReportQuery = z.object({ halaqaId: Id.optional(), participantId: Id.optional(), from: IsoDate, to: IsoDate }).refine((x) => x.from <= x.to, { path: ['to'], message: 'The end date must not be before the start date.' })

doc('get', '/halaqa/sessions', T, 'Sessions (teachers see their own Halaqas)', { query: ListSessions, auth: 'halaqa.read or halaqa.attendance' })
halaqaRouter.get('/halaqa/sessions', requireAuth, async (req, res) => {
  res.json(await halaqa.listSessions(req, query(req, ListSessions)))
})
doc('get', '/halaqa/sessions/:id', T, 'One session with its attendance and materials', { auth: 'halaqa.read or the teacher' })
halaqaRouter.get('/halaqa/sessions/:id', requireAuth, async (req, res) => {
  res.json(await halaqa.getSession(req, Id.parse(req.params.id)))
})
doc('patch', '/halaqa/sessions/:id', T, 'Change or reschedule a session', { body: EditSession, auth: 'halaqa.manage' })
halaqaRouter.patch('/halaqa/sessions/:id', requirePermission('halaqa.manage'), async (req, res) => {
  res.json(await halaqa.updateSession(req, Id.parse(req.params.id), body(req, EditSession)))
})
doc('post', '/halaqa/sessions/:id/status', T, 'Mark a session completed or cancelled', { body: StatusBody, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/sessions/:id/status', requirePermission('halaqa.manage'), async (req, res) => {
  const b = body(req, StatusBody)
  res.json(await halaqa.setSessionStatus(req, Id.parse(req.params.id), b.status, b.reason))
})
doc('put', '/halaqa/sessions/:id/attendance', T, 'Mark attendance (first marks; later changes are corrections)', { body: Marks, auth: 'halaqa.attendance or halaqa.manage, own Halaqas' })
halaqaRouter.put('/halaqa/sessions/:id/attendance', requireAuth, async (req, res) => {
  res.json(await halaqa.markAttendance(req, Id.parse(req.params.id), body(req, Marks).marks))
})
doc('post', '/halaqa/sessions/:id/scan', T, 'Record attendance from a scanned card', { body: Scan, auth: 'halaqa.attendance or halaqa.manage, own Halaqas' })
halaqaRouter.post('/halaqa/sessions/:id/scan', requireAuth, async (req, res) => {
  res.json(await halaqa.scanAttendance(req, Id.parse(req.params.id), body(req, Scan).token))
})
doc('post', '/halaqa/attendance/:id/correct', T, 'Correct a mark, with a reason', { body: Correct, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/attendance/:id/correct', requirePermission('halaqa.manage'), async (req, res) => {
  res.json(await halaqa.correctAttendance(req, Id.parse(req.params.id), body(req, Correct)))
})
doc('post', '/halaqa/sessions/:id/materials', T, 'Upload study material (raw PDF or image body, max 10 MB)', { auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/sessions/:id/materials', requirePermission('halaqa.manage'), express.raw({ type: Object.keys(halaqa.MATERIAL_TYPES), limit: '10mb' }), async (req, res) => {
  res.status(201).json(await halaqa.addMaterial(req, Id.parse(req.params.id), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.get('content-type') ?? '', decodeURIComponent(req.get('x-file-name') ?? 'material')))
})
doc('get', '/halaqa/materials/:id', T, 'Download study material', { auth: 'halaqa.read or the teacher' })
halaqaRouter.get('/halaqa/materials/:id', requireAuth, async (req, res) => {
  const f = await halaqa.getMaterial(req, Id.parse(req.params.id))
  res.setHeader('Content-Type', f.contentType).setHeader('X-Content-Type-Options', 'nosniff').setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`).end(f.body)
})
doc('get', '/halaqa/reports/attendance', T, 'Attendance by person, Halaqa and month', { query: ReportQuery, auth: 'halaqa.read' })
halaqaRouter.get('/halaqa/reports/attendance', requirePermission('halaqa.read'), async (req, res) => {
  res.json(await halaqa.attendanceReport(query(req, ReportQuery)))
})

// ---------- Messages ----------

const Message = z.object({ halaqaId: Id.optional(), participantIds: z.array(Id).max(500).optional(), kind: z.enum(['ANNOUNCEMENT', 'UPDATE', 'SCHEDULE', 'RESOURCE', 'REMINDER', 'CANCELLATION', 'FOLLOW_UP']), subject: Text(150).min(3), body: Text(4000).min(3) }).strict().refine((x) => x.halaqaId || x.participantIds?.length, { path: ['halaqaId'], message: 'Choose a Halaqa or people to send to.' })
const MessagesQuery = z.object({ halaqaId: Id.optional() })
doc('get', '/halaqa/messages', T, 'Messages sent', { query: MessagesQuery, auth: 'halaqa.read' })
halaqaRouter.get('/halaqa/messages', requirePermission('halaqa.read'), async (req, res) => {
  res.json(await mureeds.listMessages(query(req, MessagesQuery)))
})
doc('post', '/halaqa/messages', T, 'Send a message to a Halaqa or chosen people', { body: Message, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/messages', requirePermission('halaqa.manage'), async (req, res) => {
  res.status(201).json(await mureeds.sendMessage(req, body(req, Message)))
})

// ---------- One Halaqa ----------

const HalaqaFields = {
  description: Opt(2000), purpose: Opt(500), location: Opt(200), teacherStaffId: Id.nullable().optional(), frequency: z.enum(['ONE_OFF', 'WEEKLY', 'MONTHLY', 'CUSTOM']).optional(), meetingDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  startTime: Clock.nullable().optional(), endTime: Clock.nullable().optional(), startDate: IsoDate.nullable().optional(), endDate: IsoDate.nullable().optional(), maxParticipants: z.number().int().min(1).max(10000).nullable().optional(), status: z.enum(['PLANNED', 'ACTIVE', 'PAUSED', 'ENDED']).optional(), instructions: Opt(2000),
  attendanceRules: halaqa.AttendanceRules.optional(), isPublic: z.boolean().optional(), publicName: Opt(120), publicDescription: Opt(2000), publicEligibility: Opt(500), registrationOpen: z.boolean().optional(),
}
const NewHalaqa = z.object({ name: Text(120).min(2), categoryId: Id, ...HalaqaFields }).strict().refine(orderOk, orderMsg)
const EditHalaqa = z.object({ name: Text(120).min(2).optional(), categoryId: Id.optional(), ...HalaqaFields }).strict().refine(orderOk, orderMsg)
const NewSession = z.object({ date: IsoDate, ...SessionFields }).strict()
const Recurring = z.object({ pattern: z.enum(['WEEKLY', 'MONTHLY']), from: IsoDate, to: IsoDate, weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(), dayOfMonth: z.number().int().min(1).max(31).optional(), startTime: Clock.optional(), endTime: Clock.optional(), topic: Text(200).optional() }).strict()
  .refine((x) => x.from <= x.to, { path: ['to'], message: 'The end date must not be before the start date.' })
  .refine((x) => (x.pattern === 'WEEKLY' ? !!x.weekdays?.length : !!x.dayOfMonth), { path: ['pattern'], message: 'Choose the days the sessions fall on.' })
const AddMember = z.object({ participantId: Id, joinedOn: IsoDate.optional() }).strict()

doc('get', '/halaqa', T, 'Halaqas (teachers see their own)', { auth: 'halaqa.read or halaqa.attendance' })
halaqaRouter.get('/halaqa', requireAuth, async (req, res) => {
  res.json(await halaqa.listHalaqas(req))
})
doc('post', '/halaqa', T, 'Create a Halaqa', { body: NewHalaqa, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa', requirePermission('halaqa.manage'), async (req, res) => {
  res.status(201).json(await halaqa.createHalaqa(req, body(req, NewHalaqa)))
})
doc('get', '/halaqa/:id', T, 'One Halaqa', { auth: 'halaqa.read or the teacher' })
halaqaRouter.get('/halaqa/:id', requireAuth, async (req, res) => {
  res.json(await halaqa.getHalaqa(req, Id.parse(req.params.id)))
})
doc('patch', '/halaqa/:id', T, 'Change a Halaqa', { body: EditHalaqa, auth: 'halaqa.manage' })
halaqaRouter.patch('/halaqa/:id', requirePermission('halaqa.manage'), async (req, res) => {
  res.json(await halaqa.updateHalaqa(req, Id.parse(req.params.id), body(req, EditHalaqa)))
})
doc('get', '/halaqa/:id/members', T, 'Current members (teachers get names only)', { auth: 'halaqa.read or the teacher' })
halaqaRouter.get('/halaqa/:id/members', requireAuth, async (req, res) => {
  res.json(await halaqa.roster(req, Id.parse(req.params.id)))
})
doc('post', '/halaqa/:id/members', T, 'Add a participant', { body: AddMember, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/:id/members', requirePermission('halaqa.manage'), async (req, res) => {
  res.status(201).json(await halaqa.addMember(req, Id.parse(req.params.id), body(req, AddMember)))
})
doc('post', '/halaqa/:id/sessions', T, 'Create one session', { body: NewSession, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/:id/sessions', requirePermission('halaqa.manage'), async (req, res) => {
  res.status(201).json(await halaqa.createSession(req, Id.parse(req.params.id), body(req, NewSession)))
})
doc('post', '/halaqa/:id/sessions/recurring', T, 'Schedule weekly or monthly sessions', { body: Recurring, auth: 'halaqa.manage' })
halaqaRouter.post('/halaqa/:id/sessions/recurring', requirePermission('halaqa.manage'), async (req, res) => {
  res.status(201).json(await halaqa.createRecurring(req, Id.parse(req.params.id), body(req, Recurring)))
})

// ---------- Mureeds ----------

const Entry = z.object({ kind: z.enum(['MEETING', 'FOLLOW_UP', 'COMMUNICATION']), date: IsoDate.optional(), summary: Text(2000).min(3), dueDate: IsoDate.optional() }).strict()
const Note = z.object({ body: Text(5000).min(1) }).strict()
doc('get', '/mureeds/:id', M, 'A Mureed’s profile and records (each view is audited)', { auth: 'mureeds.read' })
halaqaRouter.get('/mureeds/:id', requirePermission('mureeds.read'), async (req, res) => {
  res.json(await mureeds.profile(req, Id.parse(req.params.id)))
})
doc('post', '/mureeds/:id/entries', M, 'Record a meeting, follow-up or communication', { body: Entry, auth: 'mureeds.manage' })
halaqaRouter.post('/mureeds/:id/entries', requirePermission('mureeds.manage'), async (req, res) => {
  res.status(201).json(await mureeds.addEntry(req, Id.parse(req.params.id), body(req, Entry)))
})
doc('post', '/mureeds/entries/:id/done', M, 'Complete a follow-up', { auth: 'mureeds.manage' })
halaqaRouter.post('/mureeds/entries/:id/done', requirePermission('mureeds.manage'), async (req, res) => {
  await mureeds.completeFollowUp(req, Id.parse(req.params.id))
  res.status(204).end()
})
doc('get', '/mureeds/:id/notes', M, 'Private notes (each read is audited)', { auth: 'mureeds.private_notes' })
halaqaRouter.get('/mureeds/:id/notes', requirePermission('mureeds.private_notes'), async (req, res) => {
  res.json(await mureeds.listNotes(req, Id.parse(req.params.id)))
})
doc('post', '/mureeds/:id/notes', M, 'Add a private note', { body: Note, auth: 'mureeds.private_notes' })
halaqaRouter.post('/mureeds/:id/notes', requirePermission('mureeds.private_notes'), async (req, res) => {
  res.status(201).json(await mureeds.addNote(req, Id.parse(req.params.id), body(req, Note).body))
})
doc('patch', '/mureeds/notes/:id', M, 'Change a private note', { body: Note, auth: 'mureeds.private_notes' })
halaqaRouter.patch('/mureeds/notes/:id', requirePermission('mureeds.private_notes'), async (req, res) => {
  await mureeds.updateNote(req, Id.parse(req.params.id), body(req, Note).body)
  res.status(204).end()
})
doc('delete', '/mureeds/notes/:id', M, 'Delete a private note', { auth: 'mureeds.private_notes' })
halaqaRouter.delete('/mureeds/notes/:id', requirePermission('mureeds.private_notes'), async (req, res) => {
  await mureeds.deleteNote(req, Id.parse(req.params.id))
  res.status(204).end()
})
