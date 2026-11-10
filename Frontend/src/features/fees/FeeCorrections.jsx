import { t } from "../../i18n/I18nProvider"
import { useCallback, useEffect, useState } from 'react'
import { Ban, FilePlus2, RotateCcw, Scissors, ShieldCheck } from 'lucide-react'
import { get, post } from '../../api/client'
import { toMinor } from '../../api/payments'
import { money } from '../../utils/format'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Notice, Segmented, Textarea } from '../../components/ui'
import { fmtDate, fmtMonth, monthKey } from '../../utils/date'

// Waivers, voids and refunds of one student. Every figure comes from the server in minor
// units and the server re-checks each limit; the checks here only give a quicker message.

const rupees = (minor, cur) => money(minor / 100, cur)
const MIN_REASON = 5

export function FeeCorrections({ admissionNo }) {
  const auth = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [action, setAction] = useState(null)
  const load = useCallback(() => get(`/fees/students/${encodeURIComponent(admissionNo)}`).then(setData, (err) => setError(err.message)), [admissionNo])
  useEffect(() => { load() }, [load])
  if (error) return <Notice tone="red">{error}</Notice>
  if (!data) return null
  const canAdjust = auth.can('fees.adjust')
  const canRefund = auth.can('fees.refund')
  const cur = data.currency
  return (
    <Card>
      <CardHeader icon={ShieldCheck} title={t("Corrections and refunds")} subtitle={t("Nothing is erased: each change is kept with its reason and the name of who made it.")} />
      <div className="mt-3 border-t border-line">
        <h3 className="px-4 pt-3 text-[13px] font-bold text-forest sm:px-5">{t("Invoices")}</h3>
        {data.invoices.length ? (
          <ul className="divide-y divide-line">
            {data.invoices.map((i) => (
              <li key={i.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[180px] flex-1">
                    <p className="text-[14px] font-bold text-forest">{fmtMonth(i.period)} {i.status === 'VOID' && <Badge tone="neutral">{t("Void")}</Badge>}</p>
                    <p className="break-all text-[12px] text-ink-muted">{i.number}</p>
                  </div>
                  <p className="text-[12.5px] tabular text-ink-soft">{t("Billed")} {rupees(i.amountMinor, cur)} · {t("Paid")} {rupees(i.paidMinor, cur)} · <b className="text-forest">{t("Balance")} {rupees(i.balanceMinor, cur)}</b></p>
                  {canAdjust && i.balanceMinor > 0 && i.status !== 'VOID' && <Button size="sm" variant="soft" icon={Scissors} onClick={() => setAction({ type: 'adjust', invoice: i })}>{t("Waive or correct")}</Button>}
                  {canAdjust && i.voidable && <Button size="sm" variant="danger-soft" icon={Ban} onClick={() => setAction({ type: 'void', invoice: i })}>{t("Void")}</Button>}
                </div>
                {i.adjustments.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-ink-soft">
                    {i.adjustments.map((a, n) => <li key={n}>{a.kind === 'WAIVER' ? t("Waiver") : t("Correction")} {rupees(a.amountMinor, cur)} · {fmtDate(a.createdAt.slice(0, 10))} · {a.reason}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : <EmptyState title={t("No invoices")} />}
      </div>
      <div className="border-t border-line">
        <h3 className="px-4 pt-3 text-[13px] font-bold text-forest sm:px-5">{t("Payments")}</h3>
        {data.payments.length ? (
          <ul className="divide-y divide-line">
            {data.payments.map((p) => (
              <li key={p.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[180px] flex-1">
                    <p className="text-[14px] font-bold text-forest">{rupees(p.amountMinor, cur)}</p>
                    <p className="break-all text-[12px] text-ink-muted">{p.receiptNo} · {fmtDate(p.receivedOn)}</p>
                  </div>
                  {p.refundableMinor < p.amountMinor && <p className="text-[12.5px] tabular text-ink-soft">{t("Left to refund")} {rupees(p.refundableMinor, cur)}</p>}
                  {canRefund && p.refundableMinor > 0 && <Button size="sm" variant="soft" icon={RotateCcw} onClick={() => setAction({ type: 'refund', payment: p })}>{t("Refund")}</Button>}
                </div>
                {p.refunds.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-ink-soft">
                    {p.refunds.map((r) => <li key={r.id}>{t("Refund")} {rupees(r.amountMinor, cur)} · {fmtDate(String(r.createdAt).slice(0, 10))} · {r.reason}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : <EmptyState title={t("No payments yet")} />}
      </div>
      <CorrectionModal action={action} currency={cur} onClose={() => setAction(null)} onDone={load} />
    </Card>
  )
}

function CorrectionModal({ action, currency, onClose, onDone }) {
  const { refreshFees } = useAuth()
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState('WAIVER')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (action) { setAmount(''); setKind('WAIVER'); setReason(''); setError('') } }, [action])
  if (!action) return dialog

  const limit = action.type === 'adjust' ? action.invoice.balanceMinor : action.type === 'refund' ? action.payment.refundableMinor : null
  const title = { adjust: t("Waive or correct an amount"), void: t("Void this invoice"), refund: t("Refund a payment") }[action.type]
  const subtitle = action.invoice ? `${fmtMonth(action.invoice.period)} · ${action.invoice.number}` : `${action.payment.receiptNo} · ${fmtDate(action.payment.receivedOn)}`

  const submit = async () => {
    const minor = limit === null ? null : toMinor(amount)
    if (limit !== null && !minor) return setError(t("Enter an amount greater than zero, with at most two decimal places."))
    if (limit !== null && minor > limit) return setError(t("The amount cannot be more than {max}.", { max: rupees(limit, currency) }))
    if (reason.trim().length < MIN_REASON) return setError(t("Give a reason of at least {n} characters.", { n: MIN_REASON }))
    setBusy(true)
    setError('')
    try {
      await run(() => {
        if (action.type === 'adjust') return post(`/fees/invoices/${action.invoice.id}/adjustments`, { amountMinor: minor, kind, reason: reason.trim() })
        if (action.type === 'void') return post(`/fees/invoices/${action.invoice.id}/void`, { reason: reason.trim() })
        return post(`/fees/payments/${action.payment.id}/refunds`, { amountMinor: minor, reason: reason.trim() })
      })
      await Promise.all([onDone(), refreshFees()])
      toast({ adjust: t("Adjustment saved"), void: t("Invoice voided"), refund: t("Refund recorded") }[action.type])
      onClose()
    } catch (err) {
      if (err.code !== 'CANCELLED') setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal open onClose={onClose} title={title} subtitle={subtitle}
        footer={<><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button variant={action.type === 'void' ? 'danger' : 'primary'} onClick={submit} loading={busy}>{action.type === 'void' ? t("Void invoice") : action.type === 'refund' ? t("Record refund") : t("Save adjustment")}</Button></>}>
        <div className="space-y-3.5">
          {action.type === 'void' && <Notice tone="gold">{t("The invoice stays on record marked void and no longer counts towards the balance. This cannot be undone.")}</Notice>}
          {action.type === 'refund' && <Notice tone="gold">{t("This records money already handed back by cash, cheque or bank transfer. The app does not send any money. Refunded amounts become due again on the invoice.")}</Notice>}
          {action.type === 'adjust' && <Segmented label={t("Type")} value={kind} onChange={setKind} options={[{ value: 'WAIVER', label: t("Waiver") }, { value: 'CORRECTION', label: t("Correction") }]} />}
          {limit !== null && <Input label={t("Amount")} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint={t("Up to {max}", { max: rupees(limit, currency) })} autoFocus />}
          <Textarea label={t("Reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} hint={t("Kept permanently in the audit log.")} />
          {error && <Notice tone="red">{error}</Notice>}
        </div>
      </Modal>
      {dialog}
    </>
  )
}

export function IssueInvoicesModal({ open, onClose }) {
  const { today } = useStore()
  const { refreshFees } = useAuth()
  const toast = useToast()
  const [period, setPeriod] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setPeriod(monthKey(today)); setError('') } }, [open, today])

  const submit = async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return setError(t("Choose a month."))
    setBusy(true)
    setError('')
    try {
      const r = await post('/fees/invoices/issue', { period })
      await refreshFees()
      toast(r.created ? t("{n} invoices issued", { n: r.created }) : t("No new invoices"), { description: t("{n} students checked for {month}. Students already billed are skipped.", { n: r.considered, month: fmtMonth(period) }) })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Issue invoices")} subtitle={t("For every active student with a fee plan")} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button icon={FilePlus2} onClick={submit} loading={busy}>{t("Issue invoices")}</Button></>}>
      <div className="space-y-3.5">
        <Input label={t("Month")} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} hint={t("Safe to repeat: nobody is billed twice for the same month.")} />
        {error && <Notice tone="red">{error}</Notice>}
      </div>
    </Modal>
  )
}
