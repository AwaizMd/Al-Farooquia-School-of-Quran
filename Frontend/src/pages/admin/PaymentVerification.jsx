import { t } from '../../i18n/I18nProvider'
import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, MessageSquare, FileText, AlertTriangle, Inbox, History as HistoryIcon, ExternalLink } from 'lucide-react'
import { PageHeader, Card, Button, Input, Select, Textarea, Notice, Badge, Tabs, Modal, EmptyState, SearchInput } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { MANUAL_METHOD, SUBMISSION_STATUS, approveSubmission, getSubmission, listSubmissions, proofUrl, rejectSubmission, requestInfo, toMinor } from '../../api/payments'
import { money } from '../../utils/format'
import { fmtDate } from '../../utils/date'

const STATUS_TABS = [
  { value: 'PENDING_VERIFICATION', label: 'Pending' },
  { value: 'NEEDS_INFO', label: 'Needs info' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: '', label: 'All' },
]
const when = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

export default function PaymentVerification() {
  const { state } = useStore()
  const { user, refreshFees } = useAuth()
  const canVerify = !!user?.roles?.includes('ADMIN')
  const cur = state.settings.currency
  const [status, setStatus] = useState('PENDING_VERIFICATION')
  const [filters, setFilters] = useState({ search: '', reference: '', method: '', groupId: '', from: '', to: '' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  const load = () => {
    setError('')
    listSubmissions({ status, ...filters, pageSize: 100 }).then(setData, (e) => { setError(e.message); setData({ items: [], total: 0 }) })
  }
  useEffect(load, [status, filters]) // eslint-disable-line react-hooks/exhaustive-deps
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader title={t('Payment Verification')} subtitle={t('Bank transfers and UPI payments reported by families. Approve only after the money shows in the Madarsa’s bank account.')} />
      {!canVerify && <Notice tone="blue" className="mb-4">{t('You can view reported payments. Approving or rejecting them is done by the administration.')}</Notice>}
      <Tabs tabs={STATUS_TABS.map((s) => ({ value: s.value, label: t(s.label) }))} value={status} onChange={setStatus} className="mb-3" />
      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={filters.search} onChange={(v) => setF('search', v)} placeholder={t('Student name or admission no.')} className="sm:col-span-2" />
          <Input aria-label={t('UTR / reference')} placeholder={t('UTR / reference')} value={filters.reference} onChange={(e) => setF('reference', e.target.value)} />
          <Select aria-label={t('Method')} value={filters.method} onChange={(e) => setF('method', e.target.value)} placeholder={t('All methods')} options={[{ value: 'BANK_TRANSFER', label: t('Bank transfer') }, { value: 'UPI', label: 'UPI' }]} />
          <Select aria-label={t('Halqa')} value={filters.groupId} onChange={(e) => setF('groupId', e.target.value)} placeholder={t('All halqas')} options={state.groups.map((g) => ({ value: g.uuid, label: g.name }))} className="sm:col-span-2" />
          <Input aria-label={t('Submitted from')} type="date" value={filters.from} onChange={(e) => setF('from', e.target.value)} />
          <Input aria-label={t('Submitted to')} type="date" value={filters.to} onChange={(e) => setF('to', e.target.value)} />
        </div>
      </Card>
      {error && <Notice tone="red" className="mb-4">{error}</Notice>}
      {!data ? <p className="text-[13px] text-ink-muted">{t('Loading…')}</p> : !data.items.length ? (
        <Card><EmptyState icon={Inbox} title={t(status === 'PENDING_VERIFICATION' ? 'Nothing waiting for verification' : 'No payments found')}>{t('Payments families report by bank transfer or UPI appear here.')}</EmptyState></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {data.items.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setOpen(s.id)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-start hover:bg-ivory-50 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-forest">{s.student.name} <span className="font-normal text-ink-muted">· {s.student.admissionNo}{s.student.group ? ` · ${s.student.group.name}` : ''}</span></span>
                    <span className="block truncate text-[12.5px] text-ink-muted">{t(MANUAL_METHOD[s.method])} · {t('Ref')} <span className="font-mono">{s.reference}</span> · {t('Paid')} {fmtDate(s.paidOn)} · {t('Reported')} {when(s.createdAt)}</span>
                  </span>
                  <span className="text-end"><span className="block font-bold tabular">{money(s.amountMinor / 100, cur)}</span><Badge tone={SUBMISSION_STATUS[s.status].tone}>{t(SUBMISSION_STATUS[s.status].label)}</Badge></span>
                </button>
              </li>
            ))}
          </ul>
          {data.total > data.items.length && <p className="px-5 py-3 text-[12.5px] text-ink-muted">{t('Showing the latest')} {data.items.length} {t('of')} {data.total}. {t('Use the filters to narrow the list.')}</p>}
        </Card>
      )}
      <SubmissionModal id={open} canVerify={canVerify} me={user?.id} currency={cur} onClose={() => setOpen(null)} onChanged={() => { load(); refreshFees() }} />
    </div>
  )
}

function SubmissionModal({ id, canVerify, me, currency, onClose, onChanged }) {
  const toast = useToast()
  const [s, setS] = useState(null)
  const [action, setAction] = useState(null)
  const [amount, setAmount] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [proof, setProof] = useState(null)

  useEffect(() => {
    setS(null); setAction(null); setError(''); setProof(null)
    if (id) getSubmission(id).then((x) => { setS(x); setAmount((x.amountMinor / 100).toFixed(2)) }, (e) => setError(e.message))
  }, [id])
  useEffect(() => {
    let url
    if (s?.proof) proofUrl(s.id).then((u) => { url = u; setProof(u) }, () => setProof(null))
    return () => url && URL.revokeObjectURL(url)
  }, [s?.id, s?.proof])
  if (!id) return null

  const reviewable = s && canVerify && (s.status === 'PENDING_VERIFICATION' || s.status === 'NEEDS_INFO')
  const own = s && s.submittedById === me
  const doIt = async () => {
    setBusy(true)
    setError('')
    try {
      let r
      if (action === 'approve') {
        const minor = toMinor(amount)
        if (!minor) throw new Error(t('Enter the amount received, e.g. 1500 or 1500.50.'))
        r = await approveSubmission(s.id, { ...(minor !== s.amountMinor ? { amountMinor: minor } : {}), ...(text.trim() ? { note: text.trim() } : {}) })
        toast(t('Payment approved'), { description: `${t('Receipt')} ${r.payment.receiptNo}` })
      } else if (action === 'reject') {
        r = await rejectSubmission(s.id, text.trim())
        toast(t('Payment rejected'), { description: t('The family has been told why.') })
      } else {
        r = await requestInfo(s.id, text.trim())
        toast(t('Information requested'))
      }
      setS({ ...s, ...r })
      setAction(null)
      setText('')
      onChanged()
    } catch (err) {
      setError(err.fieldErrors && Object.values(err.fieldErrors).join(' ') || err.message)
    } finally { setBusy(false) }
  }

  const footer = action ? (
    <><Button variant="secondary" onClick={() => { setAction(null); setError('') }}>{t('Back')}</Button>
      <Button variant={action === 'reject' ? 'danger' : 'primary'} loading={busy} onClick={doIt}>{t(action === 'approve' ? 'Confirm approval' : action === 'reject' ? 'Reject payment' : 'Send request')}</Button></>
  ) : reviewable && !own ? (
    <><Button variant="secondary" icon={MessageSquare} onClick={() => setAction('info')}>{t('Ask for info')}</Button>
      <Button variant="danger-soft" icon={XCircle} onClick={() => setAction('reject')}>{t('Reject')}</Button>
      <Button icon={CheckCircle2} onClick={() => setAction('approve')}>{t('Approve')}</Button></>
  ) : <Button variant="secondary" onClick={onClose}>{t('Close')}</Button>

  return (
    <Modal open onClose={busy ? undefined : onClose} title={s ? `${s.student.name} · ${money(s.amountMinor / 100, currency)}` : t('Reported payment')} subtitle={s ? `${s.code} · ${t(MANUAL_METHOD[s.method])}` : ''} footer={footer} size="lg">
      {!s ? <p className="text-[13px] text-ink-muted">{error || t('Loading…')}</p> : (
        <div className="space-y-4">
          {own && reviewable && <Notice tone="gold" icon={AlertTriangle}>{t('You reported this payment yourself, so another member of staff must review it.')}</Notice>}
          {s.sameReference?.length > 0 && (
            <Notice tone="red" icon={AlertTriangle}>
              {t('This reference was used before:')} {s.sameReference.map((o) => `${o.code} (${t(SUBMISSION_STATUS[o.status].label)}${o.otherStudent ? `, ${t('another student')}` : ''})`).join(', ')}. {t('Check the bank statement carefully.')}
            </Notice>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-3">
            <div><dt className="text-[11.5px] font-semibold text-ink-muted">{t('Student')}</dt><dd className="font-semibold">{s.student.name} ({s.student.admissionNo})</dd></div>
            <div><dt className="text-[11.5px] font-semibold text-ink-muted">{t('Halqa')}</dt><dd>{s.student.group?.name ?? '—'}</dd></div>
            <div><dt className="text-[11.5px] font-semibold text-ink-muted">{t('Reported by')}</dt><dd>{s.submittedBy}</dd></div>
            <div><dt className="text-[11.5px] font-semibold text-ink-muted">{t('Amount reported')}</dt><dd className="font-bold tabular">{money(s.amountMinor / 100, currency)}</dd></div>
            <div><dt className="text-[11.5px] font-semibold text-ink-muted">{t('Date paid')}</dt><dd>{fmtDate(s.paidOn)}</dd></div>
            <div><dt className="text-[11.5px] font-semibold text-ink-muted">{t('UTR / reference')}</dt><dd className="break-all font-mono font-semibold">{s.reference}</dd></div>
            <div><dt className="text-[11.5px] font-semibold text-ink-muted">{t('Invoices')}</dt><dd>{s.invoiceIds.length ? `${s.invoiceIds.length} ${t('selected')}` : t('Oldest due first')}</dd></div>
            <div><dt className="text-[11.5px] font-semibold text-ink-muted">{t('Reported at')}</dt><dd>{when(s.createdAt)}</dd></div>
            <div><dt className="text-[11.5px] font-semibold text-ink-muted">{t('Status')}</dt><dd><Badge tone={SUBMISSION_STATUS[s.status].tone}>{t(SUBMISSION_STATUS[s.status].label)}</Badge></dd></div>
          </dl>
          {s.note && <p className="whitespace-pre-line rounded-xl bg-ivory-50 px-3 py-2 text-[13px] text-ink-soft">{s.note}</p>}
          {s.reviewNote && <p className="rounded-xl bg-ivory-100 px-3 py-2 text-[13px]"><b>{t('Office note:')}</b> {s.reviewNote}{s.reviewedBy ? ` — ${s.reviewedBy}` : ''}</p>}
          {s.payment && <Notice tone="green" icon={CheckCircle2}>{t('Recorded as receipt')} <b>{s.payment.receiptNo}</b> ({money(s.payment.amountMinor / 100, currency)}){s.payment.unallocatedMinor ? ` · ${money(s.payment.unallocatedMinor / 100, currency)} ${t('more than was owed: kept for review')}` : ''}.</Notice>}
          <div>
            <p className="label flex items-center gap-1.5"><FileText size={14} /> {t('Proof of payment')}</p>
            {!s.proof ? <p className="text-[13px] text-ink-muted">{t('No file attached.')}</p>
              : s.proof.mimeType.startsWith('image/') ? (proof ? <img src={proof} alt={t('Proof of payment uploaded by the family')} className="max-h-[420px] w-auto rounded-xl border border-line" /> : <p className="text-[13px] text-ink-muted">{t('Loading…')}</p>)
                : <Button variant="secondary" size="sm" icon={ExternalLink} href={proof ?? undefined} target="_blank" rel="noopener noreferrer">{t('Open PDF')}</Button>}
            <p className="mt-1 text-[12px] text-ink-muted">{t('A screenshot can be edited: always confirm the credit in the bank statement.')}</p>
          </div>
          {action === 'approve' && (
            <div className="space-y-3 rounded-2xl border border-primary-200 bg-primary-50/40 p-3">
              <Input label={t('Amount received in the bank (₹)')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint={t('Change only if the bank shows a different amount; then add a note.')} />
              <Textarea label={t('Note (optional)')} rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
              <p className="text-[12.5px] text-ink-soft">{t('Approving records the payment in the fee ledger and issues a receipt. It cannot be undone; use a refund to reverse it.')}</p>
            </div>
          )}
          {(action === 'reject' || action === 'info') && (
            <Textarea label={t(action === 'reject' ? 'Reason (shown to the family)' : 'What do you need from the family?')} rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          )}
          {error && <Notice tone="red">{error}</Notice>}
          {s.history?.length > 0 && (
            <div>
              <p className="label flex items-center gap-1.5"><HistoryIcon size={14} /> {t('History')}</p>
              <ol className="space-y-1.5 text-[12.5px]">
                {s.history.map((h, i) => <li key={i}><span className="text-ink-muted">{when(h.at)} · {h.actorName}:</span> {h.summary}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
