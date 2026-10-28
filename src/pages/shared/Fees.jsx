import { t } from "../../i18n/I18nProvider"
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, Download, CreditCard, Wallet, AlertCircle, TrendingUp, Percent, BellRing } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useActiveChild } from '../../hooks/useScope'
import { useQueryState } from '../../hooks/useQueryState'
import { PageHeader, Card, CardHeader, Button, Tabs, SearchInput, Select, Input, Stat, Avatar, EmptyState, Notice } from '../../components/ui'
import ChildSwitcher from '../../components/cards/ChildSwitcher'
import { FeeBadge } from '../../components/cards/StatusBadges'
import { FeeSummary, InvoiceList, PaymentHistory, ReceiptModal, RecordPaymentModal, CheckoutModal, groupReceipts } from '../../features/fees/FeeViews'
import { studentFees, feeTotals } from '../../services/selectors'
import { FEE_STATUS, PAYMENT_METHODS } from '../../constants/labels'
import { money, pct } from '../../utils/format'
import { fmtDate, fmtMonth, monthKey } from '../../utils/date'
import { downloadCSV } from '../../utils/csv'

export default function Fees() {
  const { state } = useStore()
  return state.session.role === 'admin' ? <AdminFees /> : <MyFees />
}

function MyFees() {
  const { state, idx } = useStore()
  const { child, isParent } = useActiveChild()
  const [pay, setPay] = useState(false)
  const [receipt, setReceipt] = useState(null)
  if (!child) return null
  const cur = state.settings.currency
  const fees = studentFees(state, idx, child.id)
  const plan = state.feePlans.find((p) => p.id === child.feePlanId)
  return (
    <div>
      <PageHeader title={isParent ? 'Fees & Payments' : 'My Fees'} subtitle={`${child.name} · ${t(plan?.name)}`}
        actions={isParent && <Button variant="gold" icon={CreditCard} onClick={() => setPay(true)} disabled={!fees.balance}>{t("Pay fees")}</Button>} />
      <ChildSwitcher className="mb-4" />
      <div className="space-y-4">
        <FeeSummary fees={fees} currency={cur} />
        {fees.nextDue ? (
          <Notice tone={fees.overdue ? 'red' : 'gold'} icon={AlertCircle}>
            {fees.overdue ? <><b>{money(fees.overdue, cur)} {t("is overdue.")}</b> </> : null}{t("Next due date:")} <b>{fmtDate(fees.nextDue.dueDate)}</b> {t("for")} {fmtMonth(fees.nextDue.period)} ({money(fees.nextDue.balance, cur)}).
          </Notice>
        ) : <Notice tone="green" icon={Wallet}>{child.concession?.percent >= 100 ? 'This student is fully sponsored. No fees are due.' : 'All dues are cleared. JazakAllahu khairan.'}</Notice>}
        {child.concession && child.concession.percent < 100 && <p className="text-[13px] text-ink-muted">{t("Concession applied:")} {child.concession.type} ({child.concession.percent}%)</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader title={t("Invoices")} subtitle={t("Monthly fee for the period")} /><div className="mt-2"><InvoiceList invoices={fees.invoices} currency={cur} /></div></Card>
          <Card><CardHeader title={t("Payment history")} subtitle={t("Tap a payment to view its receipt")} /><div className="mt-2"><PaymentHistory payments={fees.payments} currency={cur} onReceipt={setReceipt} /></div></Card>
        </div>
        {!isParent && <p className="text-center text-[12.5px] text-ink-muted">{t("Payments are made by your guardian. Only your own fee records are shown.")}</p>}
      </div>
      {isParent && <CheckoutModal open={pay} onClose={() => setPay(false)} student={child} />}
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  )
}

function AdminFees() {
  const { state, idx, today, dispatch } = useStore()
  const cur = state.settings.currency
  const [tab, setTab] = useQueryState('tab', 'dues')
  const [payOpen, setPayOpen] = useQueryState('pay')
  const [payFor, setPayFor] = useState('')
  const [receipt, setReceipt] = useState(null)
  const totals = feeTotals(state, idx, today)

  const openPay = (sid = '') => { setPayFor(sid); setPayOpen('1') }

  return (
    <div>
      <PageHeader title={t("Fee management")} subtitle={t("Plans, dues, collections and receipts")}
        actions={<><Button variant="secondary" icon={BellRing} to="/reminders">{t("Reminders")}</Button>{state.session.persona === 'admin' && <Button icon={Receipt} onClick={() => openPay()}>{t("Record payment")}</Button>}</>} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label={t("Collected this month")} value={money(totals.collectedThisMonth, cur)} icon={TrendingUp} tone="green" />
        <Stat label={t("Billed this month")} value={money(totals.billedThisMonth, cur)} sub={t('{pct}% collected', { pct: pct(totals.collectedThisMonth, totals.billedThisMonth) })} icon={Wallet} tone="gold" />
        <Stat label={t("Outstanding")} value={money(totals.outstanding, cur)} icon={AlertCircle} tone="red" />
        <Stat label={t("Overdue")} value={money(totals.overdue, cur)} sub="Past due date" icon={AlertCircle} tone="amber" />
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'dues', label: 'Student dues' }, { value: 'payments', label: 'Payments' }, { value: 'plans', label: 'Fee plans' }]} />
      {tab === 'dues' && <Dues onPay={openPay} />}
      {tab === 'payments' && <Payments onReceipt={setReceipt} />}
      {tab === 'plans' && <Plans />}
      <RecordPaymentModal open={payOpen === '1'} onClose={() => setPayOpen('')} studentId={payFor} />
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  )
}

function Dues({ onPay }) {
  const { state, idx, today, dispatch } = useStore()
  const cur = state.settings.currency
  const [q, setQ] = useQueryState('q')
  const [status, setStatus] = useQueryState('status')
  const [group, setGroup] = useQueryState('group')
  const rows = useMemo(() => state.students.map((s) => ({ s, f: studentFees(state, idx, s.id, today) })), [state, idx, today])
  const list = rows.filter(({ s, f }) => (!q || s.name.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase())) && (!group || s.groupId === group) && (!status || f.status === status))
    .sort((a, b) => b.f.overdue - a.f.overdue || b.f.balance - a.f.balance)
  const exportCsv = () => {
    downloadCSV(`fee-dues-${today}`, list.map(({ s, f }) => ({ ID: s.id, Name: s.name, Halqa: idx.groups[s.groupId]?.name, Guardian: idx.parents[s.guardianId]?.name, Phone: idx.parents[s.guardianId]?.phone, Billed: f.total, Paid: f.paid, Outstanding: f.balance, Overdue: f.overdue, Status: FEE_STATUS[f.status].label, 'Next due': f.nextDue?.dueDate || '' })))
    dispatch({ type: 'LOG', entry: { action: 'CSV exported', entity: 'Fee dues report', description: `${list.length} rows` } })
  }
  return (
    <Card>
      <div className="grid gap-2 p-3 sm:grid-cols-[1fr_180px_180px_auto] sm:p-4">
        <SearchInput value={q} onChange={setQ} placeholder={t("Search student or ID")} />
        <Select aria-label={t("Payment status")} value={status} onChange={(e) => setStatus(e.target.value)} placeholder={t("All statuses")} options={Object.entries(FEE_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
        <Select aria-label={t("Halqa")} value={group} onChange={(e) => setGroup(e.target.value)} placeholder={t("All halqas")} options={state.groups.map((g) => ({ value: g.id, label: g.name }))} />
        <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!list.length}>{t("CSV")}</Button>
      </div>
      {list.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {list.map(({ s, f }) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
              <Link to={`/students/${s.id}?tab=fees`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={s.name} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold text-forest">{s.name}</span>
                  <span className="block truncate text-[12px] text-ink-muted">{t(idx.groups[s.groupId]?.short)} · {f.nextDue ? t('next due {date}', { date: fmtDate(f.nextDue.dueDate) }) : t('no dues')}</span>
                </span>
              </Link>
              <span className="text-end">
                <span className={`block text-[14px] font-bold tabular ${f.balance ? 'text-clay-600' : 'text-primary-700'}`}>{money(f.balance, cur)}</span>
                {f.overdue > 0 && <span className="block text-[11.5px] text-clay-600">{money(f.overdue, cur)} {t("overdue")}</span>}
              </span>
              <FeeBadge status={f.status} />
              {f.balance > 0 && <Button size="sm" variant="soft" onClick={() => onPay(s.id)}>{t("Collect")}</Button>}
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t("No students match")} />}
    </Card>
  )
}

function Payments({ onReceipt }) {
  const { state, idx, today } = useStore()
  const cur = state.settings.currency
  const [from, setFrom] = useQueryState('from', `${monthKey(today)}-01`)
  const [to, setTo] = useQueryState('to', today)
  const [method, setMethod] = useQueryState('method')
  const [q, setQ] = useQueryState('pq')
  const pays = state.payments.filter((p) => p.date >= from && p.date <= to && (!method || p.method === method) && (!q || idx.students[p.studentId]?.name.toLowerCase().includes(q.toLowerCase())))
  const receipts = groupReceipts(pays)
  const total = pays.reduce((a, p) => a + p.amount, 0)
  const exportCsv = () => downloadCSV(`fee-collections-${from}-to-${to}`, receipts.map((r) => ({ Receipt: r.receiptNo, Date: r.date, Student: idx.students[r.studentId]?.name, ID: r.studentId, Method: r.method, Amount: r.amount, 'Recorded by': r.recordedBy })))
  return (
    <Card>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-[1fr_150px_150px_170px_auto] sm:p-4">
        <SearchInput className="col-span-2 sm:col-span-1" value={q} onChange={setQ} placeholder={t("Search student")} />
        <Input aria-label={t("From")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} />
        <Input aria-label={t("To")} type="date" value={to} onChange={(e) => setTo(e.target.value)} max={today} />
        <Select aria-label={t("Method")} value={method} onChange={(e) => setMethod(e.target.value)} placeholder={t("All methods")} options={PAYMENT_METHODS} />
        <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!receipts.length}>{t("CSV")}</Button>
      </div>
      <p className="border-t border-line bg-ivory-50 px-4 py-2 text-[13px] text-ink-soft sm:px-5">{t('{n} receipts', { n: receipts.length })} · <b className="text-forest">{money(total, cur)}</b> {t('collected')}</p>
      <PaymentHistory payments={pays} currency={cur} onReceipt={onReceipt} />
    </Card>
  )
}

function Plans() {
  const { state, idx } = useStore()
  const cur = state.settings.currency
  const concessions = state.students.filter((s) => s.concession)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={t("Fee plans")} subtitle={t("Monthly billing")} icon={Wallet} />
        <ul className="mt-2 divide-y divide-line">
          {state.feePlans.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1"><p className="text-[14px] font-bold text-forest">{p.name}</p><p className="text-[12px] text-ink-muted">{p.covers}</p></div>
              <div className="text-end"><p className="font-bold tabular">{money(p.amount, cur)}</p><p className="text-[11.5px] text-ink-muted">{state.students.filter((s) => s.feePlanId === p.id && s.status === 'active').length} {t("students")}</p></div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title={t("Discounts & concessions")} subtitle={t('{n} students', { n: concessions.length })} icon={Percent} />
        <ul className="mt-2 divide-y divide-line">
          {concessions.map((s) => (
            <li key={s.id}><Link to={`/students/${s.id}?tab=fees`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ivory-50 sm:px-5"><span><span className="block text-[14px] font-semibold text-forest">{s.name}</span><span className="text-[12px] text-ink-muted">{s.concession.type}</span></span><span className="chip bg-primary-50 text-primary-700">−{s.concession.percent}%</span></Link></li>
          ))}
        </ul>
        <p className="border-t border-line px-5 py-2.5 text-[12px] text-ink-muted">{t("Concessions are edited on the student's profile.")}</p>
      </Card>
    </div>
  )
}
