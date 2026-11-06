import { t } from '../../i18n/I18nProvider'
import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, ClipboardList, Clock, Download, Pencil, Plus, ShieldOff, Users } from 'lucide-react'
import { get, patch, post, put } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Notice, PageHeader, Select, Tabs } from '../../components/ui'
import { downloadCSV } from '../../utils/csv'
import { todayISO } from '../../utils/date'

// Everyone's attendance from the kiosks, corrections, the monthly figures payroll
// will read, and shifts. Salaries and deductions are not worked out here.
const hours = (m) => (m == null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`)
const clock = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—')
const STATUS = { OPEN: { label: 'At work', tone: 'blue' }, CLOSED: { label: 'Completed', tone: 'green' }, MISSED_CHECKOUT: { label: 'Missed check-out', tone: 'amber' } }
/** datetime-local value (the browser's local time) ↔ an instant. */
const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }

export default function StaffAttendance() {
  const auth = useAuth()
  const canManage = auth.can('staff_attendance.manage')
  const [tab, setTab] = useState('daily')
  return (
    <div className="space-y-4">
      <PageHeader title={t('Staff Attendance')} subtitle={t('Check-ins from the kiosks, corrections and monthly figures')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'daily', label: 'Daily', icon: CalendarClock }, { value: 'monthly', label: 'Monthly', icon: ClipboardList }, { value: 'shifts', label: 'Shifts & staff', icon: Clock }]} />
      {tab === 'daily' && <Daily canManage={canManage} />}
      {tab === 'monthly' && <Monthly />}
      {tab === 'shifts' && <Shifts canManage={canManage} />}
    </div>
  )
}

function Daily({ canManage }) {
  const toast = useToast()
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState(null)
  const [staff, setStaff] = useState([])
  const load = useCallback(() => {
    get(`/staff-attendance?from=${from}&to=${to}${status ? `&status=${status}` : ''}&pageSize=200`).then((r) => { setRows(r.items); setError('') }, (e) => setError(e.message))
  }, [from, to, status])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (canManage) get('/staff-shifts').then((r) => setStaff(r.staff), () => {}) }, [canManage])
  const save = async () => {
    try {
      const body = { reason: edit.reason, checkInAt: new Date(edit.checkInAt).toISOString(), ...(edit.checkOutAt ? { checkOutAt: new Date(edit.checkOutAt).toISOString() } : {}) }
      if (edit.id) await post(`/staff-attendance/sessions/${edit.id}/correct`, edit.checkOutAt ? body : { ...body, checkOutAt: null })
      else await post('/staff-attendance/sessions', { ...body, staffId: edit.staffId })
      toast(t('Attendance saved'))
      setEdit(null)
      load()
    } catch (e) { setEdit((x) => ({ ...x, errors: e.fieldErrors ?? {}, error: e.code === 'VALIDATION_FAILED' && Object.keys(e.fieldErrors ?? {}).length ? '' : e.message })) }
  }
  const set = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.value }))
  return (
    <>
      <Card className="grid items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input label={t('From')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label={t('To')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select label={t('Status')} value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: t('All') }, ...Object.entries(STATUS).map(([value, s]) => ({ value, label: t(s.label) }))]} />
        {canManage && <Button icon={Plus} onClick={() => setEdit({ staffId: '', checkInAt: '', checkOutAt: '', reason: '', errors: {} })}>{t('Add by hand')}</Button>}
      </Card>
      {error && <Notice tone="red">{t(error)}</Notice>}
      {rows && !rows.length && <EmptyState icon={CalendarClock} title={t('No attendance in this period')}>{t('Check-ins appear here as soon as they are scanned.')}</EmptyState>}
      {rows?.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13.5px]">
            <thead><tr className="text-start text-[12.5px] text-ink-muted">{['Date', 'Staff', 'Shift', 'In', 'Out', 'Worked', 'Late', 'Early', 'Status', ''].map((h) => <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold">{t(h)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2.5">{r.date}</td>
                  <td className="px-3 py-2.5"><span className="font-semibold text-forest">{r.staff.displayName}</span><span className="block text-[12px] text-ink-muted">{r.staff.code}{r.source === 'MANUAL' ? ` · ${t('added by hand')}` : r.corrected ? ` · ${t('corrected')}` : ''}</span></td>
                  <td className="px-3 py-2.5">{r.shift?.name ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular">{clock(r.checkInAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular">{clock(r.checkOutAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular">{hours(r.workedMinutes)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular">{r.lateMinutes ? `${r.lateMinutes} ${t('min')}` : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular">{r.earlyMinutes ? `${r.earlyMinutes} ${t('min')}` : '—'}</td>
                  <td className="px-3 py-2.5"><Badge tone={STATUS[r.status].tone}>{t(STATUS[r.status].label)}</Badge></td>
                  <td className="px-3 py-2.5">{canManage && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEdit({ id: r.id, name: r.staff.displayName, checkInAt: toLocalInput(r.checkInAt), checkOutAt: toLocalInput(r.checkOutAt), reason: '', errors: {} })}>{t('Correct')}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('Correct attendance') : t('Add attendance by hand')} subtitle={edit?.name} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>{t('Cancel')}</Button><Button onClick={save}>{t('Save')}</Button></>}>
        {edit && (
          <div className="grid gap-3">
            {!edit.id && <Select label={t('Staff member')} value={edit.staffId} onChange={set('staffId')} placeholder={t('Choose')} options={staff.map((s) => ({ value: s.id, label: `${s.displayName} (${s.code})` }))} error={edit.errors.staffId} />}
            <Input label={t('Check-in')} type="datetime-local" value={edit.checkInAt} onChange={set('checkInAt')} error={edit.errors.checkInAt} />
            <Input label={t('Check-out')} type="datetime-local" value={edit.checkOutAt} onChange={set('checkOutAt')} error={edit.errors.checkOutAt} />
            <Input label={t('Reason')} value={edit.reason} onChange={set('reason')} error={edit.errors.reason} hint={t('Kept with the record. The old times are kept too.')} required />
            {edit.error && <p className="text-[13px] text-clay-600" role="alert">{edit.error}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}

function Monthly() {
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { get(`/staff-attendance/summary?month=${month}`).then((r) => { setData(r); setError('') }, (e) => setError(e.message)) }, [month])
  const exportCsv = () => downloadCSV(`staff-attendance-${month}.csv`, data.items.map((r) => ({
    'Employee ID': r.staff.code, Name: r.staff.displayName, Designation: r.staff.title, 'Expected days': r.expectedDays, 'Present days': r.presentDays, 'Absent days': r.absentDays, 'Late count': r.lateCount, 'Late minutes': r.lateMinutes,
    'Early departures': r.earlyCount, 'Early minutes': r.earlyMinutes, 'Worked hours': (r.workedMinutes / 60).toFixed(2), 'Missed check-outs': r.missedCheckouts, Exempt: r.exempt ? 'Yes' : 'No',
  })))
  return (
    <>
      <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
        <Input label={t('Month')} type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <Button variant="secondary" icon={Download} disabled={!data?.items.length} onClick={exportCsv}>{t('Download CSV')}</Button>
      </Card>
      <Notice tone="gold">{t('These are the figures payroll will read. Holidays and approved leave are not in the system yet, so absent days may be too high.')}</Notice>
      {error && <Notice tone="red">{t(error)}</Notice>}
      {data && !data.items.length && <EmptyState icon={Users} title={t('No staff yet')}>{t('Add staff members to see their figures.')}</EmptyState>}
      {data?.items.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13.5px]">
            <thead><tr className="text-[12.5px] text-ink-muted">{['Staff', 'Expected', 'Present', 'Absent', 'Late', 'Early', 'Worked', 'Missed check-outs'].map((h) => <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold">{t(h)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line tabular">
              {data.items.map((r) => (
                <tr key={r.staff.id}>
                  <td className="px-3 py-2.5"><span className="font-semibold text-forest">{r.staff.displayName}</span><span className="block text-[12px] text-ink-muted">{r.staff.code}{r.exempt ? ` · ${t('exempt')}` : ''}</span></td>
                  <td className="px-3 py-2.5">{r.expectedDays}</td><td className="px-3 py-2.5">{r.presentDays}</td><td className="px-3 py-2.5">{r.absentDays}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{r.lateCount ? `${r.lateCount} · ${r.lateMinutes} ${t('min')}` : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{r.earlyCount ? `${r.earlyCount} · ${r.earlyMinutes} ${t('min')}` : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{hours(r.workedMinutes)}</td><td className="px-3 py-2.5">{r.missedCheckouts || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

function Shifts({ canManage }) {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const load = useCallback(() => get('/staff-shifts').then(setData, (e) => toast(e.message, { type: 'error' })), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  const save = async () => {
    const body = { name: form.name, startTime: form.startTime, endTime: form.endTime, graceLateMinutes: Number(form.graceLateMinutes), graceEarlyMinutes: Number(form.graceEarlyMinutes) }
    try {
      if (form.id) await patch(`/staff-shifts/${form.id}`, body); else await post('/staff-shifts', body)
      toast(t('Shift saved'))
      setForm(null)
      load()
    } catch (e) { setForm((f) => ({ ...f, errors: e.fieldErrors ?? {}, error: e.message })) }
  }
  const arrange = async (s, patchBody) => {
    try { setData(await put(`/staff-attendance/staff/${s.id}/arrangement`, patchBody)) } catch (e) { toast(e.message, { type: 'error' }) }
  }
  const toggleShift = (s, id) => arrange(s, { shiftIds: s.shiftIds.includes(id) ? s.shiftIds.filter((x) => x !== id) : [...s.shiftIds, id] })
  const revokeQr = async (s) => {
    if (!window.confirm(t('Cancel the QR codes of {name}? Any code already on their phone stops working.', { name: s.displayName }))) return
    try { await post(`/staff-attendance/staff/${s.id}/revoke-qr`); toast(t('QR codes cancelled')) } catch (e) { toast(e.message, { type: 'error' }) }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const active = data?.shifts.filter((x) => x.active) ?? []
  return (
    <>
      <Card>
        <CardHeader icon={Clock} title={t('Shifts')} subtitle={t('Late and early minutes are counted against these times')} action={canManage && <Button size="sm" icon={Plus} onClick={() => setForm({ name: '', startTime: '08:00', endTime: '14:00', graceLateMinutes: 10, graceEarlyMinutes: 0, errors: {} })}>{t('Add shift')}</Button>} />
        {data && !data.shifts.length && <p className="px-4 pb-4 text-[13.5px] text-ink-muted sm:px-5">{t('No shifts yet. Without a shift, attendance is recorded but nobody is counted late or early.')}</p>}
        <ul className="divide-y divide-line">
          {data?.shifts.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[14px] sm:px-5">
              <span><span className="font-semibold text-forest">{s.name}</span> <span className="text-ink-soft">· {s.startTime}–{s.endTime}</span><span className="block text-[12.5px] text-ink-muted">{t('{a} min grace to arrive, {b} min to leave early · {n} staff', { a: s.graceLateMinutes, b: s.graceEarlyMinutes, n: s.staffCount })}</span></span>
              {canManage && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setForm({ ...s, errors: {} })}>{t('Edit')}</Button>}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader icon={Users} title={t('Staff')} subtitle={t('Only staff with a sign-in account can show a QR code')} />
        <ul className="divide-y divide-line">
          {data?.staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <span className="min-w-[200px] flex-1 text-[14px]"><span className="font-semibold text-forest">{s.displayName}</span><span className="block text-[12.5px] text-ink-muted">{s.code} · {s.title}{s.hasAccount ? '' : ` · ${t('no account')}`}</span></span>
              <fieldset className="flex flex-wrap gap-3" disabled={!canManage}>
                <legend className="sr-only">{t('Shifts of {name}', { name: s.displayName })}</legend>
                {active.map((x) => <label key={x.id} className="flex min-h-[44px] items-center gap-1.5 text-[13.5px]"><input type="checkbox" className="h-5 w-5 accent-primary-700" checked={s.shiftIds.includes(x.id)} onChange={() => toggleShift(s, x.id)} />{x.name}</label>)}
                <label className="flex min-h-[44px] items-center gap-1.5 text-[13.5px]" title={t('Not counted late or early')}><input type="checkbox" className="h-5 w-5 accent-primary-700" checked={s.attendanceExempt} onChange={(e) => arrange(s, { exempt: e.target.checked })} />{t('Exempt')}</label>
              </fieldset>
              {canManage && s.hasAccount && <Button size="sm" variant="secondary" icon={ShieldOff} onClick={() => revokeQr(s)}>{t('Cancel QR')}</Button>}
            </li>
          ))}
        </ul>
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? t('Edit shift') : t('Add shift')} footer={<><Button variant="secondary" onClick={() => setForm(null)}>{t('Cancel')}</Button><Button onClick={save}>{t('Save')}</Button></>}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input className="sm:col-span-2" label={t('Name')} value={form.name} onChange={set('name')} error={form.errors.name} required />
            <Input label={t('Starts')} type="time" value={form.startTime} onChange={set('startTime')} error={form.errors.startTime} />
            <Input label={t('Ends')} type="time" value={form.endTime} onChange={set('endTime')} error={form.errors.endTime} hint={t('An end before the start runs past midnight.')} />
            <Input label={t('Late after (minutes of grace)')} type="number" min={0} max={240} value={form.graceLateMinutes} onChange={set('graceLateMinutes')} />
            <Input label={t('Early before the end by more than (minutes)')} type="number" min={0} max={240} value={form.graceEarlyMinutes} onChange={set('graceEarlyMinutes')} />
            {form.error && !Object.keys(form.errors).length && <p className="text-[13px] text-clay-600 sm:col-span-2" role="alert">{form.error}</p>}
          </div>
        )}
      </Modal>
    </>
  )
}
