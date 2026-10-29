import { t } from "../../i18n/I18nProvider"
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { get, post } from '../../api/client'
import { paymentOptions } from '../../api/payments'
import { BankDetails, ManualPaymentForm, MethodCards, NoMethodsNotice, UpiPanel } from './PaymentMethods'
import { METHOD_CODE } from '../../api/people'
import { motion, AnimatePresence } from 'framer-motion'
import { Receipt, Printer, CheckCircle2, ShieldAlert, Loader2, Wallet, Clock } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { Modal, Button, Input, Select, Textarea, Notice, EmptyState, Logo, Segmented, cx } from '../../components/ui'
import { FeeBadge } from '../../components/cards/StatusBadges'
import { studentFees } from '../../services/selectors'
import { money } from '../../utils/format'
import { fmtDate, fmtMonth } from '../../utils/date'
import { PAYMENT_METHODS } from '../../constants/labels'

export function FeeSummary({ fees, currency, compact }) {
  const items = [
    ['Total billed', money(fees.total, currency), 'text-forest'],
    ['Paid', money(fees.paid, currency), 'text-primary-700'],
    ['Outstanding', money(fees.balance, currency), fees.balance ? 'text-clay-600' : 'text-primary-700'],
  ]
  return (
    <div className={cx('grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-white', compact && 'text-center')}>
      {items.map(([k, v, c]) => (
        <div key={k} className="px-3 py-3 sm:px-4">
          <p className="text-[11.5px] font-semibold text-ink-muted">{t(k)}</p>
          <p className={cx('mt-0.5 text-[16px] font-extrabold tabular sm:text-[18px]', c)}>{v}</p>
        </div>
      ))}
    </div>
  )
}

export function InvoiceList({ invoices, currency }) {
  if (!invoices.length) return <EmptyState icon={Wallet} title={t("No invoices")}>{t("No fee invoices for this student.")}</EmptyState>
  return (
    <ul className="divide-y divide-line">
      {invoices.map((i) => (
        <li key={i.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-forest">{fmtMonth(i.period)}</p>
            <p className="text-[12px] text-ink-muted">{t("Due")} {fmtDate(i.dueDate)}{i.discount ? ` · concession ${money(i.discount, currency)}` : ''}</p>
          </div>
          <div className="text-end">
            <p className="text-[14px] font-bold tabular text-forest">{money(i.amount, currency)}</p>
            {i.balance > 0 && i.paid > 0 && <p className="text-[11.5px] text-ink-muted">{money(i.balance, currency)} {t("left")}</p>}
          </div>
          <FeeBadge status={i.status} />
        </li>
      ))}
    </ul>
  )
}

export function PaymentHistory({ payments, currency, onReceipt }) {
  const receipts = groupReceipts(payments)
  if (!receipts.length) return <EmptyState icon={Receipt} title={t("No payments yet")}>{t("Payments will appear here with their receipts.")}</EmptyState>
  return (
    <ul className="divide-y divide-line">
      {receipts.map((r) => (
        <li key={r.receiptNo}>
          <button type="button" onClick={() => onReceipt?.(r)} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-start hover:bg-ivory-50 sm:px-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><Receipt size={17} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-forest">{money(r.amount, currency)}</span>
              <span className="block truncate text-[12px] text-ink-muted">{fmtDate(r.date)} · {t(r.method)} · {r.receiptNo}</span>
            </span>
            <span className="text-[12.5px] font-semibold text-primary-700">{t("Receipt")}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function groupReceipts(payments) {
  const m = new Map()
  for (const p of payments) {
    const r = m.get(p.receiptNo) || { receiptNo: p.receiptNo, date: p.date, method: p.method, studentId: p.studentId, recordedBy: p.recordedBy, reference: p.reference, source: p.source, amount: 0, lines: [] }
    r.amount += p.amount
    r.lines.push(p)
    m.set(p.receiptNo, r)
  }
  return [...m.values()].sort((a, b) => b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo))
}

export function ReceiptModal({ receipt, onClose }) {
  const { state, idx } = useStore()
  if (!receipt) return null
  const st = idx.students[receipt.studentId]
  const cur = state.settings.currency
  const inv = Object.fromEntries(state.invoices.map((i) => [i.id, i]))
  return (
    <Modal open={!!receipt} onClose={onClose} title={t("Payment receipt")} subtitle={receipt.receiptNo}
      footer={<><Button variant="secondary" onClick={onClose}>{t("Close")}</Button><Button icon={Printer} onClick={() => window.print()}>{t("Print receipt")}</Button></>}>
      <div className="print-area pattern-stars rounded-2xl border border-line p-4">
        <div className="flex items-center gap-3 border-b border-line pb-3">
          <Logo size={38} />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-forest">{state.settings.brandName}</p>
            <p className="text-[12px] text-ink-muted">{state.settings.address}</p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[13px]">
          <dt className="text-ink-muted">{t("Student")}</dt><dd className="text-end font-semibold">{st?.name} ({st?.id})</dd>
          <dt className="text-ink-muted">{t("Date")}</dt><dd className="text-end font-semibold">{fmtDate(receipt.date)}</dd>
          <dt className="text-ink-muted">{t("Method")}</dt><dd className="text-end font-semibold">{receipt.method}</dd>
          {receipt.reference && <><dt className="text-ink-muted">{t("Reference")}</dt><dd className="break-all text-end font-mono font-semibold">{receipt.reference}</dd></>}
          <dt className="text-ink-muted">{t("Recorded by")}</dt><dd className="text-end font-semibold">{receipt.source === 'VERIFIED' ? `${receipt.recordedBy} ${t('(verified)')}` : receipt.recordedBy}</dd>
        </dl>
        <table className="mt-3 w-full text-[13px]">
          <thead><tr className="border-y border-line text-start text-[11.5px] uppercase tracking-wide text-ink-muted"><th className="py-1.5 font-semibold">{t("Period")}</th><th className="py-1.5 text-end font-semibold">{t("Amount")}</th></tr></thead>
          <tbody>
            {receipt.lines.map((l) => <tr key={l.id}><td className="py-1.5">{inv[l.invoiceId] ? fmtMonth(inv[l.invoiceId].period) : l.invoiceId}</td><td className="py-1.5 text-end tabular">{money(l.amount, cur)}</td></tr>)}
          </tbody>
          <tfoot><tr className="border-t border-line font-bold"><td className="py-2">{t("Total received")}</td><td className="py-2 text-end tabular text-primary-700">{money(receipt.amount, cur)}</td></tr></tfoot>
        </table>
        <p className="mt-3 text-[11.5px] text-ink-muted">{t('Computer-generated receipt from the Madarsa’s fee records.')}</p>
      </div>
    </Modal>
  )
}

// Admin: record a cash/UPI/bank payment against a student's open invoices.
export function RecordPaymentModal({ open, onClose, studentId: initialStudent, onDone }) {
  const { state, idx } = useStore()
  const { refreshFees } = useAuth()
  const toast = useToast()
  const cur = state.settings.currency
  const [saving, setSaving] = useState(false)
  const [studentId, setStudentId] = useState(initialStudent || '')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setStudentId(initialStudent || ''); setAmount(''); setNote(''); setError('') } }, [open, initialStudent])

  const fees = studentId ? studentFees(state, idx, studentId) : null
  const withDues = useMemo(() => state.students.filter((s) => studentFees(state, idx, s.id).balance > 0), [state, idx])

  const submit = async () => {
    const n = Number(amount)
    if (!studentId) return setError('Choose a student.')
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount greater than zero.')
    if (n > fees.balance) return setError(`Amount cannot exceed the outstanding balance of ${money(fees.balance, cur)}.`)
    setSaving(true)
    try {
      const p = await post('/fees/payments', { studentId: idx.students[studentId].uuid, amountMinor: Math.round(n * 100), method: METHOD_CODE[method], ...(note.trim() ? { note: note.trim() } : {}) })
      await refreshFees()
      toast('Payment recorded', { description: `${money(n, cur)} · receipt ${p.receiptNo}` })
      onDone?.(p.receiptNo)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Record fee payment")} subtitle={t("Allocated to the oldest unpaid invoices first")}
      footer={<><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button icon={CheckCircle2} onClick={submit} loading={saving}>{t("Save payment")}</Button></>}>
      <div className="space-y-3.5">
        <Select label={t("Student")} value={studentId} onChange={(e) => { setStudentId(e.target.value); setError('') }} placeholder={t("Select a student with dues")}
          options={(initialStudent && !withDues.some((s) => s.id === initialStudent) ? [idx.students[initialStudent], ...withDues] : withDues).map((s) => ({ value: s.id, label: `${s.name} · ${s.id} · ${money(studentFees(state, idx, s.id).balance, cur)} due` }))} />
        {fees && (
          <div className="rounded-xl bg-sage-50 p-3 text-[13px]">
            <p className="font-semibold text-forest">{t("Outstanding:")} {money(fees.balance, cur)}</p>
            <ul className="mt-1 space-y-0.5 text-ink-muted">
              {fees.open.map((i) => <li key={i.id} className="flex justify-between"><span>{fmtMonth(i.period)} {i.status === 'overdue' && <span className="text-clay-600">· overdue</span>}</span><span className="tabular">{money(i.balance, cur)}</span></li>)}
            </ul>
            {fees.balance > 0 && <button type="button" className="mt-2 font-semibold text-primary-700 hover:underline" onClick={() => setAmount(String(fees.balance))}>{t("Fill full balance")}</button>}
          </div>
        )}
        <Input label={t("Amount received")} type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }} placeholder="0" />
        <Select label={t("Payment method")} value={method} onChange={(e) => setMethod(e.target.value)} options={Object.keys(METHOD_CODE)} />
        <Textarea label={t("Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid by uncle at office" className="[&_textarea]:min-h-[64px]" />
        {error && <p className="rounded-xl bg-clay-50 px-3 py-2 text-[13px] font-medium text-clay-700" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

// Parent: pay fees with the methods the Madarsa offers (online gateway, bank transfer, UPI QR).
// Collects no card or bank details; online payments are confirmed by the server, manual ones by the office.
export function CheckoutModal({ open, onClose, student, onDone, onSubmitted }) {
  const { state, idx } = useStore()
  const { refreshFees } = useAuth()
  const cur = state.settings.currency
  const fees = student ? studentFees(state, idx, student.id) : null
  const [selected, setSelected] = useState([])
  const [step, setStep] = useState('select')
  const [receipt, setReceipt] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [error, setError] = useState('')
  const [options, setOptions] = useState(undefined)
  const [method, setMethod] = useState(null)
  const [submitted, setSubmitted] = useState(null)

  useEffect(() => {
    if (!open || !student) return
    if (fees) setSelected(fees.open.map((i) => i.id))
    setStep('select'); setReceipt(null); setAttempt(null); setError(''); setSubmitted(null); setOptions(undefined); setMethod(null)
    paymentOptions(student.uuid).then((o) => {
      setOptions(o)
      setMethod(o.online ? 'online' : o.bank ? 'bank' : o.upi ? 'upi' : null)
    }, (err) => { setOptions(null); setError(err.message) })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!student || !fees) return null
  const total = fees.open.filter((i) => selected.includes(i.id)).reduce((a, i) => a + i.balance, 0)
  const totalMinor = Math.round(total * 100)
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const noMethods = options && !options.online && !options.bank && !options.upi
  const testGateway = options?.online?.provider === 'dev'

  // Start the online checkout: the server works out the amount from its own records.
  const start = async () => {
    setError('')
    try {
      setAttempt(await post('/payments/attempts', { studentId: student.uuid, invoiceIds: selected }))
      setStep('confirm')
    } catch (err) {
      setError(err.message)
    }
  }
  const next = () => (method === 'online' ? start() : setStep('manual'))

  // Wait for the server to confirm with the gateway (signed webhook or server-side payment check).
  const waitForConfirmation = async (id) => {
    for (let i = 0; i < 40; i++) {
      const a = await get(`/payments/attempts/${id}`)
      if (a.status === 'SUCCEEDED') return a
      if (a.status === 'FAILED' || a.status === 'EXPIRED') throw new Error(a.failureReason === 'declined' ? 'The payment was declined. Nothing was charged.' : 'The payment did not complete.')
      await new Promise((r) => setTimeout(r, 1500))
    }
    throw new Error('We have not received confirmation yet. If money was taken it will appear shortly; please do not pay again.')
  }

  const finish = async (a) => {
    await refreshFees()
    setReceipt({ no: a.receiptNo, total: a.amountMinor / 100 })
    setStep('done')
    onDone?.(a.receiptNo)
  }

  const pay = async () => {
    setStep('processing')
    setError('')
    try {
      if (attempt.checkout.kind === 'dev') {
        // Development gateway: the server plays the gateway and sends itself a signed confirmation.
        await post(`/payments/dev/attempts/${attempt.id}/complete`, { outcome: 'success' })
      } else if (attempt.checkout.kind === 'razorpay') {
        const r = await openRazorpay(attempt.checkout, student.name)
        // The server checks the signature and asks Razorpay itself; the browser's word is not enough.
        await post(`/payments/attempts/${attempt.id}/verify`, { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }).catch(() => {})
      }
      await finish(await waitForConfirmation(attempt.id))
    } catch (err) {
      setError(err.message)
      setStep('confirm')
    }
  }

  const manualSubmitted = (s) => {
    setSubmitted(s)
    setStep('submitted')
    onSubmitted?.(s)
  }

  return (
    <Modal open={open} onClose={step === 'processing' ? undefined : onClose} title={t('Pay fees')} subtitle={student.name}
      footer={step === 'select' ? (
        <><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button onClick={next} disabled={!total || !method}>Continue · {money(total, cur)}</Button></>
      ) : step === 'confirm' ? (
        <><Button variant="secondary" onClick={() => setStep('select')}>{t('Back')}</Button><Button variant="gold" icon={CheckCircle2} onClick={pay}>{t(attempt?.checkout.kind === 'dev' ? 'Pay (test gateway)' : 'Pay now')}</Button></>
      ) : step === 'manual' ? <Button variant="secondary" onClick={() => setStep('select')}>{t('Back')}</Button>
        : step === 'done' || step === 'submitted' ? <Button onClick={onClose}>{t('Done')}</Button> : null}>
      {noMethods && <div className="mb-4"><NoMethodsNotice /></div>}
      {testGateway && method === 'online' && step !== 'manual' && <Notice tone="gold" icon={ShieldAlert} className="mb-4"><b>{t('Test gateway.')}</b> {t('No real money moves. The payment is confirmed the same way a real gateway confirms it.')}</Notice>}
      {error && <Notice tone="red" className="mb-4">{error}</Notice>}
      <AnimatePresence mode="wait">
        {step === 'select' && (
          <motion.div key="s" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <p className="label">{t('Choose invoices to pay')}</p>
            <ul className="space-y-2">
              {fees.open.map((i) => (
                <li key={i.id}>
                  <label className={cx('flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition', selected.includes(i.id) ? 'border-primary-500 bg-primary-50/60' : 'border-line')}>
                    <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} className="h-5 w-5 accent-primary-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold text-forest">{fmtMonth(i.period)}</span>
                      <span className="block text-[12px] text-ink-muted">{t('Due')} {fmtDate(i.dueDate)}{i.paid ? ` · ${money(i.paid, cur)} already paid` : ''}</span>
                    </span>
                    <span className="text-end"><span className="block font-bold tabular">{money(i.balance, cur)}</span><FeeBadge status={i.status} /></span>
                  </label>
                </li>
              ))}
            </ul>
            {options === undefined && <p className="mt-4 flex items-center gap-2 text-[13px] text-ink-muted"><Loader2 size={15} className="animate-spin" /> {t('Loading payment options…')}</p>}
            {options && !noMethods && (
              <div className="mt-4">
                <p className="label">{t('How would you like to pay?')}</p>
                <MethodCards options={options} value={method} onChange={setMethod} />
                {method === 'online' && <p className="mt-3 text-[12.5px] text-ink-muted">{t('You choose UPI, card or net banking on the secure payment page. This app never sees your card or bank details.')}</p>}
              </div>
            )}
          </motion.div>
        )}
        {step === 'manual' && options && (
          <motion.div key="m" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
            <div className="rounded-2xl border border-line p-4">
              <p className="text-[13px] text-ink-muted">{t('Amount due for the selected invoices')}</p>
              <p className="mt-1 text-[26px] font-extrabold text-forest tabular">{money(total, cur)}</p>
            </div>
            <div>
              <p className="label">{method === 'bank' ? t('1. Transfer to this account') : t('1. Scan and pay')}</p>
              {method === 'bank' ? <BankDetails bank={options.bank} /> : <UpiPanel upi={options.upi} amountMinor={totalMinor} />}
            </div>
            <div>
              <p className="label">{t('2. Tell the office you have paid')}</p>
              <ManualPaymentForm method={method} student={student} invoiceIds={selected} maxMinor={totalMinor} currency={cur}
                proofRequired={method === 'bank' ? options.bank.proofRequired : options.upi.proofRequired} onSubmitted={manualSubmitted} />
            </div>
          </motion.div>
        )}
        {step === 'confirm' && (
          <motion.div key="c" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
            <div className="rounded-2xl border border-line p-4">
              <p className="text-[13px] text-ink-muted">{t('Amount to pay')}</p>
              <p className="mt-1 text-[28px] font-extrabold text-forest tabular">{money((attempt?.amountMinor ?? 0) / 100, cur)}</p>
              <p className="text-[13px] text-ink-muted">{t('for')} {selected.length} {t('invoice')}{selected.length > 1 ? 's' : ''} · {t('Reference')} {attempt?.reference}</p>
            </div>
            <p className="text-[12.5px] text-ink-muted">{t('Your fees are marked paid only when the payment gateway confirms the payment to the Madarsa.')}</p>
          </motion.div>
        )}
        {step === 'processing' && (
          <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-10 text-center">
            <Loader2 size={36} className="animate-spin text-primary-600" />
            <p className="mt-3 font-bold text-forest">{t('Waiting for payment confirmation…')}</p>
            <p className="text-[13px] text-ink-muted">{t('Please keep this window open.')}</p>
          </motion.div>
        )}
        {step === 'done' && receipt && (
          <motion.div key="d" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-600"><CheckCircle2 size={34} /></span>
            <p className="mt-3 text-[18px] font-extrabold text-forest">{t('Payment received')}</p>
            <p className="text-[13.5px] text-ink-muted">{money(receipt.total, cur)} · Receipt {receipt.no}</p>
            <p className="mt-3 max-w-xs text-[12.5px] text-ink-muted">{t('Confirmed by the payment gateway. Your balance and receipts are updated.')}</p>
          </motion.div>
        )}
        {step === 'submitted' && submitted && (
          <motion.div key="sub" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-50 text-gold-700"><Clock size={32} /></span>
            <p className="mt-3 text-[18px] font-extrabold text-forest">{t('Submitted for verification')}</p>
            <p className="text-[13.5px] text-ink-muted">{money(submitted.amountMinor / 100, cur)} · {t('Ref')} {submitted.reference}</p>
            <p className="mt-3 max-w-xs text-[12.5px] text-ink-muted">{t('This is not yet a receipt. The fee stays outstanding until the office confirms the money in its account; you will be notified and the receipt will appear here.')}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}

// Opens Razorpay's hosted checkout and resolves with the ids and signature it returns.
// The payment still counts only after the server verifies it with Razorpay.
function openRazorpay(checkout, name) {
  return new Promise((resolve, reject) => {
    const launch = () => {
      const rzp = new window.Razorpay({ key: checkout.keyId, order_id: checkout.orderId, amount: checkout.amount, currency: checkout.currency, name, description: checkout.description, handler: (response) => resolve(response), modal: { ondismiss: () => reject(new Error('Payment was cancelled.')) } })
      rzp.on('payment.failed', () => reject(new Error('The payment was declined. Nothing was charged.')))
      rzp.open()
    }
    if (window.Razorpay) return launch()
    const s = Object.assign(document.createElement('script'), { src: 'https://checkout.razorpay.com/v1/checkout.js', onload: launch, onerror: () => reject(new Error('Could not load the payment page. Check your connection.')) })
    document.body.appendChild(s)
  })
}
