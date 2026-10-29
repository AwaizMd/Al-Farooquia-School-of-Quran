import { t } from "../../i18n/I18nProvider"
import { useEffect, useRef, useState } from 'react'
import { Copy, Download, KeyRound, ShieldCheck, Smartphone } from 'lucide-react'
import { post } from '../../api/client'
import { Button, Notice } from '../../components/ui'
import { CodeInput, FormError } from './AuthLayout'

/**
 * Authenticator setup: QR code -> first code -> one-time recovery codes.
 * `onDone(session)` receives the new full session once the user has saved their codes.
 */
export default function MfaSetup({ onDone, onCancel, begin = () => post('/auth/mfa/enrollment') }) {
  const [enrollment, setEnrollment] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const started = useRef(false)

  const start = () => {
    setError('')
    setCode('')
    begin().then(setEnrollment, (e) => (e.code === 'CANCELLED' ? onCancel?.() : setError(e.message)))
  }
  useEffect(() => {
    if (started.current) return // StrictMode double-run would replace the secret
    started.current = true
    start()
  }, [])

  const confirm = async (e) => {
    e.preventDefault()
    if (code.length !== 6) return setError('Enter the 6-digit code from your authenticator app.')
    setBusy(true)
    try {
      setResult(await post('/auth/mfa/enrollment/confirm', { code }))
      setEnrollment(null) // forget the QR and key as soon as they are no longer needed
    } catch (err) {
      setError(err.message)
      if (err.code === 'ENROLLMENT_EXPIRED') setEnrollment(null)
    } finally {
      setBusy(false)
    }
  }

  if (result) return <RecoveryCodes codes={result.recoveryCodes} onContinue={() => onDone(result.session)} />

  if (!enrollment) {
    return (
      <div className="space-y-4">
        <FormError error={error} />
        {error ? <Button onClick={start} className="w-full">{t("Start again")}</Button> : <p className="text-[14px] text-ink-muted">{t("Preparing your QR code…")}</p>}
        {onCancel && <Button variant="ghost" onClick={onCancel} className="w-full">{t("Cancel")}</Button>}
      </div>
    )
  }

  return (
    <form onSubmit={confirm} className="space-y-4" noValidate>
      <ol className="space-y-2 text-[13.5px] text-ink-soft">
        <li className="flex gap-2"><Smartphone size={17} className="mt-0.5 shrink-0 text-primary-600" />{t("Open Google Authenticator or Microsoft Authenticator and add an account.")}</li>
        <li className="flex gap-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary-600" />{t("Scan this QR code. It is shown only now, on this screen.")}</li>
      </ol>
      <div className="flex justify-center">
        <img src={enrollment.qrDataUrl} alt={t("QR code for your authenticator app")} width={220} height={220} className="rounded-2xl border border-line bg-white p-2" />
      </div>
      <details className="rounded-xl border border-line bg-white px-3 py-2 text-[13px]">
        <summary className="cursor-pointer font-semibold text-forest">{t("Can't scan? Enter this key instead")}</summary>
        <p className="mt-2 select-all break-all font-mono text-[14px] tracking-wider text-ink">{enrollment.manualEntryKey}</p>
      </details>
      <CodeInput value={code} onChange={(v) => { setCode(v); setError('') }} error={error} autoFocus={false} />
      <FormError error={error} />
      <Button type="submit" size="lg" className="w-full" loading={busy} icon={KeyRound}>{t("Verify and turn on")}</Button>
      {onCancel && <Button variant="ghost" onClick={onCancel} className="w-full">{t("Cancel")}</Button>}
    </form>
  )
}

export function RecoveryCodes({ codes, onContinue }) {
  const [saved, setSaved] = useState(false)
  const text = codes.join('\n')
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${t("Recovery codes")} — ${t("each code works once")}\n\n${text}\n`], { type: 'text/plain' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'recovery-codes.txt' })
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-4">
      <Notice tone="gold" icon={KeyRound}>{t("Save these recovery codes somewhere safe. Each one lets you sign in once if you lose your phone. They will not be shown again.")}</Notice>
      <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-white p-3 font-mono text-[15px] tracking-wider text-ink" aria-label={t("Recovery codes")}>
        {codes.map((c) => <li key={c} className="rounded-lg bg-ivory-50 px-2 py-1.5 text-center">{c}</li>)}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={Copy} onClick={() => navigator.clipboard?.writeText(text)}>{t("Copy")}</Button>
        <Button variant="secondary" icon={Download} onClick={download}>{t("Download")}</Button>
      </div>
      <label className="flex items-start gap-2 text-[13.5px] text-ink-soft">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1 h-4 w-4 accent-primary-700" />
        {t("I have saved my recovery codes")}
      </label>
      <Button size="lg" className="w-full" disabled={!saved} onClick={onContinue}>{t("Continue")}</Button>
    </div>
  )
}
