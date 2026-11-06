import { Router } from 'express'
import { z } from 'zod'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission, requireRecentAuth } from '../../middleware/auth.js'
import { IsoDate, body, query } from '../../middleware/validate.js'
import * as attendance from './attendance.service.js'

export const staffAttendanceRouter = Router()
const T = 'Staff attendance'
const Id = z.string().uuid()
const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-11.')
const Reason = z.string().trim().min(5).max(300)
const Page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(100) }

// ---------- My own ----------

doc('get', '/staff-attendance/me/qr', T, 'A fresh attendance QR code for the signed-in staff member')
staffAttendanceRouter.get('/staff-attendance/me/qr', requireAuth, async (req, res) => {
  res.json(await attendance.myQr(req))
})

const MonthQuery = z.object({ month: Month.optional() })
doc('get', '/staff-attendance/me', T, 'My attendance for a month', { query: MonthQuery })
staffAttendanceRouter.get('/staff-attendance/me', requireAuth, async (req, res) => {
  res.json(await attendance.myAttendance(req, query(req, MonthQuery)))
})

const Pin = z.object({ pin: z.string().regex(/^\d{4,6}$/, 'Use 4 to 6 digits.').nullable() })
doc('put', '/staff-attendance/me/pin', T, 'Set or remove my attendance PIN', { body: Pin, auth: 'recent re-authentication' })
staffAttendanceRouter.put('/staff-attendance/me/pin', requireAuth, requireRecentAuth(), async (req, res) => {
  res.json(await attendance.setMyPin(req, body(req, Pin).pin))
})

// ---------- Everyone's ----------

const List = z.object({ from: IsoDate.optional(), to: IsoDate.optional(), staffId: Id.optional(), status: z.enum(['OPEN', 'CLOSED', 'MISSED_CHECKOUT']).optional(), ...Page }).refine((x) => !x.from || !x.to || x.from <= x.to, { path: ['to'], message: 'The end date must not be before the start date.' })
doc('get', '/staff-attendance', T, 'Staff attendance sessions', { query: List, auth: 'staff_attendance.read' })
staffAttendanceRouter.get('/staff-attendance', requirePermission('staff_attendance.read'), async (req, res) => {
  res.json(await attendance.listSessions(query(req, List)))
})

const SummaryQuery = z.object({ month: Month })
doc('get', '/staff-attendance/summary', T, 'Monthly attendance figures per person: the input for payroll', { query: SummaryQuery, auth: 'staff_attendance.read' })
staffAttendanceRouter.get('/staff-attendance/summary', requirePermission('staff_attendance.read'), async (req, res) => {
  res.json(await attendance.monthlySummary(query(req, SummaryQuery).month))
})

const Correct = z.object({ checkInAt: z.coerce.date().optional(), checkOutAt: z.coerce.date().nullable().optional(), reason: Reason })
doc('post', '/staff-attendance/sessions/:id/correct', T, 'Correct a session’s times, with a reason', { body: Correct, auth: 'staff_attendance.manage' })
staffAttendanceRouter.post('/staff-attendance/sessions/:id/correct', requirePermission('staff_attendance.manage'), async (req, res) => {
  res.json(await attendance.correctSession(req, Id.parse(req.params.id), body(req, Correct)))
})

doc('get', '/staff-attendance/sessions/:id/corrections', T, 'A session’s correction history', { auth: 'staff_attendance.read' })
staffAttendanceRouter.get('/staff-attendance/sessions/:id/corrections', requirePermission('staff_attendance.read'), async (req, res) => {
  res.json(await attendance.correctionsOf(Id.parse(req.params.id)))
})

const AddManual = z.object({ staffId: Id, checkInAt: z.coerce.date(), checkOutAt: z.coerce.date().optional(), reason: Reason })
doc('post', '/staff-attendance/sessions', T, 'Add attendance by hand, with a reason', { body: AddManual, auth: 'staff_attendance.manage' })
staffAttendanceRouter.post('/staff-attendance/sessions', requirePermission('staff_attendance.manage'), async (req, res) => {
  res.status(201).json(await attendance.addManualSession(req, body(req, AddManual)))
})

// ---------- Shifts ----------

const Shift = z.object({ name: z.string().trim().min(2).max(60), startTime: Clock, endTime: Clock, graceLateMinutes: z.number().int().min(0).max(240).optional(), graceEarlyMinutes: z.number().int().min(0).max(240).optional(), active: z.boolean().optional() })
doc('get', '/staff-shifts', T, 'Shifts, and each person’s arrangement', { auth: 'staff_attendance.read' })
staffAttendanceRouter.get('/staff-shifts', requirePermission('staff_attendance.read'), async (_req, res) => {
  res.json(await attendance.listShifts())
})
doc('post', '/staff-shifts', T, 'Add a shift', { body: Shift, auth: 'staff_attendance.manage' })
staffAttendanceRouter.post('/staff-shifts', requirePermission('staff_attendance.manage'), async (req, res) => {
  res.status(201).json(await attendance.createShift(req, body(req, Shift)))
})
doc('patch', '/staff-shifts/:id', T, 'Change a shift (saved attendance keeps its figures)', { body: Shift.partial(), auth: 'staff_attendance.manage' })
staffAttendanceRouter.patch('/staff-shifts/:id', requirePermission('staff_attendance.manage'), async (req, res) => {
  res.json(await attendance.updateShift(req, Id.parse(req.params.id), body(req, Shift.partial())))
})

const Arrangement = z.object({ shiftIds: z.array(Id).max(6).optional(), exempt: z.boolean().optional() })
doc('put', '/staff-attendance/staff/:id/arrangement', T, 'A person’s shifts and exemption', { body: Arrangement, auth: 'staff_attendance.manage' })
staffAttendanceRouter.put('/staff-attendance/staff/:id/arrangement', requirePermission('staff_attendance.manage'), async (req, res) => {
  res.json(await attendance.setArrangement(req, Id.parse(req.params.id), body(req, Arrangement)))
})

doc('post', '/staff-attendance/staff/:id/revoke-qr', T, 'Cancel every QR code this person has been issued', { auth: 'staff_attendance.manage' })
staffAttendanceRouter.post('/staff-attendance/staff/:id/revoke-qr', requirePermission('staff_attendance.manage'), async (req, res) => {
  res.json(await attendance.revokeQr(req, Id.parse(req.params.id)))
})
