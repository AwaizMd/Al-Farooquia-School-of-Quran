import { t } from "../../i18n/I18nProvider"
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Receipt, Printer, CheckCircle2, ShieldAlert, Smartphone, CreditCard, Landmark, Loader2, Wallet } from 'lucide-react'
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
    const r = m.get(p.receiptNo) || { receiptNo: p.receiptNo, date: p.date, method: p.method, studentId: p.studentId, recordedBy: p.recordedBy, amount: 0, lines: [] }
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
  const simulated = receipt.method.includes('Demo')
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
          {simulated && <span className="chip bg-gold-50 text-gold-700 ring-1 ring-gold-200">{t("Demo")}</span>}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[13px]">
          <dt className="text-ink-muted">{t("Student")}</dt><dd className="text-end font-semibold">{st?.name} ({st?.id})</dd>
          <dt className="text-ink-muted">{t("Date")}</dt><dd className="text-end font-semibold">{fmtDate(receipt.date)}</dd>
          <dt className="text-ink-muted">{t("Method")}</dt><dd className="text-end font-semibold">{receipt.method}</dd>
          <dt className="text-ink-muted">{t("Recorded by")}</dt><dd className="text-end font-semibold">{receipt.recordedBy}</dd>
        </dl>
        <table className="mt-3 w-full text-[13px]">
          <thead><tr className="border-y border-line text-start text-[11.5px] uppercase tracking-wide text-ink-muted"><th className="py-1.5 font-semibold">{t("Period")}</th><th className="py-1.5 text-end font-semibold">{t("Amount")}</th></tr></thead>
          <tbody>
            {receipt.lines.map((l) => <tr key={l.id}><td className="py-1.5">{inv[l.invoiceId] ? fmtMonth(inv[l.invoiceId].period) : l.invoiceId}</td><td className="py-1.5 text-end tabular">{money(l.amount, cur)}</td></tr>)}
          </tbody>
          <tfoot><tr className="border-t border-line font-bold"><td className="py-2">{t("Total received")}</td><td className="py-2 text-end tabular text-primary-700">{money(receipt.amount, cur)}</td></tr></tfoot>
        </table>
        <p className="mt-3 text-[11.5px] text-ink-muted">{simulated ? 'Demonstration receipt generated by a simulated checkout. No money was transferred.' : 'Demo record. This receipt is generated from sample data in this prototype.'}</p>
      </div>
    </Modal>
  )
}

// Admin: record a cash/UPI/bank payment against a student's open invoices.
export function RecordPaymentModal({ open, onClose, studentId: initialStudent, onDone }) {
  const { state, idx, dispatch, receiptNo } = useStore()
  const toast = useToast()
  const cur = state.settings.currency
  const [studentId, setStudentId] = useState(initialStudent || '')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setStudentId(initialStudent || ''); setAmount(''); setNote(''); setError('') } }, [open, initialStudent])

  const fees = studentId ? studentFees(state, idx, studentId) : null
  const withDues = useMemo(() => state.students.filter((s) => studentFees(state, idx, s.id).balance > 0), [state, idx])

  const submit = () => {
    const n = Number(amount)
    if (!studentId) return setError('Choose a student.')
    if (!Number.isFinite(n) || n <= 0) return setError('Enter an amount greater than zero.')
    if (n > fees.balance) return setError(`Amount cannot exceed the outstanding balance of ${money(fees.balance, cur)}.`)
    const no = receiptNo()
    dispatch({ type: 'RECORD_PAYMENT', studentId, amount: Math.round(n), method, note, receiptNo: no })
    toast('Payment recorded', { description: `${money(n, cur)} · receipt ${no}` })
    onDone?.(no)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Record fee payment")} subtitle={t("Allocated to the oldest unpaid invoices first")}
      footer={<><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button icon={CheckCircle2} onClick={submit}>{t("Save payment")}</Button></>}>
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
        <Select label={t("Payment method")} value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHODS.filter((m) => !m.includes('Demo'))} />
        <Textarea label={t("Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid by uncle at office" className="[&_textarea]:min-h-[64px]" />
        {error && <p className="rounded-xl bg-clay-50 px-3 py-2 text-[13px] font-medium text-clay-700" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}

// Parent: demonstration checkout. Collects no card or bank details.
export function CheckoutModal({ open, onClose, student, onDone }) {
  const { state, idx, dispatch, receiptNo } = useStore()
  const cur = state.settings.currency
  const fees = student ? studentFees(state, idx, student.id) : null
  const [selected, setSelected] = useState([])
  const [method, setMethod] = useState('upi')
  const [step, setStep] = useState('select')
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    if (open && fees) { setSelected(fees.open.map((i) => i.id)); setStep('select'); setReceipt(null); setMethod('upi') }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!student || !fees) return null
  const total = fees.open.filter((i) => selected.includes(i.id)).reduce((a, i) => a + i.balance, 0)
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const METHODS = [
    { value: 'upi', label: 'UPI / Wallet', icon: Smartphone },
    { value: 'card', label: 'Card', icon: CreditCard },
    { value: 'bank', label: 'Net banking', icon: Landmark },
  ]

  const pay = () => {
    setStep('processing')
    setTimeout(() => {
      const no = receiptNo()
      dispatch({ type: 'RECORD_PAYMENT', studentId: student.id, amount: total, invoiceIds: selected, method: 'Online (Demo)', receiptNo: no, simulated: true })
      setReceipt({ no, total })
      setStep('done')
      onDone?.(no)
    }, 1400)
  }

  return (
    <Modal open={open} onClose={step === 'processing' ? undefined : onClose} title={t("Pay fees")} subtitle={t('{name} · demonstration checkout', { name: student.name })}
      footer={step === 'select' ? (
        <><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button onClick={() => setStep('confirm')} disabled={!total}>Continue · {money(total, cur)}</Button></>
      ) : step === 'confirm' ? (
        <><Button variant="secondary" onClick={() => setStep('select')}>{t("Back")}</Button><Button variant="gold" icon={CheckCircle2} onClick={pay}>{t("Confirm demo payment")}</Button></>
      ) : step === 'done' ? <Button onClick={onClose}>{t("Done")}</Button> : null}>
      <Notice tone="gold" icon={ShieldAlert} className="mb-4">
        <b>{t("Demonstration only.")}</b> {t('No real payment is processed and no card, UPI or bank details are requested. A real gateway would be integrated in a later phase.')}
      </Notice>
      <AnimatePresence mode="wait">
        {step === 'select' && (
          <motion.div key="s" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <p className="label">{t("Choose invoices to pay")}</p>
            <ul className="space-y-2">
              {fees.open.map((i) => (
                <li key={i.id}>
                  <label className={cx('flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition', selected.includes(i.id) ? 'border-primary-500 bg-primary-50/60' : 'border-line')}>
                    <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} className="h-5 w-5 accent-primary-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold text-forest">{fmtMonth(i.period)}</span>
                      <span className="block text-[12px] text-ink-muted">{t("Due")} {fmtDate(i.dueDate)}{i.paid ? ` · ${money(i.paid, cur)} already paid` : ''}</span>
                    </span>
                    <span className="text-end"><span className="block font-bold tabular">{money(i.balance, cur)}</span><FeeBadge status={i.status} /></span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="label mt-4">{t("Payment method (simulated)")}</p>
            <Segmented value={method} onChange={setMethod} options={METHODS} label={t("Payment method")} />
          </motion.div>
        )}
        {step === 'confirm' && (
          <motion.div key="c" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
            <div className="rounded-2xl border border-line p-4">
              <p className="text-[13px] text-ink-muted">{t("You are about to simulate a payment of")}</p>
              <p className="mt-1 text-[28px] font-extrabold text-forest tabular">{money(total, cur)}</p>
              <p className="text-[13px] text-ink-muted">{t("for")} {selected.length} {t("invoice")}{selected.length > 1 ? 's' : ''} {t("via")} {METHODS.find((m) => m.value === method).label} {t("(demo).")}</p>
            </div>
            <p className="text-[12.5px] text-ink-muted">{t("In production, this step would hand over to a licensed payment gateway. Here, confirming only updates the sample records in your browser.")}</p>
          </motion.div>
        )}
        {step === 'processing' && (
          <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-10 text-center">
            <Loader2 size={36} className="animate-spin text-primary-600" />
            <p className="mt-3 font-bold text-forest">{t("Simulating payment…")}</p>
            <p className="text-[13px] text-ink-muted">{t("No data is leaving this device.")}</p>
          </motion.div>
        )}
        {step === 'done' && receipt && (
          <motion.div key="d" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-600"><CheckCircle2 size={34} /></span>
            <p className="mt-3 text-[18px] font-extrabold text-forest">{t("Demo payment recorded")}</p>
            <p className="text-[13.5px] text-ink-muted">{money(receipt.total, cur)} · Receipt {receipt.no}</p>
            <p className="mt-3 max-w-xs text-[12.5px] text-ink-muted">{t("The outstanding balance, payment history, admin fee reports and reminders have all been updated.")}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
