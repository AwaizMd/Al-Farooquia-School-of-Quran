import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import { generateSeed } from '../data/generate'
import { STORAGE_KEY, ADMIN_USER } from '../constants/config'
import { todayISO, monthKey, addDays } from '../utils/date'
import { buildIndex, studentFees, nextReceiptNo } from '../services/selectors'
import { uid } from '../utils/format'

const StoreContext = createContext(null)

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.version === 2) return parsed
    }
  } catch {
    /* corrupted or blocked storage — fall back to a fresh seed */
  }
  return generateSeed(todayISO())
}

function actorOf(state) {
  const s = state.session
  if (!s) return { actor: 'System', role: 'system' }
  if (s.role === 'admin') return { actor: ADMIN_USER.name, role: 'admin' }
  if (s.role === 'mentor') return { actor: state.mentors.find((m) => m.id === s.userId)?.name || 'Mentor', role: 'mentor' }
  if (s.role === 'student') return { actor: state.students.find((m) => m.id === s.userId)?.name || 'Student', role: 'student' }
  return { actor: state.parents.find((m) => m.id === s.userId)?.name || 'Parent', role: 'parent' }
}

const withAudit = (state, entry) => ({
  ...state,
  audit: [{ id: uid('AU'), ts: new Date().toISOString(), ...actorOf(state), ...entry }, ...state.audit].slice(0, 400),
})

const notify = (state, n) => ({
  ...state,
  notifications: [{ id: uid('N'), date: todayISO(), read: false, ...n }, ...state.notifications],
})

function reducer(state, a) {
  switch (a.type) {
    case 'LOGIN':
      return { ...state, session: { role: a.role, userId: a.userId, at: Date.now() } }
    case 'SELECT_CHILD':
      return { ...state, session: { ...state.session, childId: a.childId } }
    case 'LOGOUT':
      return { ...state, session: null }
    case 'RESET': {
      const fresh = generateSeed(todayISO())
      return { ...fresh, session: state.session }
    }
    case 'UPDATE_SETTINGS':
      return withAudit({ ...state, settings: { ...state.settings, ...a.patch } }, { action: 'Settings updated', entity: 'Madarsa settings', description: Object.keys(a.patch).join(', ') })

    case 'ADD_STUDENT': {
      let next = { ...state }
      let guardianId = a.guardianId
      if (!guardianId) {
        guardianId = uid('p')
        next.parents = [...state.parents, { id: guardianId, ...a.guardian, email: a.guardian.email || '', children: [] }]
      }
      next.parents = next.parents.map((p) => (p.id === guardianId ? { ...p, children: [...p.children, a.student.id] } : p))
      const group = state.groups.find((g) => g.id === a.student.groupId)
      const student = { ...a.student, guardianId, track: group.track, status: 'active' }
      next.students = [...state.students, student]
      const plan = state.feePlans.find((p) => p.id === student.feePlanId)
      const pctOff = student.concession?.percent || 0
      if (plan && pctOff < 100) {
        const today = todayISO()
        const discount = Math.round((plan.amount * pctOff) / 100 / 10) * 10
        next.invoices = [...state.invoices, { id: `INV-${monthKey(today)}-${student.id}`, studentId: student.id, period: monthKey(today), planId: plan.id, gross: plan.amount, discount, amount: plan.amount - discount, issuedOn: today, dueDate: addDays(today, 7) }]
      }
      next = notify(next, { audience: [{ role: 'admin' }, { role: 'mentor', id: group.mentorId }], title: `New admission: ${student.name}`, body: `Added to ${group.name}.`, link: `/students/${student.id}` })
      return withAudit(next, { action: 'Student added', entity: student.name, entityId: student.id, description: `Admitted to ${group.name}` })
    }
    case 'UPDATE_STUDENT': {
      const group = state.groups.find((g) => g.id === a.patch.groupId)
      let students = state.students.map((s) => (s.id === a.id ? { ...s, ...a.patch, ...(group ? { track: group.track } : {}) } : s))
      let beds = state.beds
      const updated = students.find((s) => s.id === a.id)
      if (!updated.hostel || updated.status !== 'active') beds = beds.map((b) => (b.studentId === a.id ? { ...b, studentId: null } : b))
      const parents = a.guardianPatch ? state.parents.map((p) => (p.id === updated.guardianId ? { ...p, ...a.guardianPatch } : p)) : state.parents
      return withAudit({ ...state, students, beds, parents }, { action: 'Student record updated', entity: updated.name, entityId: a.id, description: a.summary || 'Profile details edited' })
    }

    case 'ADD_MENTOR':
      return withAudit({ ...state, mentors: [...state.mentors, a.mentor] }, { action: 'Mentor added', entity: a.mentor.name, entityId: a.mentor.id, description: a.mentor.role })
    case 'SET_MENTOR_STATUS':
      return withAudit({ ...state, mentors: state.mentors.map((m) => (m.id === a.id ? { ...m, status: a.status } : m)) }, { action: 'Mentor status changed', entity: state.mentors.find((m) => m.id === a.id)?.name, entityId: a.id, description: `Marked ${a.status}` })
    case 'ASSIGN_GROUP_MENTOR': {
      const g = state.groups.find((x) => x.id === a.groupId)
      const m = state.mentors.find((x) => x.id === a.mentorId)
      const count = state.students.filter((s) => s.groupId === a.groupId).length
      let next = { ...state, groups: state.groups.map((x) => (x.id === a.groupId ? { ...x, mentorId: a.mentorId } : x)) }
      next = notify(next, { audience: [{ role: 'mentor', id: a.mentorId }], title: `You have been assigned ${g.name}`, body: `${count} students are now in your halqa.`, link: '/students' })
      return withAudit(next, { action: 'Mentor assigned', entity: g.name, entityId: g.id, description: `${m.name} assigned · ${count} students` })
    }

    case 'SAVE_ATTENDANCE': {
      const day = { ...(state.attendance[a.date] || {}), ...a.statuses }
      const n = Object.keys(a.statuses).length
      return withAudit({ ...state, attendance: { ...state.attendance, [a.date]: day } }, { action: 'Attendance marked', entity: a.label || 'Class attendance', description: `${n} students · ${a.date}` })
    }
    case 'SAVE_HOSTEL_ATTENDANCE': {
      const day = { ...(state.hostelAttendance[a.date] || {}), ...a.statuses }
      return withAudit({ ...state, hostelAttendance: { ...state.hostelAttendance, [a.date]: day } }, { action: 'Hostel roll call saved', entity: 'Hostel', description: `${Object.keys(a.statuses).length} residents · ${a.date}` })
    }

    case 'ADD_SABAQ': {
      const r = a.record
      const st = state.students.find((s) => s.id === r.studentId)
      let next = { ...state, sabaq: [...state.sabaq, r] }
      next = notify(next, { audience: [{ role: 'student', id: st.id }, { role: 'parent', id: st.guardianId }], title: `New Sabaq record for ${st.name.split(' ')[0]}`, body: `${a.summary}. Next target: ${r.nextTarget}`, link: '/sabaq' })
      return withAudit(next, { action: 'Sabaq recorded', entity: st.name, entityId: st.id, description: a.summary })
    }

    case 'ADD_EXAM':
      return withAudit({ ...state, exams: [...state.exams, a.exam] }, { action: 'Examination scheduled', entity: a.exam.title, entityId: a.exam.id, description: `${a.exam.date} · ${a.exam.groupIds.length} group(s)` })
    case 'SAVE_RESULTS': {
      let results = state.results.filter((r) => !(r.examId === a.examId && a.entries.some((e) => e.studentId === r.studentId)))
      results = [...results, ...a.entries.map((e) => ({ id: uid('RS'), examId: a.examId, ...e }))]
      const ex = state.exams.find((e) => e.id === a.examId)
      return withAudit({ ...state, results }, { action: 'Assessment results updated', entity: ex.title, entityId: ex.id, description: `${a.entries.length} students' marks saved` })
    }
    case 'UPDATE_GRADING':
      return withAudit({ ...state, grading: a.grading }, { action: 'Grading scale updated', entity: 'Examinations', description: a.grading.map((g) => `${g.grade} ≥ ${g.min}`).join(', ') })

    case 'RECORD_PAYMENT': {
      const idx = buildIndex(state)
      const fees = studentFees(state, idx, a.studentId)
      let remaining = Math.min(a.amount, fees.balance)
      if (remaining <= 0) return state
      const newPays = []
      const targets = a.invoiceIds ? fees.open.filter((i) => a.invoiceIds.includes(i.id)) : fees.open
      for (const inv of targets) {
        if (remaining <= 0) break
        const amt = Math.min(remaining, inv.balance)
        newPays.push({ id: uid('PAY'), receiptNo: a.receiptNo, studentId: a.studentId, invoiceId: inv.id, amount: amt, date: todayISO(), method: a.method, recordedBy: actorOf(state).actor, note: a.note || '' })
        remaining -= amt
      }
      const total = newPays.reduce((s, p) => s + p.amount, 0)
      const st = state.students.find((s) => s.id === a.studentId)
      let next = { ...state, payments: [...state.payments, ...newPays] }
      next = notify(next, { audience: [{ role: 'admin' }, { role: 'parent', id: st.guardianId }, { role: 'student', id: st.id }], title: `Payment received for ${st.name.split(' ')[0]}`, body: `Receipt ${a.receiptNo} · ${a.method}${a.simulated ? ' (simulated)' : ''}`, link: '/fees' })
      return withAudit(next, { action: 'Fee payment recorded', entity: st.name, entityId: st.id, description: `Receipt ${a.receiptNo} · ${a.method}${a.simulated ? ' (simulated checkout)' : ''} · ${total}` })
    }

    case 'UPDATE_REMINDER_SCHEDULE':
      return withAudit({ ...state, reminderSchedule: a.schedule }, { action: 'Reminder schedule changed', entity: 'Fee reminders', description: a.schedule.filter((s) => s.enabled).map((s) => s.label).join('; ') })
    case 'UPDATE_REMINDER_TEMPLATE':
      return withAudit({ ...state, reminderTemplate: a.template }, { action: 'Reminder message edited', entity: 'Fee reminders', description: 'Message template updated' })
    case 'MARK_REMINDER_SENT': {
      const st = state.students.find((s) => s.id === a.studentId)
      const log = { id: uid('RM'), studentId: a.studentId, invoiceId: a.invoiceId, stage: a.stage, sentOn: todayISO(), channel: `${a.channel} (simulated)` }
      return withAudit({ ...state, reminderLog: [...state.reminderLog, log] }, { action: 'Fee reminder marked sent', entity: st.name, entityId: st.id, description: `${a.channel} · simulated, nothing was transmitted` })
    }

    case 'ASSIGN_BED': {
      const bed = state.beds.find((b) => b.id === a.bedId)
      if (!bed || bed.studentId) return state // guard: never double-assign a bed
      const st = state.students.find((s) => s.id === a.studentId)
      const beds = state.beds.map((b) => (b.studentId === a.studentId ? { ...b, studentId: null } : b)).map((b) => (b.id === a.bedId ? { ...b, studentId: a.studentId } : b))
      return withAudit({ ...state, beds }, { action: 'Hostel bed assigned', entity: st.name, entityId: st.id, description: `${bed.roomId} · ${bed.label}` })
    }
    case 'VACATE_BED': {
      const bed = state.beds.find((b) => b.id === a.bedId)
      const st = state.students.find((s) => s.id === bed?.studentId)
      if (!st) return state
      return withAudit({ ...state, beds: state.beds.map((b) => (b.id === a.bedId ? { ...b, studentId: null } : b)) }, { action: 'Hostel bed vacated', entity: st.name, entityId: st.id, description: `${bed.roomId} · ${bed.label}` })
    }

    case 'ADD_RESOURCE':
      return withAudit({ ...state, library: [a.resource, ...state.library] }, { action: 'Library resource added', entity: a.resource.title, entityId: a.resource.id, description: `${a.resource.category} · ${a.resource.type} (local demo only)` })

    case 'MARK_NOTIFICATIONS_READ': {
      const ids = new Set(a.ids)
      return { ...state, notifications: state.notifications.map((n) => (ids.has(n.id) ? { ...n, read: true } : n)) }
    }
    case 'LOG':
      return withAudit(state, a.entry)
    default:
      return state
  }
}

export function DemoStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial)
  const saveTimer = useRef()
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        /* storage full or blocked; the demo keeps working in memory */
      }
    }, 150)
  }, [state])

  const idx = useMemo(() => buildIndex(state), [state])
  const api = useMemo(() => ({
    receiptNo: () => nextReceiptNo(state),
  }), [state])
  const value = useMemo(() => ({ state, idx, dispatch, today: todayISO(), ...api }), [state, idx, api])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside DemoStoreProvider')
  return ctx
}
