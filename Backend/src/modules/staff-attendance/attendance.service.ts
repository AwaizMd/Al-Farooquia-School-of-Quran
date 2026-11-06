import type { Request } from 'express'
import QRCode from 'qrcode'
import type { Prisma } from '../../generated/prisma/client.js'
import { AppError, conflict, notFound } from '../../common/errors.js'
import { addDaysIso, dateIn, institutionToday, institutionTimezone } from '../../common/clock.js'
import { prisma } from '../../database/prisma.js'
import { activeMadrasaId } from '../../tenancy/context.js'
import { lockRow } from '../../tenancy/locks.js'
import { madrasaProfile } from '../../tenancy/settings.js'
import { audit } from '../audit-logs/audit.service.js'
import { hashPassword } from '../auth/password.js'
import { effectiveSettings } from '../kiosk/kiosk.settings.js'
import { issueQr } from '../kiosk/qr-token.js'
import { isoDate, toDate } from '../students/students.service.js'
import { closeStaleSessions, earlyMinutesFor, lateMinutesFor, localMinutes, nearestShift, workedMinutesBetween } from './attendance.engine.js'

const SESSION_INCLUDE = { staff: { select: { id: true, code: true, displayName: true, title: true } }, shift: { select: { id: true, name: true } }, checkInKiosk: { select: { name: true } }, checkOutKiosk: { select: { name: true } }, _count: { select: { corrections: true } } } satisfies Prisma.StaffAttendanceSessionInclude
type Row = Prisma.StaffAttendanceSessionGetPayload<{ include: typeof SESSION_INCLUDE }>
const view = (s: Row) => ({
  id: s.id, date: isoDate(s.date), staff: s.staff, shift: s.shift, checkInAt: s.checkInAt, checkOutAt: s.checkOutAt, status: s.status, source: s.source, lateMinutes: s.lateMinutes, earlyMinutes: s.earlyMinutes,
  workedMinutes: s.workedMinutes, checkInKiosk: s.checkInKiosk?.name ?? null, checkOutKiosk: s.checkOutKiosk?.name ?? null, corrected: s._count.corrections > 0,
})

// ---------- The staff member's own page ----------

async function ownStaff(req: Request) {
  const s = await prisma.staffProfile.findFirst({ where: { userId: req.auth!.user.id } })
  if (!s) throw new AppError(404, 'NO_STAFF_RECORD', 'Your account has no staff record in this madrasa.')
  return s
}

/** A fresh code for the signed-in staff member. Holds only a signed reference, no personal details. */
export async function myQr(req: Request) {
  const staff = await ownStaff(req)
  if (staff.status !== 'ACTIVE') throw new AppError(403, 'STAFF_INACTIVE', 'Your staff record is not active.')
  const settings = await effectiveSettings(staff.madrasaId)
  const kind = settings.qr.dynamic ? 'dynamic' : 'static'
  const { token, expiresAt } = issueQr(req.auth!.user.id, kind, settings.qr.ttlSeconds)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.user.id }, select: { attendancePinHash: true } })
  return {
    kind, expiresAt, refreshSeconds: settings.qr.refreshSeconds, qrDataUrl: await QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2, width: 320 }),
    pin: { required: settings.pinRequired || settings.highSecurity, set: !!user.attendancePinHash },
    staff: { displayName: staff.displayName, code: staff.code },
  }
}

export async function myAttendance(req: Request, q: { month?: string | undefined }) {
  const staff = await ownStaff(req)
  const month = q.month ?? (await institutionToday()).slice(0, 7)
  const rows = await prisma.staffAttendanceSession.findMany({ where: { staffId: staff.id, date: monthRange(month) }, include: SESSION_INCLUDE, orderBy: { checkInAt: 'desc' } })
  return { month, items: rows.map(view) }
}

const WEAK_PINS = /^(\d)\1+$|^(0123|1234|2345|3456|4567|5678|6789|012345|123456|654321|4321)$/
export async function setMyPin(req: Request, pin: string | null) {
  if (pin && WEAK_PINS.test(pin)) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'pin', message: 'Choose a PIN that is harder to guess.' }])
  await prisma.user.update({ where: { id: req.auth!.user.id }, data: { attendancePinHash: pin ? await hashPassword(pin) : null } })
  await audit({ action: pin ? 'staff_attendance.pin_set' : 'staff_attendance.pin_removed', summary: pin ? 'Attendance PIN set' : 'Attendance PIN removed', entityType: 'user', entityId: req.auth!.user.id }, req)
  return { set: !!pin }
}

// ---------- Viewing ----------

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return { gte: new Date(Date.UTC(y!, m! - 1, 1)), lte: new Date(Date.UTC(y!, m!, 0)) }
}

export async function listSessions(q: { from?: string | undefined; to?: string | undefined; staffId?: string | undefined; status?: 'OPEN' | 'CLOSED' | 'MISSED_CHECKOUT' | undefined; page: number; pageSize: number }) {
  const today = await institutionToday()
  const from = q.from ?? today
  const to = q.to ?? today
  const where: Prisma.StaffAttendanceSessionWhereInput = { date: { gte: toDate(from), lte: toDate(to) }, ...(q.staffId ? { staffId: q.staffId } : {}), ...(q.status ? { status: q.status } : {}) }
  const [total, rows] = await Promise.all([prisma.staffAttendanceSession.count({ where }), prisma.staffAttendanceSession.findMany({ where, include: SESSION_INCLUDE, orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize })])
  return { from, to, total, page: q.page, pageSize: q.pageSize, items: rows.map(view) }
}

/**
 * The figures payroll needs, per person, for one month. Attendance only: this code
 * knows nothing about salaries or deductions. "Expected days" counts days up to today
 * except the weekly off. Holidays and approved leave are not known to the system yet,
 * so absentDays is an upper limit until those modules exist.
 */
export async function monthlySummary(month: string) {
  const madrasa = await madrasaProfile()
  const today = await institutionToday()
  const { gte, lte } = monthRange(month)
  const [staff, sessions] = await Promise.all([
    prisma.staffProfile.findMany({ where: { status: 'ACTIVE' }, orderBy: { displayName: 'asc' }, select: { id: true, code: true, displayName: true, title: true, joinedOn: true, attendanceExempt: true } }),
    prisma.staffAttendanceSession.findMany({ where: { date: { gte, lte } } }),
  ])
  const first = isoDate(gte)!
  const last = isoDate(lte)!
  const items = staff.map((s) => {
    const mine = sessions.filter((x) => x.staffId === s.id)
    const dates = new Set(mine.map((x) => isoDate(x.date)!))
    let expectedDays = 0
    const start = s.joinedOn && isoDate(s.joinedOn)! > first ? isoDate(s.joinedOn)! : first
    for (let d = start; d <= last && d <= today; d = addDaysIso(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() !== madrasa.weeklyOff) expectedDays++
    const presentOnWorkingDays = [...dates].filter((d) => d >= start && d <= today && new Date(`${d}T00:00:00Z`).getUTCDay() !== madrasa.weeklyOff).length
    return {
      staff: { id: s.id, code: s.code, displayName: s.displayName, title: s.title }, exempt: s.attendanceExempt, expectedDays, presentDays: dates.size, absentDays: expectedDays - presentOnWorkingDays,
      lateCount: mine.filter((x) => x.lateMinutes > 0).length, lateMinutes: mine.reduce((a, x) => a + x.lateMinutes, 0), earlyCount: mine.filter((x) => x.earlyMinutes > 0).length, earlyMinutes: mine.reduce((a, x) => a + x.earlyMinutes, 0),
      workedMinutes: mine.reduce((a, x) => a + (x.workedMinutes ?? 0), 0), missedCheckouts: mine.filter((x) => x.status === 'MISSED_CHECKOUT').length, openSessions: mine.filter((x) => x.status === 'OPEN').length,
    }
  })
  return { month, weeklyOff: madrasa.weeklyOff, items }
}

// ---------- Corrections ----------

function measure(checkInAt: Date, checkOutAt: Date | null, shift: Parameters<typeof lateMinutesFor>[0], exempt: boolean, tz: string) {
  return {
    lateMinutes: lateMinutesFor(shift, exempt, localMinutes(tz, checkInAt)),
    earlyMinutes: checkOutAt ? earlyMinutesFor(shift, exempt, localMinutes(tz, checkOutAt)) : 0,
    workedMinutes: checkOutAt ? workedMinutesBetween(checkInAt, checkOutAt) : null,
  }
}

function assertTimes(checkInAt: Date, checkOutAt: Date | null | undefined) {
  const now = Date.now()
  if (checkInAt.getTime() > now) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'checkInAt', message: 'The check-in cannot be in the future.' }])
  if (checkOutAt && checkOutAt.getTime() > now) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'checkOutAt', message: 'The check-out cannot be in the future.' }])
  if (checkOutAt && checkOutAt < checkInAt) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'checkOutAt', message: 'The check-out must be after the check-in.' }])
}

/** Two records of one person cannot cover the same time: worked hours would count twice. A missed check-out has no end, so it covers no time. */
async function assertNoOverlap(tx: Parameters<typeof lockRow>[0], staffId: string, checkInAt: Date, checkOutAt: Date | null, exceptId?: string) {
  await lockRow(tx, 'staff_profiles', staffId)
  const end = checkOutAt ?? new Date()
  const clash = await tx.staffAttendanceSession.findFirst({
    where: { staffId, ...(exceptId ? { id: { not: exceptId } } : {}), checkInAt: { lt: end }, OR: [{ checkOutAt: { gt: checkInAt } }, { status: 'OPEN' }] },
    select: { status: true },
  })
  if (clash?.status === 'OPEN' && !checkOutAt) throw conflict('ALREADY_CHECKED_IN', 'This person is already checked in. Correct that record instead.')
  if (clash) throw conflict('SESSION_OVERLAP', 'These times overlap another attendance record of this person.')
}

/** Change a session's times. The old values and the reason are kept; late, early and worked time are worked out again. */
export async function correctSession(req: Request, id: string, input: { checkInAt?: Date | undefined; checkOutAt?: Date | null | undefined; reason: string }) {
  const tz = await institutionTimezone()
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.staffAttendanceSession.findUnique({ where: { id }, include: { shift: true, staff: { select: { attendanceExempt: true, displayName: true } } } })
    if (!s) throw notFound()
    const checkInAt = input.checkInAt ?? s.checkInAt
    const checkOutAt = input.checkOutAt === undefined ? s.checkOutAt : input.checkOutAt
    assertTimes(checkInAt, checkOutAt)
    await assertNoOverlap(tx, s.staffId, checkInAt, checkOutAt, id)
    const status = checkOutAt ? 'CLOSED' : s.status === 'CLOSED' ? 'MISSED_CHECKOUT' : s.status
    await tx.staffAttendanceCorrection.create({ data: { sessionId: id, reason: input.reason, correctedById: req.auth!.user.id, previous: { checkInAt: s.checkInAt, checkOutAt: s.checkOutAt, status: s.status, lateMinutes: s.lateMinutes, earlyMinutes: s.earlyMinutes, workedMinutes: s.workedMinutes } } })
    const u = await tx.staffAttendanceSession.update({ where: { id }, data: { checkInAt, checkOutAt, status, date: toDate(dateIn(tz, checkInAt)), ...measure(checkInAt, checkOutAt, s.shift, s.staff.attendanceExempt, tz) }, include: SESSION_INCLUDE })
    await audit({ action: 'staff_attendance.corrected', summary: `Attendance of ${s.staff.displayName} corrected: ${input.reason}`, entityType: 'staff_attendance', entityId: id }, req, tx)
    return u
  })
  return view(updated)
}

/** Record attendance by hand (for example, the kiosk was down). */
export async function addManualSession(req: Request, input: { staffId: string; checkInAt: Date; checkOutAt?: Date | undefined; reason: string }) {
  const tz = await institutionTimezone()
  assertTimes(input.checkInAt, input.checkOutAt)
  const staff = await prisma.staffProfile.findUnique({ where: { id: input.staffId }, include: { shiftAssignments: { where: { shift: { active: true } }, include: { shift: true } } } })
  if (!staff) throw notFound()
  const shift = nearestShift(staff.shiftAssignments.map((a) => a.shift), localMinutes(tz, input.checkInAt))
  const created = await prisma.$transaction(async (tx) => {
    await assertNoOverlap(tx, staff.id, input.checkInAt, input.checkOutAt ?? null)
    const s = await tx.staffAttendanceSession.create({ data: { staffId: staff.id, date: toDate(dateIn(tz, input.checkInAt)), shiftId: shift?.id ?? null, checkInAt: input.checkInAt, checkOutAt: input.checkOutAt ?? null, status: input.checkOutAt ? 'CLOSED' : 'OPEN', source: 'MANUAL', ...measure(input.checkInAt, input.checkOutAt ?? null, shift, staff.attendanceExempt, tz) } }).catch((err: { code?: string }) => {
      if (err.code === 'P2002') throw conflict('ALREADY_CHECKED_IN', 'This person is already checked in. Correct that record instead.')
      throw err
    })
    await tx.staffAttendanceCorrection.create({ data: { sessionId: s.id, reason: input.reason, correctedById: req.auth!.user.id } })
    await audit({ action: 'staff_attendance.added_manually', summary: `Attendance of ${staff.displayName} added by hand: ${input.reason}`, entityType: 'staff_attendance', entityId: s.id }, req, tx)
    return tx.staffAttendanceSession.findUniqueOrThrow({ where: { id: s.id }, include: SESSION_INCLUDE })
  })
  return view(created)
}

export async function correctionsOf(id: string) {
  const s = await prisma.staffAttendanceSession.findUnique({ where: { id }, include: { corrections: { orderBy: { at: 'asc' } } } })
  if (!s) throw notFound()
  return { items: s.corrections.map((c) => ({ at: c.at, reason: c.reason, previous: c.previous })) }
}

// ---------- Shifts and each person's arrangement ----------

export async function listShifts() {
  const [shifts, staff] = await Promise.all([
    prisma.staffShift.findMany({ orderBy: { startTime: 'asc' }, include: { _count: { select: { assignments: true } } } }),
    prisma.staffProfile.findMany({ where: { status: 'ACTIVE' }, orderBy: { displayName: 'asc' }, select: { id: true, code: true, displayName: true, title: true, userId: true, attendanceExempt: true, qrRevokedAt: true, shiftAssignments: { select: { shiftId: true } } } }),
  ])
  return {
    shifts: shifts.map(({ _count, ...s }) => ({ ...s, staffCount: _count.assignments })),
    staff: staff.map(({ shiftAssignments, userId, ...s }) => ({ ...s, hasAccount: !!userId, shiftIds: shiftAssignments.map((a) => a.shiftId) })),
  }
}

export interface ShiftInput { name: string; startTime: string; endTime: string; graceLateMinutes?: number | undefined; graceEarlyMinutes?: number | undefined; active?: boolean | undefined }

/** A shift with the same start and end has no clear length, so late and early can't be worked out. */
function assertShiftTimes(startTime: string, endTime: string) {
  if (startTime === endTime) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'endTime', message: 'The end must differ from the start.' }])
}

export async function createShift(req: Request, input: ShiftInput) {
  assertShiftTimes(input.startTime, input.endTime)
  try {
    const s = await prisma.staffShift.create({ data: input })
    await audit({ action: 'staff_shift.created', summary: `Shift "${s.name}" ${s.startTime}–${s.endTime} created`, entityType: 'staff_shift', entityId: s.id }, req)
    return s
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('SHIFT_EXISTS', 'Another shift already has this name.')
    throw err
  }
}

export async function updateShift(req: Request, id: string, patch: Partial<ShiftInput>) {
  const current = await prisma.staffShift.findUnique({ where: { id } })
  if (!current) throw notFound()
  assertShiftTimes(patch.startTime ?? current.startTime, patch.endTime ?? current.endTime)
  const data = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  const s = await prisma.staffShift.update({ where: { id }, data })
  await audit({ action: 'staff_shift.updated', summary: `Shift "${s.name}" changed: ${Object.keys(data).join(', ')}. Saved attendance keeps its figures.`, entityType: 'staff_shift', entityId: id }, req)
  return s
}

export async function setArrangement(req: Request, staffId: string, input: { shiftIds?: string[] | undefined; exempt?: boolean | undefined }) {
  const staff = await prisma.staffProfile.findUnique({ where: { id: staffId } })
  if (!staff) throw notFound()
  await prisma.$transaction(async (tx) => {
    if (input.shiftIds) {
      if ((await tx.staffShift.count({ where: { id: { in: input.shiftIds } } })) !== new Set(input.shiftIds).size) throw notFound()
      await tx.staffShiftAssignment.deleteMany({ where: { staffId } })
      await tx.staffShiftAssignment.createMany({ data: [...new Set(input.shiftIds)].map((shiftId) => ({ staffId, shiftId })) })
    }
    if (input.exempt !== undefined) await tx.staffProfile.update({ where: { id: staffId }, data: { attendanceExempt: input.exempt } })
    await audit({ action: 'staff_attendance.arrangement_changed', summary: `Attendance arrangement of ${staff.displayName} changed${input.exempt !== undefined ? `; exempt from late and early counts: ${input.exempt ? 'yes' : 'no'}` : ''}`, entityType: 'staff', entityId: staffId }, req, tx)
  })
  return listShifts()
}

/** Cancel every QR code this person has been issued so far. */
export async function revokeQr(req: Request, staffId: string) {
  const staff = await prisma.staffProfile.findUnique({ where: { id: staffId } })
  if (!staff) throw notFound()
  await prisma.staffProfile.update({ where: { id: staffId }, data: { qrRevokedAt: new Date() } })
  await audit({ action: 'staff_attendance.qr_revoked', summary: `QR codes of ${staff.displayName} cancelled`, entityType: 'staff', entityId: staffId }, req)
  return { revoked: true }
}

/** Background job, once per madrasa: mark check-ins left open too long as missed check-outs. */
export async function closeStaleForMadrasa() {
  const settings = await effectiveSettings(activeMadrasaId())
  return { missedCheckouts: await prisma.$transaction((tx) => closeStaleSessions(tx, settings.maxSessionHours, new Date())) }
}
