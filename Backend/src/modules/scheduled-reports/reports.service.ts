import type { Request } from 'express'
import type { NotificationChannel, ReportFrequency } from '../../generated/prisma/enums.js'
import { AppError } from '../../common/errors.js'
import { addDaysIso, dateIn, institutionTimezone } from '../../common/clock.js'
import { prisma } from '../../database/prisma.js'
import { audit } from '../audit-logs/audit.service.js'
import { gradeFor } from '../assessments/assessments.service.js'
import { guardiansOf, queueDelivery } from '../notifications/notify.service.js'
import { isoDate, toDate } from '../students/students.service.js'

export const SECTIONS = ['attendance', 'learning', 'assessments', 'feedback'] as const

export async function getConfig() {
  return prisma.scheduledReportConfig.findUniqueOrThrow({ where: { id: 1 } })
}

export async function setConfig(req: Request, c: { enabled: boolean; frequency: ReportFrequency; dayOfWeek: number; dayOfMonth: number; sendAt: string; channels: NotificationChannel[]; sections: string[] }) {
  if (c.sections.some((s) => !(SECTIONS as readonly string[]).includes(s))) throw new AppError(422, 'VALIDATION_FAILED', 'Unknown report section.')
  const saved = await prisma.scheduledReportConfig.update({ where: { id: 1 }, data: c })
  await audit({ action: 'reports.schedule_changed', summary: `${c.enabled ? c.frequency.toLowerCase() : 'disabled'} at ${c.sendAt}`, entityType: 'scheduled_report_config' }, req)
  return saved
}

/** Local time pieces of `now` in the institution timezone. */
function localParts(now: Date, tz: string) {
  const date = dateIn(tz, now)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return { date, time, weekday, day: Number(date.slice(8, 10)) }
}

/** The period a run on `date` reports on: the previous calendar month, or the previous 7 days. */
export function periodFor(frequency: ReportFrequency, date: string) {
  if (frequency === 'MONTHLY') {
    const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 1)
    const start = d.toISOString().slice(0, 10)
    const endD = new Date(`${date.slice(0, 7)}-01T00:00:00Z`)
    endD.setUTCDate(0)
    return { key: `M:${start.slice(0, 7)}`, start, end: endD.toISOString().slice(0, 10) }
  }
  const end = addDaysIso(date, -1)
  return { key: `W:${addDaysIso(date, -7)}`, start: addDaysIso(date, -7), end }
}

/** Hourly tick: run the report once its scheduled day and time have arrived. Safe to call any number of times. */
export async function tick(now = new Date()) {
  const cfg = await getConfig()
  if (!cfg.enabled) return { ran: false, reason: 'disabled' }
  const tz = await institutionTimezone()
  const t = localParts(now, tz)
  const dueToday = cfg.frequency === 'MONTHLY' ? t.day === cfg.dayOfMonth : t.weekday === cfg.dayOfWeek
  if (!dueToday || t.time < cfg.sendAt) return { ran: false, reason: 'not_due' }
  return runReport(periodFor(cfg.frequency, t.date), cfg)
}

/** Build and queue every guardian's report for one period. The unique period key makes reruns no-ops. */
export async function runReport(period: { key: string; start: string; end: string }, cfg?: Awaited<ReturnType<typeof getConfig>>) {
  const config = cfg ?? (await getConfig())
  let run
  try {
    run = await prisma.reportRun.create({ data: { periodKey: period.key, periodStart: toDate(period.start), periodEnd: toDate(period.end) } })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return { ran: false, reason: 'already_run', period: period.key }
    throw err
  }
  try {
    const students = await prisma.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } })
    const settings = await prisma.institutionSettings.findUnique({ where: { id: 1 } })
    let queued = 0
    for (const s of students) {
      const text = await buildReport(s.id, s.name, period, config.sections, settings?.brandName ?? 'the Madarsa')
      for (const g of await guardiansOf(prisma, s.id)) {
        for (const channel of config.channels) {
          if (channel === 'IN_APP' && !g.userId) continue
          const recipient = channel === 'EMAIL' ? g.email : channel === 'IN_APP' ? null : g.phone
          if (await queueDelivery(prisma, { dedupeKey: `report:${period.key}:${s.id}:${g.guardianId}:${channel}`, channel, category: 'PROGRESS', userId: g.userId, guardianId: g.guardianId, recipient, subject: `${s.name}: progress report ${period.start} to ${period.end}`, body: `Assalamu Alaikum ${g.name},\n\n${text}`, reportRunId: run.id })) queued++
        }
      }
    }
    await prisma.reportRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', finishedAt: new Date(), stats: { students: students.length, queued } } })
    return { ran: true, period: period.key, students: students.length, queued }
  } catch (err) {
    await prisma.reportRun.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), error: (err as Error).message.slice(0, 500) } })
    throw err
  }
}

/** Plain-text report from stored records only. Missing data is stated, never invented. */
export async function buildReport(studentId: string, name: string, period: { start: string; end: string }, sections: string[], madarsa: string) {
  const range = { gte: toDate(period.start), lte: toDate(period.end) }
  const lines = [`Progress report for ${name} from ${madarsa}, ${period.start} to ${period.end}.`, '']
  if (sections.includes('attendance')) {
    const marks = await prisma.attendanceRecord.groupBy({ by: ['status'], where: { studentId, date: range }, _count: true })
    const total = marks.reduce((a, m) => a + m._count, 0)
    const of = (s: string) => marks.find((m) => m.status === s)?._count ?? 0
    lines.push(total ? `Attendance: present ${of('PRESENT')}, late ${of('LATE')}, absent ${of('ABSENT')}, excused ${of('EXCUSED')} (out of ${total} marked days).` : 'Attendance: no attendance was recorded in this period.')
  }
  const records = sections.includes('learning') || sections.includes('feedback') ? await prisma.learningRecord.findMany({ where: { studentId, date: range }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }) : []
  if (sections.includes('learning')) {
    if (records.length) {
      const avg = records.reduce((a, r) => a + r.performance, 0) / records.length
      const met = records.filter((r) => r.targetStatus === 'MET').length
      lines.push(`Learning: ${records.length} lessons recorded, average performance ${avg.toFixed(1)} out of 5, targets met in ${met} of ${records.length}.`, `Current target: ${records[0]!.nextTarget}`)
    } else lines.push('Learning: no lessons were recorded in this period.')
  }
  if (sections.includes('feedback') && records.length) {
    const recent = records.filter((r) => r.comments).slice(0, 2)
    if (recent.length) lines.push(`Mentor feedback: ${recent.map((r) => `"${r.comments}" (${isoDate(r.date)})`).join(' ')}`)
  }
  if (sections.includes('assessments')) {
    const results = await prisma.examResult.findMany({ where: { studentId, exam: { status: 'PUBLISHED', date: range } }, include: { marks: true, exam: { include: { subjects: true, gradingScale: { include: { bands: true } } } } } })
    if (results.length) {
      for (const r of results) {
        const max = r.exam.subjects.reduce((a, x) => a + x.maxMarks, 0)
        const total = r.marks.reduce((a, m) => a + m.marks, 0)
        const pct = max ? Math.round((total / max) * 100) : 0
        lines.push(r.absent ? `${r.exam.title}: absent.` : `${r.exam.title}: ${total}/${max} (${pct}%)${r.exam.gradingScale ? `, ${gradeFor(pct, r.exam.gradingScale.bands).grade}` : ''}.`)
      }
    } else lines.push('Assessments: no published results in this period.')
  }
  lines.push('', 'Sign in to the Madarsa app for full details. JazakAllahu khairan.')
  return lines.join('\n')
}
