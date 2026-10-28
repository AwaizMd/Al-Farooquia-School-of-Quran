import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { get, onSessionLost, post, setCsrfToken } from '../api/client'
import { useStore } from './DemoStore'

const AuthContext = createContext(null)

// TRANSITIONAL: screens outside sign-in still read the in-browser demo dataset.
// Until each module moves to the API, a real signed-in user views the demo
// record for their role. Principal and Warden have no demo record yet.
const DEMO_VIEW = { ADMIN: { role: 'admin', userId: 'admin' }, MENTOR: { role: 'mentor', userId: 'm1' }, STUDENT: { role: 'student', userId: 'S-1001' }, PARENT: { role: 'parent', userId: 'p1' } }
const DEMO_PRIORITY = ['ADMIN', 'MENTOR', 'PARENT', 'STUDENT']
export const demoViewFor = (roles = []) => DEMO_VIEW[DEMO_PRIORITY.find((r) => roles.includes(r))] || null

export function AuthProvider({ children }) {
  const { state, dispatch } = useStore()
  // status: loading | anonymous | mfa_required | mfa_enrollment_required | full
  const [session, setSession] = useState({ status: 'loading', user: null })

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

  // Keep the demo-data view in step with the real session.
  const view = session.status === 'full' ? demoViewFor(session.user?.roles) : null
  useEffect(() => {
    if (session.status === 'loading') return
    const cur = state.session
    if (view && (cur?.role !== view.role || cur?.userId !== view.userId)) dispatch({ type: 'LOGIN', ...view })
    if (!view && cur) dispatch({ type: 'LOGOUT' })
  }, [session.status, view?.role, view?.userId, state.session?.role, state.session?.userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    ...session,
    demoReady: !!view && state.session?.role === view.role && state.session?.userId === view.userId,
    hasDemoView: !!view,
    apply,
    refresh,
    login: (identifier, password) => post('/auth/login', { identifier, password }).then(apply),
    verifyMfa: (code) => post('/auth/mfa/verify', { code }).then(apply),
    signInWithRecoveryCode: (code) => post('/auth/mfa/recovery-code', { code }).then(apply),
    logout: () => post('/auth/logout').catch(() => null).then(() => apply(null)),
  }), [session, view, state.session, apply, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
