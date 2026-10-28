import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { get, onSessionLost, post, setCsrfToken } from '../api/client'
import { loadActivity, loadExams, loadFees, loadPeople } from '../api/people'
import { useStore } from './DemoStore'

const AuthContext = createContext(null)

// Which screens a signed-in account sees ("persona"), and which demo-data role
// the not-yet-migrated screens read with. Principal and Warden reuse the admin
// screens with their own navigation; the server enforces what they may do.
const PRIORITY = ['ADMIN', 'PRINCIPAL', 'MENTOR', 'WARDEN', 'PARENT', 'STUDENT']
export function viewFor(user) {
  const roles = user?.roles || []
  const links = user?.links || {}
  for (const r of PRIORITY) {
    if (!roles.includes(r)) continue
    if (r === 'ADMIN') return { persona: 'admin', role: 'admin', userId: 'admin' }
    if (r === 'PRINCIPAL') return { persona: 'principal', role: 'admin', userId: links.staff?.code || 'admin' }
    if (r === 'MENTOR' && links.staff) return { persona: 'mentor', role: 'mentor', userId: links.staff.code }
    if (r === 'WARDEN') return { persona: 'warden', role: 'admin', userId: links.staff?.code || 'admin' }
    if (r === 'PARENT' && links.guardian) return { persona: 'parent', role: 'parent', userId: links.guardian.code }
    if (r === 'STUDENT' && links.student) return { persona: 'student', role: 'student', userId: links.student.admissionNo }
  }
  return null // an account with no linked record yet: only its security page is available
}

export function AuthProvider({ children }) {
  const { state, dispatch } = useStore()
  // status: loading | anonymous | mfa_required | mfa_enrollment_required | full
  const [session, setSession] = useState({ status: 'loading', user: null })
  const [people, setPeople] = useState({ status: 'idle', error: null })

  const apply = useCallback((s) => {
    if (!s) {
      setCsrfToken('')
      setSession({ status: 'anonymous', user: null })
    } else {
      setSession({ status: s.stage, user: s.user })
    }
    return s
  }, [])

  const refresh = useCallback(() => get('/auth/session').then(apply, () => apply(null)), [apply])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => onSessionLost(() => apply(null)), [apply])

  const view = session.status === 'full' ? viewFor(session.user) : null

  // Replace the store's people with the records this account may see.
  const refreshPeople = useCallback(async () => {
    setPeople((p) => ({ ...p, status: p.status === 'ready' ? 'ready' : 'loading' }))
    try {
      const [people, activity, exams, fees] = await Promise.all([loadPeople(session.user), loadActivity(), loadExams(), loadFees()])
      dispatch({ type: 'HYDRATE_PEOPLE', ...people })
      dispatch({ type: 'HYDRATE_ACTIVITY', ...activity })
      dispatch({ type: 'HYDRATE_EXAMS', ...exams })
      dispatch({ type: 'HYDRATE_FEES', ...fees })
      setPeople({ status: 'ready', error: null })
    } catch (err) {
      setPeople({ status: 'error', error: err })
    }
  }, [dispatch, session.user])

  useEffect(() => {
    if (view) refreshPeople()
    else setPeople({ status: 'idle', error: null })
  }, [view?.persona, view?.userId, session.user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the demo-data session in step with the real one.
  useEffect(() => {
    if (session.status === 'loading') return
    const cur = state.session
    if (view && (cur?.persona !== view.persona || cur?.userId !== view.userId)) dispatch({ type: 'LOGIN', ...view })
    if (!view && cur) dispatch({ type: 'LOGOUT' })
  }, [session.status, view?.persona, view?.userId, state.session?.persona, state.session?.userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    ...session,
    hasDemoView: !!view,
    demoReady: !!view && state.session?.persona === view.persona && state.session?.userId === view.userId && people.status === 'ready',
    peopleError: people.error,
    apply,
    refresh,
    refreshPeople,
    // Reload attendance and lesson records only (after saving one of them).
    refreshActivity: () => loadActivity().then((activity) => dispatch({ type: 'HYDRATE_ACTIVITY', ...activity })),
    refreshExams: () => loadExams().then((exams) => dispatch({ type: 'HYDRATE_EXAMS', ...exams })),
    refreshFees: () => loadFees().then((fees) => dispatch({ type: 'HYDRATE_FEES', ...fees })),
    login: (identifier, password) => post('/auth/login', { identifier, password }).then(apply),
    verifyMfa: (code) => post('/auth/mfa/verify', { code }).then(apply),
    signInWithRecoveryCode: (code) => post('/auth/mfa/recovery-code', { code }).then(apply),
    logout: () => post('/auth/logout').catch(() => null).then(() => apply(null)),
  }), [session, view, state.session, people, apply, refresh, refreshPeople])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
