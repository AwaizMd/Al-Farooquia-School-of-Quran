import { AppError } from '../../common/errors.js'
import { dateIn } from '../../common/clock.js'
import type { Tx } from '../../database/prisma.js'
import { toDate } from '../students/students.service.js'

// The attendance rules, in one place. Kiosks and manual corrections both come here:
// a kiosk only supplies a verified event. Nothing here knows about pay; payroll reads
// the resulting sessions (see monthlySummary).

export type ScanAction = 'CHECK_IN' | 'CHECK_OUT'

export interface AttendanceRules {
  mode: 'AUTO' | 'MANUAL' | 'TIME_WINDOW'
  checkInWindow: { from: string; to: string } | null
  checkOutWindow: { from: string; to: string } | null
  multipleSessions: boolean
  duplicateWindowSeconds: number
  maxSessionHours: number
}

export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Minutes since local midnight in the madrasa's timezone. */
export function localMinutes(tz: string, at: Date) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at).split(':')
  return Number(h) * 60 + Number(m)
}

/** How far `now` is after `reference` on a 24-hour clock, from -720 to +719 (handles shifts across midnight). */
const signedGap = (now: number, reference: number) => ((now - reference + 720 + 1440) % 1440) - 720

/** A window whose end is before its start runs past midnight. */
export const inWindow = (w: { from: string; to: string }, minute: number) => {
  const from = minutesOf(w.from)
  const to = minutesOf(w.to)
  return from <= to ? minute >= from && minute <= to : minute >= from || minute <= to
}

interface Shift { id: string; startTime: string; endTime: string; graceLateMinutes: number; graceEarlyMinutes: number }

/** Of a person's shifts, the one whose start is nearest the check-in. */
export function nearestShift<T extends Shift>(shifts: T[], minute: number): T | null {
  let best: T | null = null
  for (const s of shifts) if (!best || Math.abs(signedGap(minute, minutesOf(s.startTime))) < Math.abs(signedGap(minute, minutesOf(best.startTime)))) best = s
  return best
}

/** Past the grace period, the whole time since the shift began counts as late. */
export function lateMinutesFor(shift: Shift | null | undefined, exempt: boolean, minute: number) {
  if (!shift || exempt) return 0
  const gap = signedGap(minute, minutesOf(shift.startTime))
  return gap > shift.graceLateMinutes ? gap : 0
}

export function earlyMinutesFor(shift: Shift | null | undefined, exempt: boolean, minute: number) {
  if (!shift || exempt) return 0
  const gap = signedGap(minutesOf(shift.endTime), minute)
  return gap > shift.graceEarlyMinutes ? gap : 0
}

export const workedMinutesBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / 60_000)

/** Check-ins left open too long become missed check-outs: they need a correction to count as worked time. */
export async function closeStaleSessions(tx: Tx, maxSessionHours: number, now: Date, staffId?: string) {
  const before = new Date(now.getTime() - maxSessionHours * 3_600_000)
  const r = await tx.staffAttendanceSession.updateMany({ where: { status: 'OPEN', checkInAt: { lt: before }, ...(staffId ? { staffId } : {}) }, data: { status: 'MISSED_CHECKOUT' } })
  return r.count
}

const refuse = (status: number, code: string, message: string) => new AppError(status, code, message)

/** Which way this scan goes. */
function decide(rules: AttendanceRules, requested: ScanAction | undefined, hasOpen: boolean, minute: number): ScanAction {
  if (rules.mode === 'MANUAL') {
    if (!requested) throw refuse(422, 'ACTION_REQUIRED', 'Choose Check In or Check Out first.')
    return requested
  }
  if (rules.mode === 'TIME_WINDOW') {
    const canIn = !!rules.checkInWindow && inWindow(rules.checkInWindow, minute)
    const canOut = !!rules.checkOutWindow && inWindow(rules.checkOutWindow, minute)
    if (canIn && canOut) return hasOpen ? 'CHECK_OUT' : 'CHECK_IN'
    if (canIn) return 'CHECK_IN'
    if (canOut) return 'CHECK_OUT'
    throw refuse(409, 'OUTSIDE_ATTENDANCE_TIME', 'Attendance is not open at this time.')
  }
  return hasOpen ? 'CHECK_OUT' : 'CHECK_IN'
}

export interface AttendanceResult {
  action: ScanAction
  sessionId: string
  /** ON_TIME, LATE, EARLY_DEPARTURE or COMPLETED. */
  status: string
  lateMinutes: number
  earlyMinutes: number
  workedMinutes: number | null
}

/**
 * Apply one verified event. Runs in the caller's transaction with the staff row
 * locked, so two kiosks scanning the same person at once are handled one at a time.
 */
export async function recordEvent(
  tx: Tx,
  staff: { id: string; attendanceExempt: boolean },
  ctx: { at: Date; timezone: string; rules: AttendanceRules; requested?: ScanAction | undefined; kioskId: string },
): Promise<AttendanceResult> {
  const { at, timezone, rules } = ctx
  const minute = localMinutes(timezone, at)
  await closeStaleSessions(tx, rules.maxSessionHours, at, staff.id)

  const latest = await tx.staffAttendanceSession.findFirst({ where: { staffId: staff.id }, orderBy: { checkInAt: 'desc' } })
  const lastEvent = latest ? (latest.checkOutAt ?? latest.checkInAt) : null
  if (lastEvent && rules.duplicateWindowSeconds > 0 && at.getTime() - lastEvent.getTime() < rules.duplicateWindowSeconds * 1000) {
    throw refuse(409, 'ALREADY_RECORDED', 'Your attendance was just recorded. There is no need to scan again.')
  }
  const open = latest?.status === 'OPEN' ? latest : null
  const action = decide(rules, ctx.requested, !!open, minute)

  if (action === 'CHECK_IN' && rules.checkInWindow && !inWindow(rules.checkInWindow, minute)) throw refuse(409, 'OUTSIDE_ATTENDANCE_TIME', 'Check-in is not open at this time.')
  if (action === 'CHECK_OUT' && rules.checkOutWindow && !inWindow(rules.checkOutWindow, minute)) throw refuse(409, 'OUTSIDE_ATTENDANCE_TIME', 'Check-out is not open at this time.')

  if (action === 'CHECK_OUT') {
    if (!open) throw refuse(409, 'NOT_CHECKED_IN', 'You have not checked in yet.')
    const shift = open.shiftId ? await tx.staffShift.findUnique({ where: { id: open.shiftId } }) : null
    const earlyMinutes = earlyMinutesFor(shift, staff.attendanceExempt, minute)
    const workedMinutes = workedMinutesBetween(open.checkInAt, at)
    await tx.staffAttendanceSession.update({ where: { id: open.id }, data: { checkOutAt: at, status: 'CLOSED', earlyMinutes, workedMinutes, checkOutKioskId: ctx.kioskId } })
    return { action, sessionId: open.id, status: earlyMinutes ? 'EARLY_DEPARTURE' : 'COMPLETED', lateMinutes: open.lateMinutes, earlyMinutes, workedMinutes }
  }

  if (open) throw refuse(409, 'ALREADY_CHECKED_IN', 'You are already checked in.')
  const assigned = await tx.staffShiftAssignment.findMany({ where: { staffId: staff.id, shift: { active: true } }, include: { shift: true } })
  const date = dateIn(timezone, at)
  // Someone with several shifts comes more than once a day by definition.
  if (!rules.multipleSessions && assigned.length < 2 && latest && dateIn(timezone, latest.checkInAt) === date) {
    throw refuse(409, 'ALREADY_RECORDED', 'Your attendance for today is already recorded.')
  }
  const shift = nearestShift(assigned.map((a) => a.shift), minute)
  const lateMinutes = lateMinutesFor(shift, staff.attendanceExempt, minute)
  try {
    const s = await tx.staffAttendanceSession.create({ data: { staffId: staff.id, date: toDate(date), shiftId: shift?.id ?? null, checkInAt: at, lateMinutes, checkInKioskId: ctx.kioskId } })
    return { action, sessionId: s.id, status: lateMinutes ? 'LATE' : 'ON_TIME', lateMinutes, earlyMinutes: 0, workedMinutes: null }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw refuse(409, 'ALREADY_CHECKED_IN', 'You are already checked in.')
    throw err
  }
}
