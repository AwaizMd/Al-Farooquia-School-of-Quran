import { t } from "../../i18n/I18nProvider"
import { useEffect, useState } from 'react'
import { KeyRound, LaptopMinimal, LogOut, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react'
import { del, get, post } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { Badge, Button, Card, CardHeader, ConfirmDialog, Input, Modal, PageHeader } from '../../components/ui'
import MfaSetup, { RecoveryCodes } from '../auth/MfaSetup'
import { FormError } from '../auth/AuthLayout'
import { fmtDateTime } from '../../utils/date'

export default function Security() {
  const { user, apply, refresh } = useAuth()
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const [setup, setSetup] = useState(false)
  const [codes, setCodes] = useState(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const mfa = user.mfa

  const startSetup = () => setSetup(true)
  // From a full session the server asks for a fresh password first; run() handles that.
  const beginEnrollment = () => run(() => post('/auth/mfa/enrollment'))

  const regenerate = () => run(() => post('/auth/mfa/recovery-codes')).then((r) => { setCodes(r.recoveryCodes); refresh() }, (e) => e.code !== 'CANCELLED' && toast(e.message, { type: 'error' }))
  const turnOff = () => run(() => del('/auth/mfa')).then(() => { refresh(); toast(t('Two-step verification turned off')) }, (e) => e.code !== 'CANCELLED' && toast(e.message, { type: 'error' }))

  return (
    <div className="space-y-5">
      <PageHeader title="Account security" subtitle="Two-step verification, password and signed-in devices" />

      <Card>
        <CardHeader icon={ShieldCheck} title="Two-step verification" subtitle="A code from your authenticator app is needed when you sign in."
          action={<Badge tone={mfa.enabled ? 'green' : 'neutral'}>{mfa.enabled ? t('On') : t('Off')}</Badge>} />
        <div className="space-y-3 px-4 pb-4 pt-3 sm:px-5">
          {mfa.required && <p className="text-[13px] text-ink-muted">{t("Required for your role. It cannot be turned off.")}</p>}
          {mfa.enabled ? (
            <>
              <p className="text-[13.5px] text-ink-soft">{t("{n} unused recovery codes left.", { n: mfa.recoveryCodesRemaining })}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={KeyRound} onClick={regenerate}>{t("New recovery codes")}</Button>
                {!mfa.required && <Button variant="danger-soft" icon={ShieldOff} onClick={() => setConfirmOff(true)}>{t("Turn off")}</Button>}
              </div>
              <p className="text-[12.5px] text-ink-muted">{t("Changing phones? Turn it off and on again, or ask the office to reset it if you no longer have your phone.")}</p>
            </>
          ) : (
            <Button icon={Smartphone} onClick={startSetup}>{t("Turn on two-step verification")}</Button>
          )}
        </div>
      </Card>

      <ChangePassword />
      <Devices />

      <Modal open={setup} onClose={() => setSetup(false)} title="Set up two-step verification" size="sm">
        <MfaSetup begin={beginEnrollment} onCancel={() => setSetup(false)} onDone={(s) => { apply(s); setSetup(false); toast(t('Two-step verification is on')) }} />
      </Modal>
      <Modal open={!!codes} onClose={() => setCodes(null)} title="New recovery codes" subtitle="Your previous codes no longer work." size="sm">
        {codes && <RecoveryCodes codes={codes} onContinue={() => setCodes(null)} />}
      </Modal>
      <ConfirmDialog open={confirmOff} onClose={() => setConfirmOff(false)} onConfirm={turnOff} tone="danger" confirmLabel="Turn off" title="Turn off two-step verification?">
        Anyone who learns your password will be able to sign in. You can turn it back on at any time.
      </ConfirmDialog>
      {dialog}
    </div>
  )
}

function ChangePassword() {
  const toast = useToast()
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    if (f.newPassword.length < 10) return setErrors({ newPassword: 'Use at least 10 characters.' })
    if (f.newPassword !== f.confirm) return setErrors({ confirm: 'The two passwords do not match.' })
    setBusy(true)
    setErrors({})
    try {
      await post('/auth/password/change', { currentPassword: f.currentPassword, newPassword: f.newPassword })
      setF({ currentPassword: '', newPassword: '', confirm: '' })
      toast(t('Password changed'), { description: t('Other devices have been signed out.') })
    } catch (err) {
      setErrors(err.code === 'REAUTH_FAILED' ? { currentPassword: err.message } : err.fieldErrors.newPassword ? { newPassword: err.fieldErrors.newPassword } : { form: err.message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader icon={KeyRound} title="Password" subtitle="Changing it signs out your other devices." />
      <form onSubmit={submit} className="grid gap-3 px-4 pb-4 pt-3 sm:grid-cols-3 sm:px-5" noValidate>
        <Input label={t("Current password")} type="password" autoComplete="current-password" value={f.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} />
        <Input label={t("New password")} type="password" autoComplete="new-password" value={f.newPassword} onChange={set('newPassword')} error={errors.newPassword} />
        <Input label={t("Confirm new password")} type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} />
        <div className="sm:col-span-3"><FormError error={errors.form} /></div>
        <div className="sm:col-span-3"><Button type="submit" loading={busy}>{t("Change password")}</Button></div>
      </form>
    </Card>
  )
}

function Devices() {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const load = () => get('/auth/sessions').then((r) => setItems(r.items), () => setItems([]))
  useEffect(() => { load() }, [])
  const signOutOthers = () => post('/auth/sessions/revoke-others').then((r) => { toast(t('Signed out {n} other device(s)', { n: r.revoked })); load() })
  return (
    <Card>
      <CardHeader icon={LaptopMinimal} title="Signed-in devices" action={items?.length > 1 && <Button size="sm" variant="secondary" icon={LogOut} onClick={signOutOthers}>{t("Sign out others")}</Button>} />
      <ul className="divide-y divide-line px-4 pb-2 sm:px-5">
        {items === null && <li className="py-3 text-[13.5px] text-ink-muted">{t("Loading…")}</li>}
        {items?.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-forest">{describeAgent(s.userAgent)}{s.current && <Badge tone="green" className="ms-2">{t("This device")}</Badge>}</p>
              <p className="text-[12.5px] text-ink-muted">{t("Last active {date}", { date: fmtDateTime(s.lastSeenAt) })}</p>
            </div>
            {!s.current && <Button size="sm" variant="ghost" onClick={() => del(`/auth/sessions/${s.id}`).then(load)}>{t("Sign out")}</Button>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function describeAgent(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : t('Browser')
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}
