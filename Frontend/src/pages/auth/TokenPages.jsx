import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Mail } from 'lucide-react'
import { post, takeUrlToken } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Button, Input, Notice } from '../../components/ui'
import AuthLayout, { FormError } from './AuthLayout'
import MfaSetup from './MfaSetup'

// Read the emailed token once, then drop it from the address bar.
function useUrlToken() {
  const [token] = useState(() => takeUrlToken())
  return token
}

const BackToSignIn = () => <Link to="/login" className="mt-4 inline-block text-[13.5px] font-semibold text-primary-700 hover:underline">{t("Back to sign in")}</Link>

function NewPasswordForm({ submitLabel, onSubmit }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 10) return setErrors({ password: 'Use at least 10 characters.' })
    if (password !== confirm) return setErrors({ confirm: 'The two passwords do not match.' })
    setBusy(true)
    setErrors({})
    try {
      await onSubmit(password)
    } catch (err) {
      setErrors(err.fieldErrors?.password ? { password: err.fieldErrors.password } : { form: err.message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3.5" noValidate>
      <Input label={t("New password")} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint={t("At least 10 characters. A short sentence is easy to remember.")} />
      <Input label={t("Confirm new password")} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      <FormError error={errors.form} />
      <Button type="submit" size="lg" className="w-full" loading={busy}>{t(submitLabel)}</Button>
    </form>
  )
}

const MissingToken = () => (
  <AuthLayout title="Link not valid" subtitle="This link is incomplete. Open it again from your email, or ask the office for a new one.">
    <BackToSignIn />
  </AuthLayout>
)

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.')
    setBusy(true)
    try {
      await post('/auth/password/forgot', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthLayout title="Reset your password" subtitle={sent ? null : 'Enter the email address on your account and we will send a reset link.'}>
      {sent ? (
        <Notice tone="green" icon={Mail}>{t("If an account uses this email, a reset link is on its way. It works once and expires in 30 minutes.")}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-3.5" noValidate>
          <Input label={t("Email")} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} />
          <FormError error={error} />
          <Button type="submit" size="lg" className="w-full" loading={busy}>{t("Send reset link")}</Button>
        </form>
      )}
      <p className="mt-4 text-[12.5px] text-ink-muted">{t("Students without an email: ask the office to reset your password.")}</p>
      <BackToSignIn />
    </AuthLayout>
  )
}

export function ResetPassword() {
  const token = useUrlToken()
  const navigate = useNavigate()
  const [done, setDone] = useState(false)
  if (!token && !done) return <MissingToken />
  return (
    <AuthLayout title="Choose a new password" subtitle={done ? null : 'After this, every device signed in to your account will be signed out.'}>
      {done ? (
        <>
          <Notice tone="green" icon={CheckCircle2}>{t("Your password has been changed. Sign in with your new password.")}</Notice>
          <Button size="lg" className="mt-4 w-full" onClick={() => navigate('/login')}>{t("Sign in")}</Button>
        </>
      ) : (
        <NewPasswordForm submitLabel="Save new password" onSubmit={(password) => post('/auth/password/reset', { token, password }).then(() => setDone(true))} />
      )}
    </AuthLayout>
  )
}

export function AcceptInvite() {
  const token = useUrlToken()
  const navigate = useNavigate()
  const [done, setDone] = useState(false)
  if (!token && !done) return <MissingToken />
  return (
    <AuthLayout title="Welcome" subtitle={done ? null : 'Choose a password to activate your account.'}>
      {done ? (
        <>
          <Notice tone="green" icon={CheckCircle2}>{t("Your account is active. Sign in to continue.")}</Notice>
          <Button size="lg" className="mt-4 w-full" onClick={() => navigate('/login')}>{t("Sign in")}</Button>
        </>
      ) : (
        <NewPasswordForm submitLabel="Activate account" onSubmit={(password) => post('/auth/invite/accept', { token, password }).then(() => setDone(true))} />
      )}
    </AuthLayout>
  )
}

/** Second half of an office MFA reset: link/ticket + own password, then a fresh authenticator. */
export function MfaRecovery() {
  const token = useUrlToken()
  const auth = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState(false)

  if (verified) {
    return (
      <AuthLayout title="Set up your new phone" subtitle="Scan the QR code with the authenticator app on your new phone.">
        <MfaSetup onDone={auth.apply} />
      </AuthLayout>
    )
  }
  if (!token) return <MissingToken />
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await post('/auth/mfa/recovery/start', { token, identifier, password })
      setVerified(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthLayout title="Recover two-step verification" subtitle="Confirm it is you with your password. Then you can link a new authenticator app.">
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <Input label={t("Email or admission number")} autoComplete="username" autoCapitalize="none" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        <Input label={t("Password")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError error={error} />
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t("Continue")}</Button>
      </form>
      <BackToSignIn />
    </AuthLayout>
  )
}
