import { t, currentLang } from "../i18n/I18nProvider"
// Pure derivations over the demo state. Dashboards never store totals; they
// compute them from the same underlying records through these helpers.
import { addDays, diffDays, monthKey, addMonths, todayISO } from '../utils/date'
import { surahByNumber, juzOf } from '../data/quran'
import { ADMIN_USER } from '../constants/config'

const PRIMARY = new Set(['sabaq', 'nazira', 'qaida', 'manzil'])
// The record type that carries a student's main lesson and next target, per learning track.
export const MAIN_CATEGORY = { hifz: 'sabaq', nazira: 'nazira', qaida: 'qaida', alim: 'manzil' }
export const isMain = (idx, r) => r.category === MAIN_CATEGORY[idx.students[r.studentId]?.track]

export function buildIndex(state) {
  const students = Object.fromEntries(state.students.map((s) => [s.id, s]))
  const groups = Object.fromEntries(state.groups.map((g) => [g.id, g]))
  const mentors = Object.fromEntries(state.mentors.map((m) => [m.id, m]))
  const parents = Object.fromEntries(state.parents.map((p) => [p.id, p]))
  const recordsByStudent = {}
  for (const r of state.sabaq) (recordsByStudent[r.studentId] ||= []).push(r)
  for (const k in recordsByStudent) recordsByStudent[k].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
  const paidByInvoice = {}
  for (const p of state.payments) paidByInvoice[p.invoiceId] = (paidByInvoice[p.invoiceId] || 0) + p.amount
  const invoicesByStudent = {}
  for (const i of state.invoices) (invoicesByStudent[i.studentId] ||= []).push(i)
  const bedByStudent = {}
  for (const b of state.beds) if (b.studentId) bedByStudent[b.studentId] = b
  const schoolDays = Object.keys(state.attendance).sort()
  return { students, groups, mentors, parents, recordsByStudent, paidByInvoice, invoicesByStudent, bedByStudent, schoolDays }
}

// ---------- People & scope ----------
export const groupName = (idx, id) => idx.groups[id]?.name || '—'
export const mentorOfStudent = (idx, s) => idx.mentors[idx.groups[s.groupId]?.mentorId]
export const mentorGroups = (state, mentorId) => state.groups.filter((g) => g.mentorId === mentorId)

export function sessionUser(state, idx) {
  const s = state.session
  if (!s) return null
  if (s.role === 'admin') return { ...ADMIN_USER, subtitle: t(ADMIN_USER.title) }
  if (s.role === 'mentor') { const m = idx.mentors[s.userId]; return m && { ...m, subtitle: t(m.role) } }
  if (s.role === 'student') { const st = idx.students[s.userId]; return st && { ...st, subtitle: t(groupName(idx, st.groupId)) } }
  if (s.role === 'parent') { const p = idx.parents[s.userId]; return p && { ...p, subtitle: t("Guardian of {n}", { n: p.children.length }) } }
  return null
}

export function visibleStudents(state, idx) {
  const s = state.session
  if (!s) return []
  if (s.role === 'admin') return state.students
  if (s.role === 'mentor') {
    const gids = new Set(mentorGroups(state, s.userId).map((g) => g.id))
    return state.students.filter((st) => gids.has(st.groupId))
  }
  if (s.role === 'student') return state.students.filter((st) => st.id === s.userId)
  if (s.role === 'parent') return (idx.parents[s.userId]?.children || []).map((id) => idx.students[id]).filter(Boolean)
  return []
}

export const canSeeStudent = (state, idx, sid) => visibleStudents(state, idx).some((s) => s.id === sid)

// ---------- Attendance ----------
export const latestSchoolDay = (idx, today = todayISO()) => idx.schoolDays.filter((d) => d <= today).pop() || today

export function attendanceCounts(state, date, students = state.students) {
  const day = state.attendance[date] || {}
  const c = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0, total: 0 }
  for (const s of students) {
    if (s.status !== 'active') continue
    c.total++
    const v = day[s.id]
    if (v) c[v]++
    else c.unmarked++
  }
  c.attending = c.present + c.late
  c.marked = c.total - c.unmarked
  return c
}

export function studentAttendance(state, sid, { from, to } = {}) {
  const c = { present: 0, late: 0, absent: 0, excused: 0, days: 0, history: [] }
  for (const date of Object.keys(state.attendance).sort()) {
    if (from && date < from) continue
    if (to && date > to) continue
    const v = state.attendance[date][sid]
    if (!v) continue
    c[v]++
    c.days++
    c.history.push({ date, status: v })
  }
  c.rate = c.days ? Math.round(((c.present + c.late) / c.days) * 100) : null
  return c
}

export function repeatedAbsences(state, idx, today = todayISO(), students = state.students) {
  const recent = idx.schoolDays.filter((d) => d <= today).slice(-7)
  return students
    .map((s) => ({ student: s, count: recent.filter((d) => state.attendance[d]?.[s.id] === 'absent').length }))
    .filter((x) => x.count >= 3)
    .sort((a, b) => b.count - a.count)
}

// ---------- Learning ----------
export const recordsFor = (idx, sid) => idx.recordsByStudent[sid] || []

export function learningStatus(idx, sid, today = todayISO()) {
  const recs = recordsFor(idx, sid).filter((r) => PRIMARY.has(r.category) && diffDays(today, r.date) <= 10).slice(0, 5)
  if (!recs.length) return { key: 'none', avg: null, recs }
  const avg = recs.reduce((a, r) => a + r.performance, 0) / recs.length
  const follow = recs.filter((r) => r.followUp).length
  const missed = recs.filter((r) => r.targetStatus !== 'met').length
  let key = 'on-track'
  if (avg < 2.5 || follow >= 3) key = 'attention'
  else if (avg < 3.4 || follow >= 2 || missed >= 2) key = 'revision'
  return { key, avg: +avg.toFixed(1), recs, follow, missed }
}

export function currentLevel(state, idx, sid) {
  const st = idx.students[sid]
  const latest = recordsFor(idx, sid).find((r) => isMain(idx, r))
  if (st.track === 'qaida') {
    const lesson = latest?.qaidaLesson || 1
    return { label: t("Qaida · Lesson {n} of 17", { n: lesson }), progress: Math.round(((lesson - 1) / 17) * 100), lesson, latest }
  }
  if (st.track === 'alim') return { label: t("Hafiz · Daily Manzil + Alimiyyah studies"), progress: null, latest, juz: 30 }
  if (!latest) return { label: t("Not started"), progress: 0, latest }
  const juz = juzOf(latest.surah, latest.toAyah)
  const s = surahByNumber(latest.surah)
  if (st.track === 'hifz') return { label: t("Juz {juz} · {surah}", { juz, surah: currentLang() === "ur" ? s.arabic : s.name }), juz, completedJuz: juz - 1, progress: Math.round(((juz - 1) / 30) * 100), surah: s, latest }
  return { label: t("Nazira · Juz {juz} · {surah}", { juz, surah: currentLang() === "ur" ? s.arabic : s.name }), juz, progress: Math.round((juz / 30) * 100), surah: s, latest }
}

export const latestTarget = (idx, sid) => recordsFor(idx, sid).find((r) => isMain(idx, r))?.nextTarget || '—'

export function sabaqToday(state, idx, students, today = todayISO()) {
  const present = students.filter((s) => ['present', 'late'].includes(state.attendance[today]?.[s.id]))
  const done = present.filter((s) => recordsFor(idx, s.id).some((r) => r.date === today && isMain(idx, r)))
  const doneIds = new Set(done.map((s) => s.id))
  return { present, done, pending: present.filter((s) => !doneIds.has(s.id)) }
}

// ---------- Fees ----------
export function invoiceView(idx, inv, today = todayISO()) {
  const paid = idx.paidByInvoice[inv.id] || 0
  const balance = Math.max(0, inv.amount - paid)
  let status = 'paid'
  if (balance > 0) status = inv.dueDate < today ? 'overdue' : paid > 0 ? 'partial' : 'due'
  if (balance > 0 && paid > 0 && inv.dueDate < today) status = 'overdue'
  return { ...inv, paid, balance, status }
}

export function studentFees(state, idx, sid, today = todayISO()) {
  const st = idx.students[sid]
  const invoices = (idx.invoicesByStudent[sid] || []).map((i) => invoiceView(idx, i, today)).sort((a, b) => b.period.localeCompare(a.period))
  const payments = state.payments.filter((p) => p.studentId === sid).sort((a, b) => b.date.localeCompare(a.date))
  const total = invoices.reduce((a, i) => a + i.amount, 0)
  const paid = invoices.reduce((a, i) => a + i.paid, 0)
  const balance = invoices.reduce((a, i) => a + i.balance, 0)
  const overdue = invoices.filter((i) => i.status === 'overdue').reduce((a, i) => a + i.balance, 0)
  const open = invoices.filter((i) => i.balance > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const status = st?.concession?.percent >= 100 ? 'waived' : balance === 0 ? 'paid' : overdue > 0 ? 'overdue' : paid > 0 && open.some((i) => i.paid > 0) ? 'partial' : 'due'
  return { invoices, payments, total, paid, balance, overdue, open, nextDue: open[0] || null, status }
}

export function feeTotals(state, idx, today = todayISO()) {
  const cur = monthKey(today)
  const collectedThisMonth = state.payments.filter((p) => monthKey(p.date) === cur).reduce((a, p) => a + p.amount, 0)
  let outstanding = 0, overdue = 0, billedThisMonth = 0
  for (const inv of state.invoices) {
    const v = invoiceView(idx, inv, today)
    outstanding += v.balance
    if (v.status === 'overdue') overdue += v.balance
    if (inv.period === cur) billedThisMonth += inv.amount
  }
  const months = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(cur, n))
  const byMonth = months.map((m) => ({
    month: m,
    collected: state.payments.filter((p) => monthKey(p.date) === m).reduce((a, p) => a + p.amount, 0),
    billed: state.invoices.filter((i) => i.period === m).reduce((a, i) => a + i.amount, 0),
  })).filter((r) => r.billed > 0 || r.collected > 0)
  return { collectedThisMonth, outstanding, overdue, billedThisMonth, byMonth }
}

export function nextReceiptNo(state, today = todayISO()) {
  const n = new Set(state.payments.map((p) => p.receiptNo)).size + 1
  return `NR-${today.slice(0, 4)}-${String(n).padStart(4, '0')}`
}

// ---------- Reminders ----------
export function reminderQueue(state, idx, today = todayISO()) {
  const stages = state.reminderSchedule.filter((s) => s.enabled).sort((a, b) => a.offset - b.offset)
  const rows = []
  for (const st of state.students) {
    const fees = studentFees(state, idx, st.id, today)
    if (fees.balance <= 0) continue
    const inv = fees.open[0]
    const sent = state.reminderLog.filter((l) => l.invoiceId === inv.id)
    const sentIds = new Set(sent.map((l) => l.stage))
    const plan = stages.map((s) => ({ ...s, date: addDays(inv.dueDate, s.offset), sent: sentIds.has(s.id) }))
    const dueNow = plan.filter((p) => !p.sent && p.date <= today)
    const next = plan.find((p) => !p.sent && p.date > today)
    const last = sent.sort((a, b) => b.sentOn.localeCompare(a.sentOn))[0]
    rows.push({
      student: st,
      parent: idx.parents[st.guardianId],
      invoice: inv,
      balance: fees.balance,
      overdue: inv.dueDate < today,
      plan,
      dueStage: dueNow[dueNow.length - 1] || null,
      next,
      last,
      state: dueNow.length ? 'ready' : next ? 'scheduled' : 'complete',
    })
  }
  return rows.sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate))
}

// ---------- Exams ----------
export function gradeFor(pct, grading) {
  const sorted = [...grading].sort((a, b) => b.min - a.min)
  return sorted.find((g) => pct >= g.min) || sorted[sorted.length - 1]
}

const ABSENT_GRADE = { grade: 'Absent', arabic: 'غائب', min: -1, meaning: 'Did not sit the exam' }

export function resultView(result, exam, grading) {
  const max = exam.subjects.reduce((a, s) => a + s.max, 0)
  const total = exam.subjects.reduce((a, s) => a + (Number(result.marks[s.name]) || 0), 0)
  const pct = max ? Math.round((total / max) * 100) : 0
  // A published exam keeps the grading scale it was graded with.
  return { ...result, total, max, pct, grade: result.absent ? ABSENT_GRADE : gradeFor(pct, exam.grading || grading) }
}

export function examStudents(state, exam) {
  return state.students.filter((s) => exam.groupIds.includes(s.groupId) && s.status === 'active')
}

export function examStatus(state, exam, today = todayISO()) {
  if (exam.date > today) return 'upcoming'
  const n = examStudents(state, exam).length
  const r = state.results.filter((x) => x.examId === exam.id).length
  if (r === 0 || r < n) return 'pending'
  return 'completed'
}

// ---------- Hostel ----------
export function hostelSummary(state, idx) {
  const occupied = state.beds.filter((b) => b.studentId).length
  const residents = state.students.filter((s) => s.hostel && s.status === 'active')
  const unassigned = residents.filter((s) => !idx.bedByStudent[s.id])
  return { rooms: state.rooms.length, beds: state.beds.length, occupied, available: state.beds.length - occupied, residents, unassigned }
}

export function hostelAlerts(state, idx, today = todayISO()) {
  const dates = Object.keys(state.hostelAttendance).sort().slice(-3)
  const alerts = []
  for (const d of dates) {
    for (const [sid, hs] of Object.entries(state.hostelAttendance[d])) {
      const cs = state.attendance[d]?.[sid]
      const st = idx.students[sid]
      if (!st) continue
      if (hs === 'absent') alerts.push({ type: 'absence', date: d, student: st, text: t("Absent at night roll call without leave") })
      if (cs === 'absent' && hs === 'present') alerts.push({ type: 'mismatch', date: d, student: st, text: t("Present in hostel but absent from class") })
      if (hs === 'absent' && (cs === 'present' || cs === 'late')) alerts.push({ type: 'mismatch', date: d, student: st, text: t("Attended class but missing at hostel roll call") })
    }
  }
  return alerts.sort((a, b) => b.date.localeCompare(a.date))
}

// ---------- Notifications ----------
export function notificationsFor(state) {
  const s = state.session
  if (!s) return []
  return state.notifications
    // Server notifications (with a category) already belong to the signed-in account.
    .filter((n) => n.category || n.audience.some((a) => a.role === s.role && (!a.id || a.id === s.userId)))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// ---------- Admin action centre ----------
export function actionItems(state, idx, today = todayISO()) {
  const items = []
  repeatedAbsences(state, idx, today).forEach(({ student, count }) =>
    items.push({ id: `abs-${student.id}`, kind: 'attendance', tone: 'red', title: `${student.name}: ${t("absent {n} of the last 7 school days", { n: count })}`, meta: t(groupName(idx, student.groupId)), to: `/students/${student.id}?tab=attendance` }))
  state.students.forEach((s) => {
    const ls = learningStatus(idx, s.id, today)
    if (ls.key === 'attention') items.push({ id: `learn-${s.id}`, kind: 'learning', tone: 'amber', title: `${s.name}: ${t("Sabaq difficulties")}`, meta: t("Avg rating {avg}/5 · {n} follow-ups", { avg: ls.avg, n: ls.follow }), to: `/students/${s.id}?tab=learning` })
  })
  const overdueStudents = state.students.map((s) => ({ s, f: studentFees(state, idx, s.id, today) })).filter((x) => x.f.overdue > 0)
  if (overdueStudents.length) items.push({ id: 'fees-overdue', kind: 'fees', tone: 'red', title: t("{n} students with overdue fees", { n: overdueStudents.length }), meta: overdueStudents.slice(0, 3).map((x) => x.s.name.split(' ')[0]).join(', ') + (overdueStudents.length > 3 ? '…' : ''), to: '/fees?status=overdue' })
  state.exams.filter((e) => e.date >= today && diffDays(e.date, today) <= 10).forEach((e) =>
    items.push({ id: `exam-${e.id}`, kind: 'exam', tone: 'blue', title: t("{title} in {n} days", { title: t(e.title), n: diffDays(e.date, today) }), meta: e.groupIds.map((g) => idx.groups[g]?.short).join(', '), to: `/exams/${e.id}` }))
  state.exams.filter((e) => examStatus(state, e, today) === 'pending').forEach((e) =>
    items.push({ id: `marks-${e.id}`, kind: 'review', tone: 'gold', title: t("Marks pending: {title}", { title: t(e.title) }), meta: e.groupIds.map((g) => idx.groups[g]?.short).join(', '), to: `/exams/${e.id}` }))
  state.groups.forEach((g) => {
    const sts = state.students.filter((s) => s.groupId === g.id && s.status === 'active')
    const att = attendanceCounts(state, today, sts)
    const mentor = idx.mentors[g.mentorId]
    if (att.unmarked === att.total && att.total) {
      items.push({ id: `mentor-${g.id}`, kind: 'mentor', tone: 'amber', title: t("{name}: attendance & Sabaq not submitted", { name: mentor?.name || t("Mentor") }), meta: t(g.name), to: `/mentors/${g.mentorId}` })
      return
    }
    const st = sabaqToday(state, idx, sts, today)
    if (st.pending.length) items.push({ id: `mentor-${g.id}`, kind: 'mentor', tone: 'gold', title: t("{name}: {n} Sabaq records pending", { name: mentor?.name || t("Mentor"), n: st.pending.length }), meta: t(g.name), to: `/mentors/${g.mentorId}` })
  })
  const ha = hostelAlerts(state, idx, today)
  if (ha.length) items.push({ id: 'hostel', kind: 'hostel', tone: 'red', title: t("{n} hostel attendance discrepancies", { n: ha.length }), meta: ha.slice(0, 2).map((a) => a.student.name.split(' ')[0]).join(', '), to: '/hostel?tab=attendance' })
  const hs = hostelSummary(state, idx)
  if (hs.unassigned.length) items.push({ id: 'beds', kind: 'hostel', tone: 'gold', title: t("{n} residents awaiting a bed", { n: hs.unassigned.length }), meta: hs.unassigned.map((s) => s.name.split(' ')[0]).join(', '), to: '/hostel?tab=rooms' })
  return items
}
