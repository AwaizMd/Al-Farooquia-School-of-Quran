import { t } from '../../i18n/I18nProvider'
import { useEffect, useState } from 'react'
import { Copy, CreditCard, Landmark, QrCode, Smartphone, Upload, Clock, ShieldAlert, MessageSquareReply, RotateCcw, Receipt as ReceiptIcon } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, CardHeader, Input, Modal, Notice, Textarea, cx } from '../../components/ui'
import { MANUAL_METHOD, SUBMISSION_STATUS, listSubmissions, respondToSubmission, submitManualPayment, toMinor, upiQrUrl, uploadProof } from '../../api/payments'
import { money } from '../../utils/format'
import { fmtDate, todayISO } from '../../utils/date'

const PROOF_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp'

/** The payment methods the Madarsa offers, as radio cards. Disabled methods are never shown. */
export function MethodCards({ options, value, onChange }) {
  const cards = [
    options?.online && { value: 'online', icon: CreditCard, title: 'Pay Online', text: 'UPI, card or net banking on the secure payment page. Confirmed automatically.' },
    options?.bank && { value: 'bank', icon: Landmark, title: 'Bank Transfer', text: 'Transfer from your bank, then send us the UTR. Confirmed by the office.' },
    options?.upi && { value: 'upi', icon: QrCode, title: 'Pay Using UPI QR', text: 'Scan the Madarsa’s QR code with any UPI app, then send us the reference.' },
  ].filter(Boolean)
  return (
    <div role="radiogroup" aria-label={t('Payment method')} className="grid gap-2">
      {cards.map((c) => (
        <button key={c.value} type="button" role="radio" aria-checked={value === c.value} onClick={() => onChange(c.value)}
          className={cx('flex min-h-[44px] w-full items-start gap-3 rounded-xl border px-4 py-3 text-start transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500', value === c.value ? 'border-primary-500 bg-primary-50/60' : 'border-line hover:border-primary-200')}>
          <c.icon size={20} className="mt-0.5 shrink-0 text-primary-700" aria-hidden />
          <span>
            <span className="block text-[14px] font-bold text-forest">{t(c.title)}</span>
            <span className="block text-[12px] text-ink-muted">{t(c.text)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function CopyRow({ label, value }) {
  const toast = useToast()
  if (!value) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast(t('Copied'), { description: `${t(label)}: ${value}` })
    } catch {
      toast(t('Could not copy'), { description: t('Select the text and copy it instead.'), type: 'error' })
    }
  }
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-semibold text-ink-muted">{t(label)}</p>
        <p className="select-all break-all font-mono text-[14.5px] font-bold text-forest">{value}</p>
      </div>
      <button type="button" onClick={copy} aria-label={`${t('Copy')} ${t(label)}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary-700 hover:bg-primary-50"><Copy size={17} /></button>
    </div>
  )
}

export function BankDetails({ bank }) {
  return (
    <div className="rounded-2xl border border-line bg-ivory-50 px-4 py-2">
      <CopyRow label="Account holder" value={bank.accountName} />
      <CopyRow label="Account number" value={bank.accountNumber} />
      <CopyRow label="IFSC" value={bank.ifsc} />
      <div className="grid grid-cols-2 gap-x-3 py-1.5 text-[13px]">
        <p><span className="block text-[11.5px] font-semibold text-ink-muted">{t('Bank')}</span>{bank.bankName}{bank.branch ? `, ${bank.branch}` : ''}</p>
        {bank.accountType && <p><span className="block text-[11.5px] font-semibold text-ink-muted">{t('Account type')}</span>{t(bank.accountType)}</p>}
      </div>
      {bank.instructions && <p className="border-t border-line py-2 text-[13px] text-ink-soft">{bank.instructions}</p>}
      {bank.referenceHint && <p className="pb-2 text-[12.5px] text-ink-muted">{t('Reference:')} {bank.referenceHint}</p>}
    </div>
  )
}

const isMobile = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent))

/** The Madarsa's own QR code (never generated here) with an optional UPI app link on phones. */
export function UpiPanel({ upi, amountMinor }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let url
    upiQrUrl().then((u) => { url = u; setSrc(u) }, () => setFailed(true))
    return () => url && URL.revokeObjectURL(url)
  }, [])
  // upi://pay is a convenience only: not every UPI app honours it, so the QR stays the main way.
  const deepLink = upi.upiId && amountMinor ? `upi://pay?${new URLSearchParams({ pa: upi.upiId, ...(upi.payeeName ? { pn: upi.payeeName } : {}), am: (amountMinor / 100).toFixed(2), cu: 'INR' })}` : null
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-white px-4 py-4 text-center">
      {src ? <img src={src} alt={t('UPI QR code of the Madarsa')} className="aspect-square w-full max-w-[260px] rounded-xl border border-line object-contain" />
        : <div className="flex aspect-square w-full max-w-[260px] items-center justify-center rounded-xl border border-dashed border-line text-[13px] text-ink-muted">{failed ? t('The QR code could not be loaded.') : t('Loading QR code…')}</div>}
      <p className="mt-3 text-[13px] text-ink-soft">{t('Open any UPI app (Google Pay, PhonePe, Paytm, BHIM…), choose “Scan QR” and pay the amount below.')}</p>
      {upi.payeeName && <p className="mt-1 text-[13px]"><b>{upi.payeeName}</b></p>}
      {upi.upiId && <div className="w-full max-w-[300px]"><CopyRow label="UPI ID" value={upi.upiId} /></div>}
      {deepLink && isMobile() && <Button href={deepLink} variant="secondary" icon={Smartphone} className="mt-1">{t('Open UPI app')}</Button>}
      {upi.instructions && <p className="mt-2 text-[12.5px] text-ink-muted">{upi.instructions}</p>}
    </div>
  )
}

/**
 * Report a bank transfer / UPI payment. It is sent for verification: the fee stays
 * outstanding until the office confirms the money arrived.
 */
export function ManualPaymentForm({ method, student, invoiceIds, maxMinor, currency, proofRequired, onSubmitted, formId }) {
  const [amount, setAmount] = useState((maxMinor / 100).toFixed(2))
  const [paidOn, setPaidOn] = useState(todayISO())
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const amountMinor = toMinor(amount)
    const errs = {}
    if (!amountMinor) errs.amountMinor = t('Enter the amount you paid, e.g. 1500 or 1500.50.')
    else if (amountMinor > maxMinor) errs.amountMinor = `${t('More than the amount due')} (${money(maxMinor / 100, currency)}).`
    if (!paidOn) errs.paidOn = t('Enter the date you paid.')
    if (reference.replace(/[^A-Za-z0-9]/g, '').length < 6) errs.reference = t('Enter the UTR or transaction reference from your bank or UPI app.')
    if (proofRequired && !file) errs.proofFileId = t('Attach the payment confirmation (screenshot or PDF).')
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setError('')
    try {
      const proof = file ? await uploadProof(file) : null
      const s = await submitManualPayment({ studentId: student.uuid, method: method === 'upi' ? 'UPI' : 'BANK_TRANSFER', invoiceIds, amountMinor, paidOn, reference: reference.trim(), ...(note.trim() ? { note: note.trim() } : {}), ...(proof ? { proofFileId: proof.id } : {}) })
      onSubmitted(s)
    } catch (err) {
      setErrors(err.fieldErrors ?? {})
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form id={formId} onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={t('Amount paid (₹)')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amountMinor} required />
        <Input label={t('Date paid')} type="date" max={todayISO()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} error={errors.paidOn} required />
      </div>
      <Input label={method === 'upi' ? t('UPI transaction ID / UTR') : t('UTR / transaction reference')} hint={t('Shown in your bank or UPI app after paying (usually 12–22 letters and digits).')} autoComplete="off" spellCheck={false}
        value={reference} onChange={(e) => setReference(e.target.value)} error={errors.reference} required />
      <Textarea label={t('Note (optional)')} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <div>
        <label htmlFor="proof-file" className="label">{proofRequired ? t('Payment confirmation') : t('Payment confirmation (optional)')}</label>
        <input id="proof-file" type="file" accept={PROOF_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-[13px] file:me-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-sage-100 file:px-4 file:font-semibold file:text-primary-800" aria-describedby="proof-hint" />
        <p id="proof-hint" className="mt-1 text-[12px] text-ink-muted">{t('Screenshot or PDF, up to 5 MB.')}</p>
        {errors.proofFileId && <p className="mt-1 text-[12.5px] text-clay-600" role="alert">{errors.proofFileId}</p>}
      </div>
      <Notice tone="gold" icon={Clock}>{t('Your fee stays outstanding until the Madarsa office checks its bank account and approves this payment. You will be notified.')}</Notice>
      {error && <Notice tone="red">{error}</Notice>}
      <Button type="submit" className="w-full" icon={Upload} loading={busy}>{t('Submit for verification')}</Button>
    </form>
  )
}

const StatusBadge = ({ status }) => <Badge tone={SUBMISSION_STATUS[status].tone}>{t(SUBMISSION_STATUS[status].label)}</Badge>

/** A family's reported bank/UPI payments for one child, with what happened to each. */
export function SubmissionsCard({ student, currency, onResubmit, refreshKey }) {
  const [items, setItems] = useState(null)
  const [reply, setReply] = useState(null)
  const load = () => listSubmissions({ studentId: student.uuid }).then((r) => setItems(r.items), () => setItems([]))
  useEffect(() => { load() }, [student.uuid, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!items) return null
  if (!items.length) return null
  return (
    <Card>
      <CardHeader title={t('Bank transfer & UPI payments')} subtitle={t('Payments you reported, and their verification')} />
      <ul className="mt-2 divide-y divide-line">
        {items.map((s) => (
          <li key={s.id} className="px-4 py-3 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-forest">{money(s.amountMinor / 100, currency)} · {t(MANUAL_METHOD[s.method])}</p>
                <p className="text-[12px] text-ink-muted">{t('Paid')} {fmtDate(s.paidOn)} · {t('Ref')} <span className="font-mono">{s.reference}</span></p>
                {s.status === 'PENDING_VERIFICATION' && <p className="mt-1 text-[12.5px] text-ink-muted">{t('Waiting for the office to confirm the money arrived. The fee is still shown as outstanding until then.')}</p>}
                {s.status === 'APPROVED' && s.payment && <p className="mt-1 text-[12.5px] text-primary-700"><ReceiptIcon size={13} className="me-1 inline" />{t('Receipt')} {s.payment.receiptNo}</p>}
                {(s.status === 'REJECTED' || s.status === 'NEEDS_INFO') && s.reviewNote && <p className="mt-1 rounded-lg bg-ivory-100 px-2.5 py-1.5 text-[12.5px] text-ink-soft">{t('Office:')} {s.reviewNote}</p>}
              </div>
              <StatusBadge status={s.status} />
            </div>
            {s.status === 'NEEDS_INFO' && <Button size="sm" variant="secondary" icon={MessageSquareReply} className="mt-2" onClick={() => setReply(s)}>{t('Reply')}</Button>}
            {s.status === 'REJECTED' && onResubmit && <Button size="sm" variant="secondary" icon={RotateCcw} className="mt-2" onClick={onResubmit}>{t('Submit again')}</Button>}
          </li>
        ))}
      </ul>
      <ReplyModal submission={reply} onClose={() => setReply(null)} onDone={() => { setReply(null); load() }} />
    </Card>
  )
}

function ReplyModal({ submission, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setNote(''); setFile(null); setError('') }, [submission])
  if (!submission) return null
  const send = async () => {
    if (!note.trim() && !file) return setError(t('Write a reply or attach a file.'))
    setBusy(true)
    try {
      const proof = file ? await uploadProof(file) : null
      await respondToSubmission(submission.id, { ...(note.trim() ? { note: note.trim() } : {}), ...(proof ? { proofFileId: proof.id } : {}) })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={t('Reply to the office')} subtitle={submission.reviewNote}
      footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button onClick={send} loading={busy}>{t('Send')}</Button></>}>
      <div className="space-y-3">
        <Textarea label={t('Your reply')} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        {!submission.proof && (
          <div>
            <label htmlFor="reply-proof" className="label">{t('Payment confirmation (optional)')}</label>
            <input id="reply-proof" type="file" accept={PROOF_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-[13px] file:me-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-sage-100 file:px-4 file:font-semibold file:text-primary-800" />
          </div>
        )}
        {error && <Notice tone="red">{error}</Notice>}
      </div>
    </Modal>
  )
}

export function NoMethodsNotice() {
  return <Notice tone="gold" icon={ShieldAlert}>{t('The Madarsa has not set up a way to pay fees online yet. Please contact the Madarsa office to pay.')}</Notice>
}

