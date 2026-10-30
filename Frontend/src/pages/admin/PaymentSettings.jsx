import { t } from '../../i18n/I18nProvider'
import { useEffect, useState } from 'react'
import { CreditCard, Landmark, QrCode, CheckCircle2, AlertTriangle, ShieldCheck, Trash2, Upload, Save, KeyRound, Copy } from 'lucide-react'
import { PageHeader, Card, CardHeader, Button, Input, Select, Textarea, Notice, Badge, Segmented, cx } from '../../components/ui'
import { useToast } from '../../context/ToastContext'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { blobUrl } from '../../api/client'
import { getPaymentSettings, removeUpiQr, savePaymentSettings, uploadUpiQr, validateRazorpay } from '../../api/payments'
import { BankDetails } from '../../features/fees/PaymentMethods'
import { fmtDate } from '../../utils/date'

const MODES = [
  { value: 'online', icon: CreditCard, title: 'Razorpay only', text: 'Families pay online. Confirmed automatically by the gateway; Razorpay charges a fee per payment.' },
  { value: 'manual', icon: Landmark, title: 'Bank Transfer / UPI QR only', text: 'Families pay directly into the Madarsa’s account and report it; the office verifies each payment.' },
  { value: 'both', icon: ShieldCheck, title: 'Both', text: 'Families choose: online through Razorpay, or bank transfer / UPI with office verification.' },
]
const modeOf = (s) => (s.razorpay.enabled && (s.bank.enabled || s.upi.enabled) ? 'both' : s.razorpay.enabled ? 'online' : 'manual')

function Ready({ ready, problems, enabled }) {
  return (
    <div className="mt-3">
      <Badge tone={ready ? 'green' : 'amber'} icon={ready ? CheckCircle2 : AlertTriangle}>{t(ready ? (enabled ? 'Ready · offered to families' : 'Ready · not offered') : 'Not ready')}</Badge>
      {!ready && problems.length > 0 && <ul className="mt-2 list-disc space-y-0.5 ps-5 text-[12.5px] text-ink-soft">{problems.map((p) => <li key={p}>{t(p)}</li>)}</ul>}
    </div>
  )
}

export default function PaymentSettings() {
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const [s, setS] = useState(null)
  const [draft, setDraft] = useState(null)
  const [secrets, setSecrets] = useState({ keyId: '', keySecret: '', webhookSecret: '' })
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState('')
  const [qr, setQr] = useState(null)

  // After saving everything: the form becomes the saved state.
  const adopt = (v) => {
    setS(v)
    setDraft({ mode: modeOf(v), rzpMode: v.razorpay.mode, bank: { ...v.bank }, upi: { ...v.upi }, bankOn: v.bank.enabled, upiOn: v.upi.enabled })
    setSecrets({ keyId: '', keySecret: '', webhookSecret: '' })
  }
  // After a partial action (QR upload, key validation): refresh status, keep unsaved edits.
  const refreshStatus = (v) => {
    setS(v)
    setDraft((d) => ({ ...d, rzpMode: v.razorpay.mode, upiOn: d.upiOn && v.upi.hasQr }))
  }
  useEffect(() => { getPaymentSettings().then(adopt, (e) => toast(e.message, { type: 'error' })) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let url
    if (s?.upi.hasQr) blobUrl('/payments/upi-qr').then((u) => { url = u; setQr(u) }, () => setQr(null))
    else setQr(null)
    return () => url && URL.revokeObjectURL(url)
  }, [s?.upi.hasQr, s?.updatedAt])

  if (!s || !draft) return <PageHeader title={t('Fee Payment Settings')} subtitle={t('Loading…')} />
  const rzp = s.razorpay
  const envManaged = rzp.source !== 'settings'
  const online = draft.mode !== 'manual'
  const manual = draft.mode !== 'online'
  const setBank = (k, v) => setDraft((d) => ({ ...d, bank: { ...d.bank, [k]: v } }))
  const setUpi = (k, v) => setDraft((d) => ({ ...d, upi: { ...d.upi, [k]: v } }))

  const payload = () => ({
    razorpay: {
      enabled: online,
      ...(envManaged ? {} : { mode: draft.rzpMode, ...(secrets.keyId.trim() ? { keyId: secrets.keyId.trim() } : {}), ...(secrets.keySecret ? { keySecret: secrets.keySecret } : {}), ...(secrets.webhookSecret ? { webhookSecret: secrets.webhookSecret } : {}) }),
    },
    bank: { enabled: manual && draft.bankOn, accountName: draft.bank.accountName, bankName: draft.bank.bankName, accountNumber: draft.bank.accountNumber, ifsc: draft.bank.ifsc, branch: draft.bank.branch, accountType: draft.bank.accountType || null, instructions: draft.bank.instructions, referenceHint: draft.bank.referenceHint, proofRequired: !!draft.bank.proofRequired },
    upi: { enabled: manual && draft.upiOn, upiId: draft.upi.upiId, payeeName: draft.upi.payeeName, instructions: draft.upi.instructions, proofRequired: !!draft.upi.proofRequired },
  })

  const save = async () => {
    if (manual && !draft.bankOn && !draft.upiOn) return setErrors([{ path: 'mode', message: 'Choose bank transfer, UPI QR or both.' }])
    setBusy('save')
    setErrors([])
    try {
      adopt(await run(() => savePaymentSettings(payload())))
      toast(t('Payment settings saved'), { description: t('Families now see only the methods that are switched on and ready.') })
    } catch (err) {
      if (err.code !== 'CANCELLED') { setErrors(Array.isArray(err.details) ? err.details : [{ path: '', message: err.message }]); toast(err.message, { type: 'error' }) }
    } finally { setBusy('') }
  }

  // Save any newly typed keys (without switching anything on), then ask Razorpay.
  const validate = async () => {
    setBusy('validate')
    try {
      if (secrets.keyId || secrets.keySecret || secrets.webhookSecret || draft.rzpMode !== rzp.mode) {
        refreshStatus(await run(() => savePaymentSettings({ razorpay: { mode: draft.rzpMode, ...(secrets.keyId.trim() ? { keyId: secrets.keyId.trim() } : {}), ...(secrets.keySecret ? { keySecret: secrets.keySecret } : {}), ...(secrets.webhookSecret ? { webhookSecret: secrets.webhookSecret } : {}) } })))
      }
      const r = await validateRazorpay()
      toast(t(r.message))
      refreshStatus(await getPaymentSettings())
      setSecrets({ keyId: '', keySecret: '', webhookSecret: '' })
    } catch (err) {
      if (err.code !== 'CANCELLED') toast(err.message, { type: 'error' })
    } finally { setBusy('') }
  }

  const uploadQr = async (file) => {
    if (!file) return
    setBusy('qr')
    try {
      refreshStatus(await run(() => uploadUpiQr(file)))
      toast(t('UPI QR code uploaded'))
    } catch (err) {
      if (err.code !== 'CANCELLED') toast(err.message, { type: 'error' })
    } finally { setBusy('') }
  }
  const deleteQr = async () => {
    if (!window.confirm(t('Remove the UPI QR code? UPI payments will be switched off until a new one is uploaded.'))) return
    setBusy('qr')
    try { refreshStatus(await run(() => removeUpiQr())) } catch (err) { if (err.code !== 'CANCELLED') toast(err.message, { type: 'error' }) } finally { setBusy('') }
  }
  const copy = (v) => navigator.clipboard.writeText(v).then(() => toast(t('Copied')), () => {})
  const err = (path) => errors.filter((e) => e.path === path).map((e) => t(e.message)).join(' ') || undefined

  return (
    <div className="space-y-4 pb-24">
      <PageHeader title={t('Fee Payment Settings')} subtitle={t('Choose how families can pay fees. Changes apply immediately; past payments keep their method and history.')} />

      <Card>
        <CardHeader title={t('Payment methods offered')} subtitle={t('Only methods that are switched on and fully set up are shown to families')} icon={ShieldCheck} />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <div role="radiogroup" aria-label={t('Payment methods offered')} className="mt-3 grid gap-2 md:grid-cols-3">
          {MODES.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={draft.mode === m.value} onClick={() => setDraft((d) => ({ ...d, mode: m.value, ...(m.value !== 'online' && !d.bankOn && !d.upiOn ? { bankOn: true } : {}) }))}
              className={cx('flex items-start gap-3 rounded-xl border px-3.5 py-3 text-start transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500', draft.mode === m.value ? 'border-primary-500 bg-primary-50/60' : 'border-line hover:border-primary-200')}>
              <m.icon size={20} className="mt-0.5 shrink-0 text-primary-700" aria-hidden />
              <span><span className="block text-[14px] font-bold text-forest">{t(m.title)}</span><span className="block text-[12px] text-ink-muted">{t(m.text)}</span></span>
            </button>
          ))}
        </div>
        {manual && (
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex min-h-[44px] items-center gap-2 text-[14px]"><input type="checkbox" className="h-5 w-5 accent-primary-700" checked={draft.bankOn} onChange={(e) => setDraft((d) => ({ ...d, bankOn: e.target.checked }))} /> {t('Bank transfer')}</label>
            <label className="flex min-h-[44px] items-center gap-2 text-[14px]"><input type="checkbox" className="h-5 w-5 accent-primary-700" checked={draft.upiOn} onChange={(e) => setDraft((d) => ({ ...d, upiOn: e.target.checked }))} /> {t('UPI QR')}</label>
          </div>
        )}
        {err('mode') && <p className="mt-2 text-[12.5px] text-clay-600" role="alert">{err('mode')}</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('Razorpay')} subtitle={t('Online payments confirmed by the gateway')} icon={CreditCard} />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {rzp.source === 'development' && <Notice tone="gold" className="mt-3">{t('Development gateway: no keys needed and no real money moves. Production uses Razorpay.')}</Notice>}
        {rzp.source === 'environment' && <Notice tone="blue" className="mt-3">{t('The Razorpay keys are managed in the server’s environment settings and cannot be changed here.')}</Notice>}
        {rzp.source === 'settings' && (
          <div className="mt-3 space-y-3">
            {!rzp.canStoreSecrets && <Notice tone="red">{t('The server cannot store payment secrets yet: SETTINGS_ENCRYPTION_KEYS must be set by whoever runs the server.')}</Notice>}
            <Segmented label={t('Environment')} value={draft.rzpMode} onChange={(v) => setDraft((d) => ({ ...d, rzpMode: v }))} options={[{ value: 'TEST', label: t('Test mode') }, { value: 'LIVE', label: t('Live mode') }]} />
            <div className="grid gap-3 md:grid-cols-3">
              <Input label={t('Key ID')} placeholder={rzp.keyId || 'rzp_test_…'} value={secrets.keyId} onChange={(e) => setSecrets((x) => ({ ...x, keyId: e.target.value }))} autoComplete="off" spellCheck={false} error={err('razorpay.keyId')} hint={rzp.keyId ? t('Saved. Type a new one to replace it.') : undefined} />
              <Input label={t('Key Secret')} type="password" autoComplete="new-password" placeholder={rzp.keySecretSet ? '••••••••' : ''} value={secrets.keySecret} onChange={(e) => setSecrets((x) => ({ ...x, keySecret: e.target.value }))} hint={rzp.keySecretSet ? t('Saved (never shown). Type to replace.') : t('From Razorpay Dashboard → API Keys.')} />
              <Input label={t('Webhook secret')} type="password" autoComplete="new-password" placeholder={rzp.webhookSecretSet ? '••••••••' : ''} value={secrets.webhookSecret} onChange={(e) => setSecrets((x) => ({ ...x, webhookSecret: e.target.value }))} hint={rzp.webhookSecretSet ? t('Saved (never shown). Type to replace.') : t('The secret you choose when adding the webhook.')} />
            </div>
          </div>
        )}
        {rzp.source !== 'development' && (
          <div className="mt-3 rounded-xl bg-ivory-50 px-3 py-2 text-[12.5px]">
            <p className="font-semibold text-ink-soft">{t('Webhook URL to add in Razorpay (events: payment.captured, order.paid, payment.failed, refund.processed):')}</p>
            <p className="mt-1 flex items-center gap-2 break-all font-mono">{rzp.webhookUrl}<button type="button" aria-label={t('Copy webhook URL')} onClick={() => copy(rzp.webhookUrl)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary-700 hover:bg-primary-50"><Copy size={15} /></button></p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px] text-ink-muted">
          {rzp.source === 'settings' && <Button variant="secondary" icon={KeyRound} onClick={validate} loading={busy === 'validate'}>{t('Save keys & validate')}</Button>}
          {rzp.validatedAt && <span>{t('Keys validated')} {fmtDate(String(rzp.validatedAt).slice(0, 10))}</span>}
          {rzp.webhookVerifiedAt && <span>· {t('Webhook verified')} {fmtDate(String(rzp.webhookVerifiedAt).slice(0, 10))}</span>}
        </div>
        <Ready ready={rzp.ready} problems={rzp.problems} enabled={rzp.enabled} />
        {err('razorpay.enabled') && <p className="mt-2 text-[12.5px] text-clay-600" role="alert">{err('razorpay.enabled')}</p>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('Bank transfer')} subtitle={t('Shown only to guardians paying a fee')} icon={Landmark} />
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input label={t('Account holder name')} value={draft.bank.accountName ?? ''} onChange={(e) => setBank('accountName', e.target.value)} />
            <Input label={t('Bank name')} value={draft.bank.bankName ?? ''} onChange={(e) => setBank('bankName', e.target.value)} />
            <Input label={t('Account number')} inputMode="numeric" value={draft.bank.accountNumber ?? ''} onChange={(e) => setBank('accountNumber', e.target.value)} error={err('bank.accountNumber')} />
            <Input label={t('IFSC code')} value={draft.bank.ifsc ?? ''} onChange={(e) => setBank('ifsc', e.target.value.toUpperCase())} error={err('bank.ifsc')} />
            <Input label={t('Branch (optional)')} value={draft.bank.branch ?? ''} onChange={(e) => setBank('branch', e.target.value)} />
            <Select label={t('Account type (optional)')} value={draft.bank.accountType ?? ''} onChange={(e) => setBank('accountType', e.target.value)} placeholder={t('Not shown')} options={[{ value: 'Savings', label: t('Savings') }, { value: 'Current', label: t('Current') }]} />
          </div>
          <div className="mt-3 space-y-3">
            <Textarea label={t('Payment instructions (optional)')} rows={2} maxLength={600} value={draft.bank.instructions ?? ''} onChange={(e) => setBank('instructions', e.target.value)} />
            <Input label={t('Reference instructions (optional)')} placeholder={t('e.g. Write the admission number in the remarks')} value={draft.bank.referenceHint ?? ''} onChange={(e) => setBank('referenceHint', e.target.value)} />
            <label className="flex min-h-[44px] items-center gap-2 text-[14px]"><input type="checkbox" className="h-5 w-5 accent-primary-700" checked={!!draft.bank.proofRequired} onChange={(e) => setBank('proofRequired', e.target.checked)} /> {t('Require a payment confirmation (screenshot or PDF)')}</label>
          </div>
          <Ready ready={s.bank.ready} problems={s.bank.problems} enabled={s.bank.enabled} />
          {err('bank.enabled') && <p className="mt-2 text-[12.5px] text-clay-600" role="alert">{err('bank.enabled')}</p>}
          {s.bank.ready && <div className="mt-3"><p className="label">{t('Preview (as families see it)')}</p><BankDetails bank={s.bank} /></div>}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('UPI QR')} subtitle={t('Upload the Madarsa’s own QR code from its bank or UPI app')} icon={QrCode} />
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="flex aspect-square w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-ivory-50">
              {qr ? <img src={qr} alt={t('Current UPI QR code')} className="h-full w-full object-contain" /> : <span className="px-3 text-center text-[12.5px] text-ink-muted">{t('No QR code uploaded')}</span>}
            </div>
            <div className="w-full space-y-2">
              <label className="label" htmlFor="qr-file">{s.upi.hasQr ? t('Replace QR code') : t('Upload QR code')}</label>
              <input id="qr-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy === 'qr'} onChange={(e) => { uploadQr(e.target.files?.[0]); e.target.value = '' }}
                className="block w-full text-[13px] file:me-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-sage-100 file:px-4 file:font-semibold file:text-primary-800" />
              <p className="text-[12px] text-ink-muted">{t('PNG, JPEG or WebP, up to 2 MB.')}</p>
              {s.upi.hasQr && <Button variant="danger-soft" size="sm" icon={Trash2} onClick={deleteQr} loading={busy === 'qr'}>{t('Remove QR code')}</Button>}
              {busy === 'qr' && <p className="flex items-center gap-1 text-[12.5px] text-ink-muted"><Upload size={13} /> {t('Uploading…')}</p>}
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input label={t('UPI ID (optional)')} placeholder="madarsa@sbi" value={draft.upi.upiId ?? ''} onChange={(e) => setUpi('upiId', e.target.value)} error={err('upi.upiId')} hint={t('Shown under the QR and used for the “Open UPI app” link on phones.')} />
            <Input label={t('Payee name (optional)')} value={draft.upi.payeeName ?? ''} onChange={(e) => setUpi('payeeName', e.target.value)} />
          </div>
          <div className="mt-3 space-y-3">
            <Textarea label={t('Payment instructions (optional)')} rows={2} maxLength={600} value={draft.upi.instructions ?? ''} onChange={(e) => setUpi('instructions', e.target.value)} />
            <label className="flex min-h-[44px] items-center gap-2 text-[14px]"><input type="checkbox" className="h-5 w-5 accent-primary-700" checked={!!draft.upi.proofRequired} onChange={(e) => setUpi('proofRequired', e.target.checked)} /> {t('Require a payment confirmation (screenshot or PDF)')}</label>
          </div>
          <Ready ready={s.upi.ready} problems={s.upi.problems} enabled={s.upi.enabled} />
          {err('upi.enabled') && <p className="mt-2 text-[12.5px] text-clay-600" role="alert">{err('upi.enabled')}</p>}
          </div>
        </Card>
      </div>

      <Notice tone="gold" icon={AlertTriangle}>{t('A screenshot or UTR from a family is not proof that money arrived. Bank transfer and UPI payments change a balance only after staff check the Madarsa’s bank account and approve them in Payment Verification.')}</Notice>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+72px)] z-10 flex justify-end lg:bottom-4">
        <Button icon={Save} size="lg" onClick={save} loading={busy === 'save'} className="shadow-lift">{t('Save payment settings')}</Button>
      </div>
      {dialog}
    </div>
  )
}
