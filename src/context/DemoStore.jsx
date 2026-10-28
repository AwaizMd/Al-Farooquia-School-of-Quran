import { createContext, useContext, useMemo, useReducer } from 'react'
import { DEFAULT_SETTINGS } from '../constants/config'
import { todayISO, weekday } from '../utils/date'
import { buildIndex } from '../services/selectors'

// Client-side cache of the records the server has sent for the signed-in
// account. Screens read from it through the selectors; every change goes to
// the API first and the affected slice is then reloaded (see AuthContext).
// Nothing here is persisted in the browser.

const StoreContext = createContext(null)

export function emptyState() {
  return {
    version: 3,
    settings: { ...DEFAULT_SETTINGS },
    session: null,
    groups: [], mentors: [], parents: [], students: [], feePlans: [],
    attendance: {}, hostelAttendance: {}, sabaq: [],
    invoices: [], payments: [],
    exams: [], results: [], grading: [],
    rooms: [], beds: [], library: [],
    notifications: [], audit: [],
    // Kept for selectors that still read them; reminders now live on the server.
    reminderSchedule: [], reminderTemplate: '', reminderLog: [],
  }
}

function reducer(state, a) {
  switch (a.type) {
    case 'LOGIN':
      return { ...state, session: { role: a.role, persona: a.persona || a.role, userId: a.userId, at: Date.now() } }
    case 'SELECT_CHILD':
      return { ...state, session: { ...state.session, childId: a.childId } }
    case 'LOGOUT':
      // Drop everything that belonged to the previous account.
      return { ...emptyState(), settings: state.settings }
    case 'HYDRATE_PEOPLE':
      return { ...state, students: a.students, parents: a.parents, groups: a.groups, mentors: a.mentors, feePlans: a.feePlans }
    case 'HYDRATE_ACTIVITY':
      // Today counts as a school day even before anyone has marked it (unless it is the weekly holiday).
      return { ...state, attendance: a.today && !a.attendance[a.today] && weekday(a.today) !== state.settings.weeklyOff ? { ...a.attendance, [a.today]: {} } : a.attendance, sabaq: a.sabaq }
    case 'HYDRATE_EXAMS':
      return { ...state, exams: a.exams, results: a.results, grading: a.grading }
    case 'HYDRATE_FEES':
      return { ...state, invoices: a.invoices, payments: a.payments }
    case 'HYDRATE_INBOX':
      // Server notifications belong to the signed-in account; address them to its view.
      return { ...state, settings: { ...state.settings, ...a.settings }, notifications: a.notifications.map((n) => ({ ...n, audience: [{ role: state.session?.role, id: state.session?.userId }] })) }
    case 'HYDRATE_CAMPUS':
      return { ...state, library: a.library, rooms: a.rooms, beds: a.beds, hostelAttendance: a.hostelAttendance }
    case 'HYDRATE_AUDIT':
      return { ...state, audit: a.audit }
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...a.patch } }
    case 'MARK_NOTIFICATIONS_READ': {
      const ids = new Set(a.ids)
      return { ...state, notifications: state.notifications.map((n) => (ids.has(n.id) ? { ...n, read: true } : n)) }
    }
    default:
      return state
  }
}

export function DemoStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, emptyState)
  const idx = useMemo(() => buildIndex(state), [state])
  const value = useMemo(() => ({ state, idx, dispatch, today: todayISO() }), [state, idx])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside DemoStoreProvider')
  return ctx
}
