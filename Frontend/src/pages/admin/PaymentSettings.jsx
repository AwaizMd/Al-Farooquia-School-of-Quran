import { t } from '../../i18n/I18nProvider'
import { useEffect, useState } from 'react'
import { Landmark, QrCode, CheckCircle2, AlertTriangle, ShieldCheck, Trash2, Upload, Save } from 'lucide-react'
import { PageHeader, Card, CardHeader, Button, Input, Select, Textarea, Notice, Badge } from '../../components/ui'
import { useToast } from '../../context/ToastContext'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { blobUrl } from '../../api/client'
import { getPaymentSettings, removeUpiQr, savePaymentSettings, uploadUpiQr } from '../../api/payments'
import { BankDetails } from '../../features/fees/PaymentMethods'

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
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState('')
  const [qr, setQr] = useState(null)

  // After saving everything: the form becomes the saved state.
  const adopt = (v) => {
    setS(v)
    setDraft({ bank: { ...v.bank }, upi: { ...v.upi }, bankOn: v.bank.enabled, upiOn: v.upi.enabled })
  }
  // After a partial action (QR upload): refresh status, keep unsaved edits.
  const refreshStatus = (v) => {
    setS(v)
    setDraft((d) => ({ ...d, upiOn: d.upiOn && v.upi.hasQr }))
  }
  useEffect(() => { getPaymentSettings().then(adopt, (e) => toast(e.message, { type: 'error' })) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let url
    if (s?.upi.hasQr) blobUrl('/payments/upi-qr').then((u) => { url = u; setQr(u) }, () => setQr(null))
    else setQr(null)
    return () => url && URL.revokeObjectURL(url)
  }, [s?.upi.hasQr, s?.updatedAt])

  if (!s || !draft) return <PageHeader title={t('Fee Payment Settings')} subtitle={t('Loading…')} />
  const setBank = (k, v) => setDraft((d) => ({ ...d, bank: { ...d.bank, [k]: v } }))
  const setUpi = (k, v) => setDraft((d) => ({ ...d, upi: { ...d.upi, [k]: v } }))

  const payload = () => ({
    bank: { enabled: draft.bankOn, accountName: draft.bank.accountName, bankName: draft.bank.bankName, accountNumber: draft.bank.accountNumber, ifsc: draft.bank.ifsc, branch: draft.bank.branch, accountType: draft.bank.accountType || null, instructions: draft.bank.instructions, referenceHint: draft.bank.referenceHint, proofRequired: !!draft.bank.proofRequired },
    upi: { enabled: draft.upiOn, upiId: draft.upi.upiId, payeeName: draft.upi.payeeName, instructions: draft.upi.instructions, proofRequired: !!draft.upi.proofRequired },
  })

  const save = async () => {
    setBusy('save')
    setErrors([])
    try {
      adopt(await run(() => savePaymentSettings(payload())))
      toast(t('Payment settings saved'), { description: t('Families now see only the methods that are switched on and ready.') })
    } catch (err) {
      if (err.code !== 'CANCELLED') { setErrors(Array.isArray(err.details) ? err.details : [{ path: '', message: err.message }]); toast(err.message, { type: 'error' }) }
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
  const err = (path) => errors.filter((e) => e.path === path).map((e) => t(e.message)).join(' ') || undefined

  return (
    <div className="space-y-4 pb-24">
      <PageHeader title={t('Fee Payment Settings')} subtitle={t('How families pay this madrasa: directly into its own bank account or by UPI. The office verifies every payment before it counts.')} />

      <Card>
        <CardHeader title={t('Payment methods offered')} subtitle={t('Only methods that are switched on and fully set up are shown to families')} icon={ShieldCheck} />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {(
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex min-h-[44px] items-center gap-2 text-[14px]"><input type="checkbox" className="h-5 w-5 accent-primary-700" checked={draft.bankOn} onChange={(e) => setDraft((d) => ({ ...d, bankOn: e.target.checked }))} /> {t('Bank transfer')}</label>
            <label className="flex min-h-[44px] items-center gap-2 text-[14px]"><input type="checkbox" className="h-5 w-5 accent-primary-700" checked={draft.upiOn} onChange={(e) => setDraft((d) => ({ ...d, upiOn: e.target.checked }))} /> {t('UPI QR')}</label>
          </div>
        )}
        {err('mode') && <p className="mt-2 text-[12.5px] text-clay-600" role="alert">{err('mode')}</p>}
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
          <CardHeader title={t('UPI QR')} subtitle={t('Upload the madrasa’s own QR code from its bank or UPI app')} icon={QrCode} />
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

      <Notice tone="gold" icon={AlertTriangle}>{t('A screenshot or UTR from a family is not proof that money arrived. Bank transfer and UPI payments change a balance only after staff check the madrasa’s bank account and approve them in Payment Verification.')}</Notice>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+72px)] z-10 flex justify-end lg:bottom-4">
        <Button icon={Save} size="lg" onClick={save} loading={busy === 'save'} className="shadow-lift">{t('Save payment settings')}</Button>
      </div>
      {dialog}
    </div>
  )
}
