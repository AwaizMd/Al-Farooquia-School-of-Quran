import { t } from '../../i18n/I18nProvider'
import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, CalendarCheck, Download, FileText, HandCoins, ListChecks, Plus, RefreshCw, Settings2, Trash2, Users, Wallet } from 'lucide-react'
import { del, get, patch, post, put } from '../../api/client'
import { toMinor } from '../../api/payments'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Notice, PageHeader, Segmented, Select, Tabs, Textarea } from '../../components/ui'
import { downloadCSV } from '../../utils/csv'
import { todayISO } from '../../utils/date'
import { money } from '../../utils/format'

// Payroll is worked out on the server from the madrasa's own rules; this page only shows
// the figures and sends decisions. The app moves no money and creates no bank files.

const rupees = (minor) => money(minor / 100, 'INR')
const RUN_STATUS = { DRAFT: { label: 'Draft', tone: 'gold' }, APPROVED: { label: 'Approved', tone: 'blue' }, PAID: { label: 'Paid', tone: 'green' } }
const useLoad = (path) => {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(() => get(path).then((r) => { setData(r); setError('') }, (e) => setError(e.message)), [path])
  useEffect(() => { load() }, [load])
  return { data, error, load }
}

export default function Payroll() {
  const auth = useAuth()
  const canManage = auth.can('payroll.manage')
  const [tab, setTab] = useState('months')
  return (
    <div className="space-y-4">
      <PageHeader title={t('Payroll')} subtitle={t('Salaries, deductions and monthly payslips, worked out from your own rules')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'months', label: 'Months' }, { value: 'salaries', label: 'Salaries' }, { value: 'items', label: 'Pay items' }, { value: 'adjustments', label: 'Adjustments' }, { value: 'rules', label: 'Rules' }]} />
      {tab === 'months' && <Months canManage={canManage} canApprove={auth.can('payroll.approve')} />}
      {tab === 'salaries' && <Salaries canManage={canManage} />}
      {tab === 'items' && <PayItems canManage={canManage} />}
      {tab === 'adjustments' && <Adjustments canManage={canManage} />}
      {tab === 'rules' && <Rules canManage={canManage} />}
    </div>
  )
}

// ---------- Months ----------

function Months({ canManage, canApprove }) {
  const toast = useToast()
  const { data, error, load } = useLoad('/payroll/runs')
  const [open, setOpen] = useState(null)
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true); setFormError('')
    try { const r = await post('/payroll/runs', { month }); toast(t('Draft created')); await load(); setOpen(r.id) } catch (e) { setFormError(e.message) } finally { setBusy(false) }
  }
  if (open) return <RunDetail id={open} canManage={canManage} canApprove={canApprove} onBack={() => { setOpen(null); load() }} />
  return (
    <>
      {canManage && (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Input label={t('Month')} type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          <Button icon={Plus} onClick={create} loading={busy}>{t('Work out draft')}</Button>
          {formError && <Notice tone="red" className="w-full">{formError}</Notice>}
        </Card>
      )}
      {error && <Notice tone="red">{error}</Notice>}
      {data && !data.items.length && <EmptyState icon={Wallet} title={t('No payroll yet')}>{t('Add salaries, then work out a draft for a month.')}</EmptyState>}
      {data?.items.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {data.items.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r.id)} className="flex min-h-[56px] w-full flex-wrap items-center gap-3 px-4 py-3 text-start hover:bg-ivory-50 sm:px-5">
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-bold text-forest">{r.month}</span><span className="block text-[12px] text-ink-muted">{r.staffCount} {t('staff')}{r.paidOn ? ` · ${t('paid on')} ${r.paidOn}` : ''}</span></span>
                  <span className="font-bold tabular text-forest">{rupees(r.totalNetMinor)}</span>
                  <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function RunDetail({ id, canManage, canApprove, onBack }) {
  const toast = useToast()
  const { run: sensitive, dialog } = useSensitiveAction()
  const { data: r, error, load } = useLoad(`/payroll/runs/${id}`)
  const [review, setReview] = useState(null)
  const [paying, setPaying] = useState(false)
  const [paidOn, setPaidOn] = useState(todayISO())
  const [discarding, setDiscarding] = useState(false)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')
  const act = async (name, fn, done) => {
    setBusy(name); setActionError('')
    try { const out = await fn(); toast(done); return out ?? true } catch (e) { if (e.code !== 'CANCELLED') setActionError(e.message); return false } finally { setBusy('') }
  }
  if (error) return <Notice tone="red">{error}</Notice>
  if (!r) return null
  const isDraft = r.status === 'DRAFT'
  const exportCsv = () => downloadCSV(`payroll-${r.month}.csv`, r.payslips.map((s) => ({ 'Employee ID': s.staffCode, Name: s.staffName, Designation: s.title, Basic: s.basicMinor / 100, Earnings: s.earningsMinor / 100, Deductions: s.deductionsMinor / 100, Net: s.netMinor / 100, 'Absent days': s.attendance.absentDays, 'Absent days paid': s.paidLeaveDays, Note: s.note ?? '' })))
  return (
    <>
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <div className="min-w-[160px] flex-1">
          <p className="text-[17px] font-bold text-forest">{r.month} <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge></p>
          <p className="text-[13px] tabular text-ink-muted">{t('Total to pay')} <b className="text-forest">{rupees(r.totalNetMinor)}</b> · {r.payslips.length} {t('staff')}</p>
        </div>
        <Button variant="secondary" onClick={onBack}>{t('Back')}</Button>
        <Button variant="secondary" icon={Download} onClick={exportCsv}>{t('Download CSV')}</Button>
        {isDraft && canManage && <Button variant="secondary" icon={RefreshCw} loading={busy === 'recalc'} onClick={async () => { if (await act('recalc', () => post(`/payroll/runs/${id}/recalculate`), t('Recalculated'))) load() }}>{t('Recalculate')}</Button>}
        {isDraft && canManage && <Button variant="danger-soft" icon={Trash2} onClick={() => setDiscarding(true)}>{t('Discard')}</Button>}
        {isDraft && canApprove && <Button icon={BadgeCheck} loading={busy === 'approve'} onClick={async () => { if (await act('approve', () => sensitive(() => post(`/payroll/runs/${id}/approve`)), t('Payroll approved'))) load() }}>{t('Approve')}</Button>}
        {r.status === 'APPROVED' && canApprove && <Button icon={HandCoins} onClick={() => setPaying(true)}>{t('Record as paid')}</Button>}
      </Card>
      {actionError && <Notice tone="red">{actionError}</Notice>}
      {isDraft && r.stale && <Notice tone="red">{t('Records have changed since this draft was worked out. Recalculate before approving.')}</Notice>}
      {isDraft && <Notice tone="gold">{t('Holidays and approved leave are not in the system yet, so absent days may be too high. Mark those days as paid on each payslip before approving.')}</Notice>}
      {r.noSalary?.length > 0 && <Notice tone="gold">{t('No salary set, so not included:')} {r.noSalary.join(', ')}</Notice>}
      {r.warnings?.length > 0 && <Notice tone="gold"><ul className="space-y-0.5">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
      {!isDraft && <Notice tone="green">{t('These figures are final. To correct a month, add an adjustment: it is applied to the next payroll.')}</Notice>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead><tr className="text-[12.5px] text-ink-muted">{['Staff', 'Absent', 'Earnings', 'Deductions', 'Net', ''].map((h) => <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold">{t(h)}</th>)}</tr></thead>
          <tbody className="divide-y divide-line tabular">
            {r.payslips.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2.5"><span className="font-semibold text-forest">{s.staffName}</span><span className="block text-[12px] text-ink-muted">{s.staffCode}{s.note ? ` · ${s.note}` : ''}</span></td>
                <td className="px-3 py-2.5">{s.attendance.absentDays}{s.paidLeaveDays ? ` (${s.paidLeaveDays} ${t('paid')})` : ''}</td>
                <td className="px-3 py-2.5">{rupees(s.earningsMinor)}</td><td className="px-3 py-2.5">{rupees(s.deductionsMinor)}</td>
                <td className="px-3 py-2.5 font-bold text-forest">{rupees(s.netMinor)}</td>
                <td className="px-3 py-2.5 text-end"><Button size="sm" variant="soft" onClick={() => setReview(s)}>{t(isDraft && canManage ? 'Review' : 'View')}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <ReviewModal slip={review} editable={isDraft && canManage} runId={id} onClose={() => setReview(null)} onSaved={load} />
      <Modal open={paying} onClose={() => setPaying(false)} size="sm" title={t('Record as paid')} subtitle={t('This only records the date. The app does not send any money.')}
        footer={<><Button variant="secondary" onClick={() => setPaying(false)}>{t('Cancel')}</Button><Button loading={busy === 'paid'} onClick={async () => { const ok = await act('paid', () => sensitive(() => post(`/payroll/runs/${id}/paid`, { paidOn })), t('Recorded as paid')); setPaying(false); if (ok) load() }}>{t('Save')}</Button></>}>
        <Input label={t('Paid on')} type="date" value={paidOn} max={todayISO()} onChange={(e) => setPaidOn(e.target.value)} />
      </Modal>
      <Modal open={discarding} onClose={() => setDiscarding(false)} size="sm" title={t('Discard this draft?')}
        footer={<><Button variant="secondary" onClick={() => setDiscarding(false)}>{t('Cancel')}</Button><Button variant="danger" loading={busy === 'discard'} onClick={async () => { const ok = await act('discard', () => del(`/payroll/runs/${id}`), t('Draft discarded')); setDiscarding(false); if (ok) onBack() }}>{t('Discard')}</Button></>}>
        <p className="text-[14px] text-ink-soft">{t('Paid days and notes on this draft will be lost. Salaries are not affected.')}</p>
      </Modal>
      {dialog}
    </>
  )
}

function ReviewModal({ slip, editable, runId, onClose, onSaved }) {
  const toast = useToast()
  const [days, setDays] = useState('0')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (slip) { setDays(String(slip.paidLeaveDays)); setNote(slip.note ?? ''); setError('') } }, [slip])
  if (!slip) return null
  const save = async () => {
    if (!/^\d{1,2}$/.test(days)) return setError(t('Enter a whole number of days.'))
    setBusy(true); setError('')
    try { await patch(`/payroll/runs/${runId}/payslips/${slip.id}`, { paidLeaveDays: Number(days), note: note.trim() || null }); toast(t('Payslip updated')); await onSaved(); onClose() } catch (e) { setError(e.fieldErrors?.paidLeaveDays || e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={slip.staffName} subtitle={`${slip.staffCode} · ${slip.title}`}
      footer={<><Button variant="secondary" onClick={onClose}>{t('Close')}</Button>{editable && <Button onClick={save} loading={busy}>{t('Save')}</Button>}</>}>
      <div className="space-y-3.5">
        <p className="text-[13px] text-ink-soft">{t('Expected')} {slip.attendance.expectedDays} · {t('Present')} {slip.attendance.presentDays} · {t('Absent')} {slip.attendance.absentDays} · {t('Late')} {slip.attendance.lateCount} · {t('Early')} {slip.attendance.earlyCount}</p>
        <SlipLines lines={slip.lines} net={slip.netMinor} />
        {editable && <Input label={t('Absent days to pay (holidays, approved leave)')} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />}
        {editable && <Textarea label={t('Note')} value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} />}
        {error && <Notice tone="red">{error}</Notice>}
      </div>
    </Modal>
  )
}

export function SlipLines({ lines, net }) {
  return (
    <table className="w-full text-[13.5px] tabular">
      <tbody className="divide-y divide-line">
        {lines.map((l, i) => <tr key={i}><td className="py-1.5">{l.label}</td><td className={`py-1.5 text-end ${l.kind === 'DEDUCTION' ? 'text-clay-600' : ''}`}>{l.kind === 'DEDUCTION' ? '−' : ''}{rupees(l.amountMinor)}</td></tr>)}
      </tbody>
      <tfoot><tr className="border-t border-line font-bold"><td className="py-2">{t('Net pay')}</td><td className="py-2 text-end text-primary-700">{rupees(net)}</td></tr></tfoot>
    </table>
  )
}

// ---------- Salaries ----------

function Salaries({ canManage }) {
  const { data, error, load } = useLoad('/payroll/salaries')
  const [edit, setEdit] = useState(null)
  if (error) return <Notice tone="red">{error}</Notice>
  if (!data) return null
  if (!data.items.length) return <EmptyState icon={Users} title={t('No staff yet')}>{t('Add staff members first.')}</EmptyState>
  return (
    <Card>
      <ul className="divide-y divide-line">
        {data.items.map((r) => (
          <li key={r.staff.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <span className="min-w-[160px] flex-1"><span className="block text-[14px] font-bold text-forest">{r.staff.displayName}</span><span className="block text-[12px] text-ink-muted">{r.staff.code} · {r.staff.title}</span></span>
            {r.salary ? <span className="text-end"><span className="block font-bold tabular text-forest">{rupees(r.salary.basicMinor)}</span><span className="block text-[12px] text-ink-muted">{t('from')} {r.salary.effectiveFrom}{r.salary.exemptFromDeductions ? ` · ${t('no attendance deductions')}` : ''}</span></span> : <Badge tone="amber">{t('No salary set')}</Badge>}
            {canManage && <Button size="sm" variant="soft" onClick={() => setEdit(r)}>{t(r.salary ? 'Change' : 'Set salary')}</Button>}
          </li>
        ))}
      </ul>
      <SalaryModal row={edit} onClose={() => setEdit(null)} onSaved={load} />
    </Card>
  )
}

function SalaryModal({ row, onClose, onSaved }) {
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ effectiveFrom: todayISO(), basic: '', exempt: false, note: '', values: {} })
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!row) return
    setError('')
    setForm({ effectiveFrom: todayISO(), basic: row.salary ? String(row.salary.basicMinor / 100) : '', exempt: row.salary?.exemptFromDeductions ?? false, note: '', values: Object.fromEntries((row.salary?.componentValues ?? []).map((c) => [c.componentId, String(c.value / 100)])) })
    get('/payroll/components').then((r) => setItems(r.items.filter((c) => c.active)), () => setItems([]))
    get(`/payroll/staff/${row.staff.id}/salaries`).then((r) => setHistory(r.items), () => setHistory([]))
  }, [row])
  if (!row) return dialog
  const save = async () => {
    const basicMinor = toMinor(form.basic)
    if (basicMinor === null) return setError(t('Enter the basic salary as an amount.'))
    const componentValues = []
    for (const [componentId, v] of Object.entries(form.values)) {
      if (!String(v).trim()) continue
      const value = toMinor(v)
      if (value === null) return setError(t('Enter pay items as amounts or percentages.'))
      componentValues.push({ componentId, value })
    }
    setBusy(true); setError('')
    try {
      await run(() => post(`/payroll/staff/${row.staff.id}/salaries`, { effectiveFrom: form.effectiveFrom, basicMinor, exemptFromDeductions: form.exempt, componentValues, ...(form.note.trim() ? { note: form.note.trim() } : {}) }))
      toast(t('Salary saved')); await onSaved(); onClose()
    } catch (e) { if (e.code !== 'CANCELLED') setError(e.message) } finally { setBusy(false) }
  }
  return (
    <>
      <Modal open onClose={onClose} title={row.staff.displayName} subtitle={t('A change applies from the date you choose. Earlier months keep their salary.')}
        footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button onClick={save} loading={busy}>{t('Save')}</Button></>}>
        <div className="space-y-3.5">
          <Input label={t('Basic salary per month')} inputMode="decimal" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} autoFocus />
          <Input label={t('Applies from')} type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          {items.map((c) => <Input key={c.id} label={`${c.name} (${t(c.calc === 'FIXED' ? 'amount' : 'percent')})`} inputMode="decimal" hint={c.appliesToAll ? t('Leave empty to use the standard {v}', { v: c.calc === 'FIXED' ? rupees(c.value) : `${c.value / 100}%` }) : t('Leave empty if this person does not get it')} value={form.values[c.id] ?? ''} onChange={(e) => setForm({ ...form, values: { ...form.values, [c.id]: e.target.value } })} />)}
          <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" checked={form.exempt} onChange={(e) => setForm({ ...form, exempt: e.target.checked })} />{t('No deductions for absence or lateness')}</label>
          <Textarea label={t('Note')} value={form.note} maxLength={300} rows={2} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          {error && <Notice tone="red">{error}</Notice>}
          {history.length > 0 && <div><p className="text-[12.5px] font-semibold text-ink-muted">{t('History')}</p><ul className="mt-1 space-y-0.5 text-[12.5px] tabular text-ink-soft">{history.map((h) => <li key={h.id}>{h.effectiveFrom} · {rupees(h.basicMinor)}{h.note ? ` · ${h.note}` : ''}</li>)}</ul></div>}
        </div>
      </Modal>
      {dialog}
    </>
  )
}

// ---------- Pay items ----------

const BLANK_ITEM = { name: '', kind: 'EARNING', calc: 'FIXED', value: '', appliesToAll: false }

function PayItems({ canManage }) {
  const toast = useToast()
  const { data, error, load } = useLoad('/payroll/components')
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const value = toMinor(form.value)
    if (form.name.trim().length < 2) return setFormError(t('Enter a name.'))
    if (value === null) return setFormError(t('Enter the value as a number.'))
    setBusy(true); setFormError('')
    const payload = { name: form.name.trim(), kind: form.kind, calc: form.calc, value, appliesToAll: form.appliesToAll }
    try { if (form.id) await patch(`/payroll/components/${form.id}`, payload); else await post('/payroll/components', payload); toast(t('Saved')); setForm(null); load() } catch (e) { setFormError(e.fieldErrors?.value || e.message) } finally { setBusy(false) }
  }
  const toggle = async (c) => { try { await patch(`/payroll/components/${c.id}`, { active: !c.active }); load() } catch (e) { toast(e.message, { type: 'error' }) } }
  if (error) return <Notice tone="red">{error}</Notice>
  return (
    <>
      <Notice tone="gold">{t('Allowances and deductions are yours to define. None are built in, and nothing is added or taken unless it is listed here.')}</Notice>
      {canManage && <div><Button icon={Plus} onClick={() => { setForm(BLANK_ITEM); setFormError('') }}>{t('Add pay item')}</Button></div>}
      {data && !data.items.length && <EmptyState icon={ListChecks} title={t('No pay items yet')}>{t('Salaries will be the basic amount only.')}</EmptyState>}
      {data?.items.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {data.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span className="min-w-[160px] flex-1"><span className="block text-[14px] font-bold text-forest">{c.name}</span><span className="block text-[12px] text-ink-muted">{t(c.kind === 'EARNING' ? 'Earning' : 'Deduction')} · {c.calc === 'FIXED' ? rupees(c.value) : `${c.value / 100}% ${t('of basic')}`} · {t(c.appliesToAll ? 'everyone' : 'chosen staff')}</span></span>
                {!c.active && <Badge>{t('Off')}</Badge>}
                {canManage && <Button size="sm" variant="soft" onClick={() => { setForm({ id: c.id, name: c.name, kind: c.kind, calc: c.calc, value: String(c.value / 100), appliesToAll: c.appliesToAll }); setFormError('') }}>{t('Edit')}</Button>}
                {canManage && <Button size="sm" variant="ghost" onClick={() => toggle(c)}>{t(c.active ? 'Turn off' : 'Turn on')}</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={t(form?.id ? 'Edit pay item' : 'Add pay item')}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>{t('Cancel')}</Button><Button onClick={save} loading={busy}>{t('Save')}</Button></>}>
        {form && (
          <div className="space-y-3.5">
            <Input label={t('Name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} autoFocus />
            <Segmented label={t('Type')} value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={[{ value: 'EARNING', label: t('Earning') }, { value: 'DEDUCTION', label: t('Deduction') }]} />
            <Segmented label={t('Worked out as')} value={form.calc} onChange={(calc) => setForm({ ...form, calc })} options={[{ value: 'FIXED', label: t('Fixed amount') }, { value: 'PERCENT_OF_BASIC', label: t('Percent of basic') }]} />
            <Input label={t(form.calc === 'FIXED' ? 'Amount' : 'Percent')} inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" checked={form.appliesToAll} onChange={(e) => setForm({ ...form, appliesToAll: e.target.checked })} />{t('Applies to everyone')}</label>
            {formError && <Notice tone="red">{formError}</Notice>}
          </div>
        )}
      </Modal>
    </>
  )
}

// ---------- Adjustments ----------

function Adjustments({ canManage }) {
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const { data, error, load } = useLoad('/payroll/adjustments')
  const staff = useLoad('/payroll/salaries')
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const minor = toMinor(form.amount)
    if (!form.staffId) return setFormError(t('Choose a person.'))
    if (!minor) return setFormError(t('Enter an amount greater than zero, with at most two decimal places.'))
    if (form.reason.trim().length < 5) return setFormError(t('Give a reason of at least {n} characters.', { n: 5 }))
    setBusy(true); setFormError('')
    try { await run(() => post('/payroll/adjustments', { staffId: form.staffId, amountMinor: form.direction === 'MORE' ? minor : -minor, reason: form.reason.trim() })); toast(t('Adjustment saved')); setForm(null); load() } catch (e) { if (e.code !== 'CANCELLED') setFormError(e.message) } finally { setBusy(false) }
  }
  if (error) return <Notice tone="red">{error}</Notice>
  return (
    <>
      <Notice tone="gold">{t('Use an adjustment to correct a month already approved, or to pay or recover an advance. It is applied once, to the next payroll approved for that person.')}</Notice>
      {canManage && <div><Button icon={Plus} onClick={() => { setForm({ staffId: '', direction: 'MORE', amount: '', reason: '' }); setFormError('') }}>{t('Add adjustment')}</Button></div>}
      {data && !data.items.length && <EmptyState icon={FileText} title={t('No adjustments')} />}
      {data?.items.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span className="min-w-[160px] flex-1"><span className="block text-[14px] font-bold text-forest">{a.staff.displayName}</span><span className="block text-[12px] text-ink-muted">{a.reason}</span></span>
                <span className={`font-bold tabular ${a.amountMinor < 0 ? 'text-clay-600' : 'text-primary-700'}`}>{a.amountMinor < 0 ? '−' : '+'}{rupees(Math.abs(a.amountMinor))}</span>
                <Badge tone={a.appliedRunId ? 'green' : 'gold'}>{a.appliedRunId ? 'Applied' : 'Waiting'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={t('Add adjustment')}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>{t('Cancel')}</Button><Button onClick={save} loading={busy}>{t('Save adjustment')}</Button></>}>
        {form && (
          <div className="space-y-3.5">
            <Select label={t('Staff')} value={form.staffId} placeholder={t('Choose a person')} onChange={(e) => setForm({ ...form, staffId: e.target.value })} options={(staff.data?.items ?? []).map((r) => ({ value: r.staff.id, label: `${r.staff.displayName} · ${r.staff.code}` }))} />
            <Segmented label={t('Type')} value={form.direction} onChange={(direction) => setForm({ ...form, direction })} options={[{ value: 'MORE', label: t('Pay more') }, { value: 'LESS', label: t('Pay less') }]} />
            <Input label={t('Amount')} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Textarea label={t('Reason')} value={form.reason} maxLength={300} rows={2} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            {formError && <Notice tone="red">{formError}</Notice>}
          </div>
        )}
      </Modal>
      {dialog}
    </>
  )
}

// ---------- Rules ----------

function Rules({ canManage }) {
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const { data, error } = useLoad('/payroll/rules')
  const [r, setR] = useState(null)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setR(data) }, [data])
  if (error) return <Notice tone="red">{error}</Notice>
  if (!r) return null
  const off = !canManage
  const late = (patchIn) => setR({ ...r, lateRule: { ...r.lateRule, ...patchIn } })
  const save = async () => {
    setBusy(true); setFormError('')
    try { setR(await run(() => put('/payroll/rules', r))); toast(t('Rules saved')) } catch (e) { if (e.code !== 'CANCELLED') setFormError(e.message) } finally { setBusy(false) }
  }
  const Check = ({ on, set, label }) => <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" checked={on} disabled={off} onChange={(e) => set(e.target.checked)} />{label}</label>
  return (
    <Card>
      <CardHeader icon={Settings2} title={t('Payroll rules')} subtitle={t('Every rule starts switched off. A change applies to drafts worked out afterwards, never to approved months.')} />
      <div className="max-w-xl space-y-4 p-4 sm:p-5">
        <Select label={t('One day of pay is')} value={r.dayBasis} disabled={off} onChange={(e) => setR({ ...r, dayBasis: e.target.value })} options={[{ value: 'CALENDAR', label: t('Monthly pay ÷ days in that month') }, { value: 'WORKING', label: t('Monthly pay ÷ working days in that month') }, { value: 'FIXED', label: t('Monthly pay ÷ a fixed number of days') }]} />
        {r.dayBasis === 'FIXED' && <Input label={t('Fixed number of days')} type="number" min={1} max={31} disabled={off} value={r.fixedDays} onChange={(e) => setR({ ...r, fixedDays: Number(e.target.value) })} />}
        <Check on={r.deductAbsence} set={(deductAbsence) => setR({ ...r, deductAbsence })} label={t('Deduct a day of pay for each day absent')} />
        <Check on={r.lateRule.enabled} set={(enabled) => late({ enabled })} label={t('Deduct a day of pay for repeated lateness')} />
        {r.lateRule.enabled && <Input label={t('Late arrivals that count as one day')} type="number" min={1} max={31} disabled={off} value={r.lateRule.countPerDay} onChange={(e) => late({ countPerDay: Number(e.target.value) })} />}
        {r.lateRule.enabled && <Check on={r.lateRule.countEarly} set={(countEarly) => late({ countEarly })} label={t('Count early departures too')} />}
        <Select label={t('Rounding of net pay')} value={r.rounding} disabled={off} onChange={(e) => setR({ ...r, rounding: e.target.value })} options={[{ value: 'NONE', label: t('Exact') }, { value: 'RUPEE', label: t('Nearest rupee') }]} />
        <Check on={r.requireSecondApprover} set={(requireSecondApprover) => setR({ ...r, requireSecondApprover })} label={t('The person who prepares a payroll cannot approve it')} />
        {formError && <Notice tone="red">{formError}</Notice>}
        {canManage && <Button icon={CalendarCheck} onClick={save} loading={busy}>{t('Save rules')}</Button>}
      </div>
      {dialog}
    </Card>
  )
}
