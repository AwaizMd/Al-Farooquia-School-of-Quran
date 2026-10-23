import { t } from "../../i18n/I18nProvider"
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCheck, Save, AlertTriangle, CalendarDays, Users, Download } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { useQueryState } from '../../hooks/useQueryState'
import { useVisibleStudents } from '../../hooks/useScope'
import { PageHeader, Card, CardHeader, Tabs, Input, Select, Button, Avatar, EmptyState, Notice, cx, LinkRow } from '../../components/ui'
import { AttendanceBadge } from '../../components/cards/StatusBadges'
import { ChartCard, AttendanceRateLine } from '../../components/charts/Charts'
import { attendanceCounts, repeatedAbsences, mentorGroups, latestSchoolDay } from '../../services/selectors'
import { ATTENDANCE } from '../../constants/labels'
import { fmtDay, fmtShort, fmtMonth, monthKey, weekday, fromISO } from '../../utils/date'
import { pct } from '../../utils/format'
import { downloadCSV } from '../../utils/csv'

const STATUS_BTN = {
  present: 'border-primary-600 bg-primary-600 text-white',
  late: 'border-gold-500 bg-gold-500 text-white',
  absent: 'border-clay-500 bg-clay-500 text-white',
  excused: 'border-slateblue-500 bg-slateblue-500 text-white',
}

export default function Attendance() {
  const { state } = useStore()
  const role = state.session.role
  const [tab, setTab] = useQueryState('tab', role === 'admin' ? 'overview' : 'mark')
  return (
    <div>
      <PageHeader title={t("Attendance")} subtitle={role === 'admin' ? 'Daily overview, halqa summaries and history' : 'Mark and review your halqa attendance'} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[...(role === 'admin' ? [{ value: 'overview', label: 'Overview' }] : []), { value: 'mark', label: 'Mark attendance' }, { value: 'monthly', label: 'Monthly summary' }]} />
      {tab === 'overview' && role === 'admin' && <Overview />}
      {tab === 'mark' && <MarkAttendance />}
      {tab === 'monthly' && <Monthly />}
    </div>
  )
}

function Overview() {
  const { state, idx, today } = useStore()
  const days = idx.schoolDays.filter((d) => d <= today)
  const [date, setDate] = useQueryState('date', latestSchoolDay(idx, today))
  const [status, setStatus] = useQueryState('status')
  const [group, setGroup] = useQueryState('group')
  const active = state.students.filter((s) => s.status === 'active')
  const c = attendanceCounts(state, date, active)
  const alerts = repeatedAbsences(state, idx, today, active)
  const list = active.filter((s) => (!group || s.groupId === group) && (!status || (status === 'unmarked' ? !state.attendance[date]?.[s.id] : status === 'present' ? ['present', 'late'].includes(state.attendance[date]?.[s.id]) : state.attendance[date]?.[s.id] === status)))
  const trend = days.slice(-20).map((d) => { const x = attendanceCounts(state, d, active); return { label: fmtShort(d), rate: pct(x.attending, x.marked) } })
  const heatDays = days.slice(-10)

  const exportCsv = () => downloadCSV(`attendance-${date}`, active.map((s) => ({ Date: date, ID: s.id, Name: s.name, Halqa: idx.groups[s.groupId]?.name, Status: ATTENDANCE[state.attendance[date]?.[s.id]]?.label || 'Not marked' })))

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:p-4">
        <Select className="sm:w-60" label={t("Date")} value={date} onChange={(e) => setDate(e.target.value)} options={[...days].reverse().map((d) => ({ value: d, label: `${fmtDay(d)}${d === today ? ' (today)' : ''}` }))} />
        <Select className="sm:w-60" label={t("Halqa")} value={group} onChange={(e) => setGroup(e.target.value)} placeholder={t("All halqas")} options={state.groups.map((g) => ({ value: g.id, label: g.name }))} />
        <div className="flex-1" />
        <Button variant="secondary" icon={Download} onClick={exportCsv}>{t("Export day CSV")}</Button>
      </Card>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {[['present', 'Present', c.attending, 'text-primary-700', `${c.late} late`], ['absent', 'Absent', c.absent, 'text-clay-600'], ['late', 'Late', c.late, 'text-gold-700'], ['excused', 'Excused', c.excused, 'text-slateblue-600'], ['unmarked', 'Not marked', c.unmarked, 'text-ink-soft']].map(([k, label, v, color, sub]) => (
          <button key={k} type="button" onClick={() => setStatus(status === k ? '' : k)} aria-pressed={status === k}
            className={cx('card p-3.5 text-start transition hover:shadow-lift', status === k && 'ring-2 ring-primary-500')}>
            <p className="text-[12.5px] font-semibold text-ink-muted">{t(label)}</p>
            <p className={cx('mt-1 text-[24px] font-extrabold tabular', color)}>{v}</p>
            <p className="text-[11.5px] text-ink-muted">{sub || `${pct(v, c.total)}% of ${c.total}`}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t("Halqa-wise attendance")} subtitle={fmtDay(date)} icon={Users} />
          <ul className="mt-2 divide-y divide-line">
            {state.groups.map((g) => {
              const gc = attendanceCounts(state, date, active.filter((s) => s.groupId === g.id))
              return (
                <li key={g.id}>
                  <button type="button" onClick={() => setGroup(group === g.id ? '' : g.id)} className={cx('w-full px-4 py-3 text-start hover:bg-ivory-50 sm:px-5', group === g.id && 'bg-primary-50/60')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[14px] font-bold text-forest">{t(g.name)}</p>
                      <p className="text-[13px] font-bold tabular text-forest">{gc.marked ? `${pct(gc.attending, gc.marked)}%` : 'Not marked'}</p>
                    </div>
                    <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-sage-100" aria-hidden>
                      {['present', 'late', 'excused', 'absent'].map((k) => <div key={k} className={STATUS_BTN[k].split(' ')[1]} style={{ width: `${pct(gc[k], gc.total)}%` }} />)}
                    </div>
                    <p className="mt-1 text-[12px] text-ink-muted">P {gc.present} · L {gc.late} · A {gc.absent} · E {gc.excused}{gc.unmarked ? ` · ${gc.unmarked} not marked` : ''}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={t("Repeated absence alerts")} subtitle="3 or more absences in the last 7 school days" icon={AlertTriangle} />
          {alerts.length ? (
            <ul className="mt-2 divide-y divide-line">
              {alerts.map(({ student, count }) => (
                <li key={student.id}>
                  <LinkRow to={`/students/${student.id}?tab=attendance`}>
                    <div className="flex items-center gap-3">
                      <Avatar name={student.name} size={34} />
                      <div className="min-w-0"><p className="truncate text-[14px] font-bold text-forest">{student.name}</p><p className="text-[12px] text-clay-600">{count} absences · {t(idx.groups[student.groupId]?.short)}</p></div>
                    </div>
                  </LinkRow>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t("No repeated absences")} />}
        </Card>
      </div>

      <Card>
        <CardHeader title={`${t('Students')}${status ? ` · ${t(status === 'unmarked' ? 'Not marked' : status === 'present' ? 'Present (incl. late)' : ATTENDANCE[status].label)}` : ''}${group ? ` · ${t(idx.groups[group].short)}` : ''}`} subtitle={`${list.length} students on ${fmtDay(date)}`}
          action={(status || group) && <Button size="sm" variant="ghost" onClick={() => { setStatus(''); setGroup('') }}>{t("Clear")}</Button>} />
        {list.length ? (
          <ul className="mt-2 grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
            {list.map((s) => (
              <li key={s.id} className="sm:border-b sm:border-line">
                <Link to={`/students/${s.id}?tab=attendance`} className="flex min-h-[52px] items-center gap-3 px-4 py-2 hover:bg-ivory-50 sm:px-5">
                  <Avatar name={s.name} size={32} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold text-forest">{s.name}</span><span className="block text-[11.5px] text-ink-muted">{t(idx.groups[s.groupId]?.short)}</span></span>
                  <AttendanceBadge status={state.attendance[date]?.[s.id]} />
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState title={t("No students in this view")} />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t("Attendance rate")} subtitle={t("Present + late as a share of marked students, last 20 school days")}>
          <AttendanceRateLine data={trend} />
        </ChartCard>
        <Card>
          <CardHeader title={t("Halqa heatmap")} subtitle={t("Attendance rate, last 10 school days")} icon={CalendarDays} />
          <div className="overflow-x-auto px-4 pb-4 pt-3 sm:px-5">
            <table className="w-full min-w-[440px] border-separate border-spacing-1 text-center text-[11px]">
              <thead><tr><th className="text-start font-semibold text-ink-muted">{t("Halqa")}</th>{heatDays.map((d) => <th key={d} className="font-semibold text-ink-muted">{fromISO(d).getDate()}</th>)}</tr></thead>
              <tbody>
                {state.groups.map((g) => (
                  <tr key={g.id}>
                    <td className="whitespace-nowrap pe-2 text-start font-semibold text-ink-soft">{t(g.short)}</td>
                    {heatDays.map((d) => {
                      const x = attendanceCounts(state, d, active.filter((s) => s.groupId === g.id))
                      const r = x.marked ? pct(x.attending, x.marked) : null
                      const bg = r == null ? '#F6F2E8' : r >= 95 ? '#0E8060' : r >= 85 ? '#5FA889' : r >= 70 ? '#B98A2E' : '#C0553D'
                      return <td key={d}><button type="button" onClick={() => { setDate(d); setGroup(g.id) }} title={`${g.short} · ${fmtDay(d)}: ${r == null ? 'not marked' : `${r}%`}`} className="h-8 w-full rounded-md text-[10.5px] font-bold text-white" style={{ background: bg, color: r == null ? '#9AA19B' : '#fff' }}>{r ?? '–'}</button></td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11.5px] text-ink-muted">{t("Numbers are percentages. Tap a cell to open that day and halqa.")}</p>
          </div>
        </Card>
      </div>
    </div>
  )
}

function MarkAttendance() {
  const { state, idx, dispatch, today } = useStore()
  const toast = useToast()
  const role = state.session.role
  const groups = role === 'admin' ? state.groups : mentorGroups(state, state.session.userId)
  const [date, setDate] = useState(today)
  const [group, setGroup] = useState(groups[0]?.id || '')
  const students = state.students.filter((s) => s.groupId === group && s.status === 'active' && s.admissionDate <= date)
  const saved = state.attendance[date] || {}
  const [draft, setDraft] = useState({})
  useEffect(() => setDraft(Object.fromEntries(students.map((s) => [s.id, saved[s.id] || null]))), [date, group, state.attendance]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = students.some((s) => draft[s.id] !== (saved[s.id] || null))
  const counts = Object.keys(ATTENDANCE).reduce((a, k) => ({ ...a, [k]: students.filter((s) => draft[s.id] === k).length }), {})
  const missing = students.filter((s) => !draft[s.id]).length
  const isOff = weekday(date) === state.settings.weeklyOff

  const save = () => {
    if (date > today) return toast('Attendance cannot be marked for a future date', { type: 'error' })
    if (missing) return toast(`${missing} student${missing > 1 ? 's are' : ' is'} not marked yet`, { type: 'error', description: 'Choose a status for every student, or use "All present".' })
    const statuses = Object.fromEntries(students.map((s) => [s.id, draft[s.id]]))
    dispatch({ type: 'SAVE_ATTENDANCE', date, statuses, label: idx.groups[group].name })
    toast('Attendance saved', { description: `${idx.groups[group].name} · ${fmtDay(date)}` })
  }

  if (!groups.length) return <Card><EmptyState title={t("No halqa assigned")}>{t("Ask the administrator to assign you a halqa.")}</EmptyState></Card>

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <Card className="grid gap-3 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-4">
        <Input label={t("Date")} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        <Select label={t("Halqa")} value={group} onChange={(e) => setGroup(e.target.value)} options={groups.map((g) => ({ value: g.id, label: g.name }))} />
        <Button variant="soft" icon={CheckCheck} onClick={() => setDraft(Object.fromEntries(students.map((s) => [s.id, draft[s.id] && draft[s.id] !== 'present' ? draft[s.id] : 'present'])))}>{t("All present")}</Button>
      </Card>
      {isOff && <Notice tone="gold">{t("This date is the weekly holiday. You can still record attendance for special classes.")}</Notice>}
      {Object.keys(saved).some((id) => students.some((s) => s.id === id)) && !dirty && <Notice tone="green" icon={CheckCheck}>{t('Attendance for this halqa is saved for {date}. Changes will update the record.', { date: fmtDay(date) })}</Notice>}

      <div className="grid grid-cols-4 gap-2">
        {Object.entries(ATTENDANCE).map(([k, v]) => (
          <div key={k} className="card px-2 py-2.5 text-center"><p className="text-[11.5px] font-semibold text-ink-muted">{t(v.label)}</p><p className="text-[20px] font-extrabold tabular text-forest">{counts[k]}</p></div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {students.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={s.name} size={36} />
                <div className="min-w-0"><p className="truncate text-[14px] font-bold text-forest">{s.name}</p><p className="text-[11.5px] text-ink-muted">{s.id}</p></div>
              </div>
              <div role="radiogroup" aria-label={`Attendance for ${s.name}`} className="grid grid-cols-4 gap-1.5 sm:w-[300px]">
                {Object.entries(ATTENDANCE).map(([k, v]) => (
                  <button key={k} type="button" role="radio" aria-checked={draft[s.id] === k} onClick={() => setDraft((d) => ({ ...d, [s.id]: k }))}
                    className={cx('min-h-[44px] rounded-xl border text-[12.5px] font-bold transition', draft[s.id] === k ? STATUS_BTN[k] : 'border-line-strong bg-white text-ink-soft hover:border-primary-300')}>
                    {t(v.label)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {!students.length && <EmptyState title={t("No students for this date")} />}
      </Card>

      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-white/95 px-4 py-2.5 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-6xl items-center gap-3 lg:justify-end">
          <p className="flex-1 text-[12.5px] text-ink-muted lg:flex-none">{missing ? t('{n} not marked', { n: missing }) : dirty ? t('Unsaved changes') : t('Up to date')}</p>
          <Button icon={Save} onClick={save} disabled={!dirty && !missing}>{t("Save attendance")}</Button>
        </div>
      </div>
    </div>
  )
}

function Monthly() {
  const { state, idx, today } = useStore()
  const students = useVisibleStudents().filter((s) => s.status === 'active')
  const months = [...new Set(idx.schoolDays.filter((d) => d <= today).map(monthKey))].reverse()
  const [month, setMonth] = useState(months[0])
  const days = idx.schoolDays.filter((d) => monthKey(d) === month && d <= today)
  const rows = students.map((s) => {
    const c = { present: 0, late: 0, absent: 0, excused: 0, days: 0 }
    days.forEach((d) => { const v = state.attendance[d]?.[s.id]; if (v) { c[v]++; c.days++ } })
    return { s, ...c, rate: c.days ? pct(c.present + c.late, c.days) : null }
  }).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101))
  const exportCsv = () => downloadCSV(`attendance-${month}`, rows.map((r) => ({ ID: r.s.id, Name: r.s.name, Halqa: idx.groups[r.s.groupId]?.name, Present: r.present, Late: r.late, Absent: r.absent, Excused: r.excused, 'Days recorded': r.days, 'Rate %': r.rate ?? '' })))
  return (
    <Card>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
        <Select className="sm:w-56" label={t("Month")} value={month} onChange={(e) => setMonth(e.target.value)} options={months.map((m) => ({ value: m, label: fmtMonth(m) }))} />
        <p className="flex-1 text-[13px] text-ink-muted">{t('{n} school days recorded · lowest attendance first', { n: days.length })}</p>
        <Button variant="secondary" icon={Download} onClick={exportCsv}>{t("Export CSV")}</Button>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <li key={r.s.id}>
            <Link to={`/students/${r.s.id}?tab=attendance`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ivory-50 sm:px-5">
              <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold text-forest">{r.s.name}</p><p className="text-[11.5px] text-ink-muted">P {r.present} · L {r.late} · A {r.absent} · E {r.excused}</p></div>
              <span className={cx('text-[15px] font-extrabold tabular', r.rate == null ? 'text-ink-muted' : r.rate < 80 ? 'text-clay-600' : r.rate < 90 ? 'text-gold-700' : 'text-primary-700')}>{r.rate == null ? '—' : `${r.rate}%`}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
