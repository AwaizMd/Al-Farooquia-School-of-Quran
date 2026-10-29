import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button, Input } from '../../components/ui'
import AuthLayout, { CodeInput, FormError } from './AuthLayout'
import MfaSetup from './MfaSetup'

const MESSAGES = {
  INVALID_CREDENTIALS: 'The sign-in details are not correct.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  MFA_RECOVERY_REQUIRED: 'Your two-step verification was reset. Open the recovery link from your email, or the ticket from the office, to continue.',
}

export default function Login() {
  const auth = useAuth()
  if (auth.status === 'mfa_required') return <MfaChallenge />
  if (auth.status === 'mfa_enrollment_required') {
    return (
      <AuthLayout title="Set up two-step verification" subtitle="Your role requires an authenticator app. This takes about a minute.">
        <MfaSetup onDone={auth.apply} onCancel={auth.logout} />
      </AuthLayout>
    )
  }
  return <PasswordStep />
}

function PasswordStep() {
  const { login } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!identifier.trim() || !password) return setError('Enter your email (or admission number) and password.')
    setBusy(true)
    setError('')
    try {
      await login(identifier, password)
    } catch (err) {
      setError(MESSAGES[err.code] || err.message)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Assalamu Alaikum" subtitle="Sign in to your account.">
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <Input label={t("Email or admission number")} autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        <div className="relative">
          <Input label={t("Password")} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute bottom-0 end-1 flex h-11 w-11 items-center justify-center text-ink-muted" aria-label={show ? t("Hide password") : t("Show password")}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <FormError error={error} />
        <Button type="submit" size="lg" className="w-full" icon={Lock} loading={busy}>{t("Sign in")}</Button>
      </form>
      <div className="mt-4 flex justify-between text-[13.5px] font-semibold">
        <Link to="/forgot-password" className="text-primary-700 hover:underline">{t("Forgot password?")}</Link>
      </div>
      <p className="mt-6 text-[12.5px] leading-relaxed text-ink-muted">{t("Accounts are created by the Madarsa office. If you have not received an invitation, please contact the office.")}</p>
    </AuthLayout>
  )
}

function MfaChallenge() {
  const { verifyMfa, signInWithRecoveryCode, logout } = useAuth()
  const [recovery, setRecovery] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!recovery && code.length !== 6) return setError('Enter the 6-digit code from your authenticator app.')
    if (recovery && code.replace(/[^A-Z0-9]/g, '').length !== 10) return setError('Enter one of your 10-character recovery codes.')
    setBusy(true)
    setError('')
    try {
      await (recovery ? signInWithRecoveryCode(code) : verifyMfa(code))
    } catch (err) {
      if (err.code === 'MFA_ATTEMPTS_EXCEEDED' || err.status === 401) await logout()
      setError(err.code === 'RATE_LIMITED' ? MESSAGES.RATE_LIMITED : err.message)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Two-step verification" subtitle={recovery ? 'Enter one of the recovery codes you saved when you set up your authenticator.' : 'Open your authenticator app and enter the 6-digit code for this account.'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <CodeInput key={recovery ? 'r' : 'c'} label={recovery ? 'Recovery code' : 'Authenticator code'} recovery={recovery} value={code} onChange={(v) => { setCode(v); setError('') }} error={error} />
        <FormError error={error} />
        <Button type="submit" size="lg" className="w-full" icon={ShieldCheck} loading={busy}>{t("Verify")}</Button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-[13.5px] font-semibold">
        <button type="button" className="text-primary-700 hover:underline" onClick={() => { setRecovery((r) => !r); setCode(''); setError('') }}>
          {recovery ? t("Use authenticator code") : t("Lost your phone? Use a recovery code")}
        </button>
        <button type="button" className="text-ink-muted hover:underline" onClick={logout}>{t("Cancel")}</button>
      </div>
      {recovery && <p className="mt-4 text-[12.5px] text-ink-muted">{t("No recovery codes? Contact the Madarsa office to reset two-step verification.")}</p>}
    </AuthLayout>
  )
}
