import { t } from "../../i18n/I18nProvider"
import { useMemo } from 'react'
import { Download, Printer, Users, CalendarCheck, Sprout, BarChart3, Wallet, AlertCircle, BedDouble, UserRound } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { logEvent } from '../../api/audit'
import { useToast } from '../../context/ToastContext'
import { useQueryState } from '../../hooks/useQueryState'
import { PageHeader, Card, Button, Select, Input, cx } from '../../components/ui'
import { ChartCard, AttendanceRateLine, FeeCollectionChart, HorizontalBars, C } from '../../components/charts/Charts'
import { studentAttendance, learningStatus, currentLevel, studentFees, resultView, attendanceCounts, mentorGroups, recordsFor } from '../../services/selectors'
import { TRACKS, LEARNING_STATUS, FEE_STATUS } from '../../constants/labels'
import { downloadCSV } from '../../utils/csv'
import { addDays, fmtDate, fmtShort, monthKey, fmtMonthShort } from '../../utils/date'
import { money, pct } from '../../utils/format'
import { groupReceipts } from '../../features/fees/FeeViews'

const REPORTS = [
  { id: 'students', label: 'Total students', icon: Users },
  { id: 'attendance', label: 'Attendance trends', icon: CalendarCheck },
  { id: 'learning', label: 'Learning progress', icon: Sprout },
  { id: 'class', label: 'Class performance', icon: BarChart3 },
  { id: 'collections', label: 'Fee collections', icon: Wallet },
  { id: 'dues', label: 'Outstanding dues', icon: AlertCircle },
  { id: 'hostel', label: 'Hostel occupancy', icon: BedDouble },
  { id: 'mentors', label: 'Mentor activity', icon: UserRound },
]

export default function Reports() {
  const { state, idx, today, dispatch } = useStore()
  const toast = useToast()
  const cur = state.settings.currency
  const [rid, setRid] = useQueryState('r', 'students')
  const [from, setFrom] = useQueryState('from', addDays(today, -30))
  const [to, setTo] = useQueryState('to', today)
  const [group, setGroup] = useQueryState('group')
  const students = state.students.filter((s) => (!group || s.groupId === group))
  const active = students.filter((s) => s.status === 'active')
  const inRange = (d) => d >= from && d <= to

  const report = useMemo(() => {
    switch (rid) {
      case 'students': {
        const rows = students.map((s) => ({ ID: s.id, Name: s.name, Halqa: idx.groups[s.groupId]?.name, Track: TRACKS[s.track].label, Gender: s.gender === 'F' ? 'Girl' : 'Boy', Hostel: s.hostel ? 'Yes' : 'No', Admitted: s.admissionDate, Status: s.status }))
        return { rows, chart: <HorizontalBars data={Object.entries(TRACKS).map(([k, v]) => ({ label: v.long, value: active.filter((s) => s.track === k).length }))} />, chartTitle: 'Active students by track', summary: [`${active.length} active`, `${students.length - active.length} inactive`, `${active.filter((s) => s.hostel).length} hostel residents`, `${active.filter((s) => s.gender === 'F').length} girls`] }
      }
      case 'attendance': {
        const days = idx.schoolDays.filter(inRange)
        const rows = active.map((s) => { const a = studentAttendance(state, s.id, { from, to }); return { ID: s.id, Name: s.name, Halqa: idx.groups[s.groupId]?.short, Present: a.present, Late: a.late, Absent: a.absent, Excused: a.excused, 'Rate %': a.rate ?? '' } })
        const trend = days.map((d) => { const c = attendanceCounts(state, d, active); return { label: fmtShort(d), rate: pct(c.attending, c.marked) } })
        const overall = trend.length ? Math.round(trend.reduce((a, t) => a + t.rate, 0) / trend.length) : 0
        return { rows, chart: <div className="h-[200px]"><AttendanceRateLine data={trend} /></div>, chartTitle: 'Daily attendance rate', summary: [`${days.length} school days`, `${overall}% average`, `${rows.filter((r) => r['Rate %'] !== '' && r['Rate %'] < 80).length} students below 80%`] }
      }
      case 'learning': {
        const rows = active.map((s) => { const ls = learningStatus(idx, s.id, today); const recs = recordsFor(idx, s.id).filter((r) => inRange(r.date)); return { ID: s.id, Name: s.name, Halqa: idx.groups[s.groupId]?.short, Level: currentLevel(state, idx, s.id).label, Status: LEARNING_STATUS[ls.key].label, 'Recent avg': ls.avg ?? '', 'Records in range': recs.length, 'Targets met': recs.filter((r) => r.targetStatus === 'met').length } })
        return { rows, chart: <HorizontalBars data={Object.entries(LEARNING_STATUS).map(([k, v]) => ({ label: v.label, value: rows.filter((r) => r.Status === v.label).length, color: { 'on-track': C.green, revision: C.gold, attention: C.red, none: C.muted }[k] }))} />, chartTitle: 'Students by learning status', summary: [`${rows.filter((r) => r.Status === 'On track').length} on track`, `${rows.reduce((a, r) => a + r['Records in range'], 0)} records in range`] }
      }
      case 'class': {
        const rows = state.groups.filter((g) => !group || g.id === group).map((g) => {
          const sts = state.students.filter((s) => s.groupId === g.id && s.status === 'active')
          const rs = state.results.filter((r) => sts.some((s) => s.id === r.studentId)).map((r) => { const ex = state.exams.find((e) => e.id === r.examId); return ex && inRange(ex.date) ? resultView(r, ex, state.grading) : null }).filter(Boolean)
          const attRates = sts.map((s) => studentAttendance(state, s.id, { from, to }).rate).filter((x) => x != null)
          return { Halqa: g.name, Mentor: idx.mentors[g.mentorId]?.name, Students: sts.length, 'Avg exam %': rs.length ? Math.round(rs.reduce((a, r) => a + r.pct, 0) / rs.length) : '', 'Avg attendance %': attRates.length ? Math.round(attRates.reduce((a, b) => a + b, 0) / attRates.length) : '', 'On track': sts.filter((s) => learningStatus(idx, s.id, today).key === 'on-track').length }
        })
        return { rows, chart: <HorizontalBars data={rows.map((r) => ({ label: r.Halqa, value: r['Avg exam %'] || 0, suffix: '%' }))} />, chartTitle: 'Average exam score (exams in range)', summary: [`${rows.length} halqas`] }
      }
      case 'collections': {
        const pays = state.payments.filter((p) => inRange(p.date) && students.some((s) => s.id === p.studentId))
        const rows = groupReceipts(pays).map((r) => ({ Receipt: r.receiptNo, Date: r.date, Student: idx.students[r.studentId]?.name, Method: r.method, Amount: r.amount }))
        const months = [...new Set(state.payments.map((p) => monthKey(p.date)))].sort().slice(-6)
        return { rows, chart: <div className="h-[200px]"><FeeCollectionChart currency={cur} data={months.map((m) => ({ label: fmtMonthShort(m), collected: state.payments.filter((p) => monthKey(p.date) === m && students.some((s) => s.id === p.studentId)).reduce((a, p) => a + p.amount, 0), billed: state.invoices.filter((i) => i.period === m && students.some((s) => s.id === i.studentId)).reduce((a, i) => a + i.amount, 0) }))} /></div>, chartTitle: 'Billed vs collected by month', summary: [`${rows.length} receipts`, `${money(rows.reduce((a, r) => a + r.Amount, 0), cur)} collected in range`] }
      }
      case 'dues': {
        const rows = students.map((s) => ({ s, f: studentFees(state, idx, s.id, today) })).filter((x) => x.f.balance > 0).sort((a, b) => b.f.overdue - a.f.overdue).map(({ s, f }) => ({ ID: s.id, Name: s.name, Halqa: idx.groups[s.groupId]?.short, Guardian: idx.parents[s.guardianId]?.name, Phone: idx.parents[s.guardianId]?.phone, Outstanding: f.balance, Overdue: f.overdue, Status: FEE_STATUS[f.status].label, 'Oldest due': f.open[0]?.dueDate }))
        return { rows, chart: <HorizontalBars fmt={(v) => money(v, cur)} data={state.groups.filter((g) => !group || g.id === group).map((g) => ({ label: g.name, value: rows.filter((r) => r.Halqa === g.short).reduce((a, r) => a + r.Outstanding, 0), color: C.red }))} />, chartTitle: 'Outstanding by halqa', summary: [`${rows.length} students with dues`, `${money(rows.reduce((a, r) => a + r.Outstanding, 0), cur)} outstanding`, `${money(rows.reduce((a, r) => a + r.Overdue, 0), cur)} overdue`] }
      }
      case 'hostel': {
        const rows = state.rooms.map((r) => { const beds = state.beds.filter((b) => b.roomId === r.id); return { Room: r.id, Block: r.block, Beds: beds.length, Occupied: beds.filter((b) => b.studentId).length, Available: beds.filter((b) => !b.studentId).length, Residents: beds.filter((b) => b.studentId).map((b) => idx.students[b.studentId]?.name).join('; ') } })
        const occ = rows.reduce((a, r) => a + r.Occupied, 0), total = rows.reduce((a, r) => a + r.Beds, 0)
        return { rows, chart: <HorizontalBars data={rows.map((r) => ({ label: r.Room, value: r.Occupied, suffix: `/${r.Beds}`, color: C.blue }))} />, chartTitle: 'Occupied beds per room', summary: [`${occ}/${total} beds occupied`, `${pct(occ, total)}% occupancy`] }
      }
      case 'mentors': {
        const days = idx.schoolDays.filter(inRange)
        const rows = state.mentors.map((m) => {
          const gs = mentorGroups(state, m.id)
          const sts = state.students.filter((s) => gs.some((g) => g.id === s.groupId) && s.status === 'active')
          const recs = state.sabaq.filter((r) => r.mentorId === m.id && inRange(r.date))
          const markedDays = days.filter((d) => sts.some((s) => state.attendance[d]?.[s.id])).length
          return { Mentor: m.name, Status: m.status, Halqas: gs.map((g) => g.short).join(', '), Students: sts.length, 'Sabaq records': recs.length, 'Follow-ups flagged': recs.filter((r) => r.followUp).length, 'Attendance days marked': `${markedDays}/${days.length}` }
        })
        return { rows, chart: <HorizontalBars data={rows.filter((r) => r.Students).map((r) => ({ label: r.Mentor, value: r['Sabaq records'] }))} />, chartTitle: 'Sabaq records saved in range', summary: [`${rows.reduce((a, r) => a + r['Sabaq records'], 0)} records`, `${days.length} school days`] }
      }
      default: return { rows: [], summary: [] }
    }
  }, [rid, from, to, group, state, idx, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const meta = REPORTS.find((r) => r.id === rid)
  const cols = report.rows[0] ? Object.keys(report.rows[0]) : []
  const exportCsv = () => {
    downloadCSV(`${rid}-report-${from}-to-${to}`, report.rows)
    logEvent('export.csv', `${meta.label} report`, `${report.rows.length} rows · ${from} to ${to}`)
    toast('CSV downloaded', { description: `${report.rows.length} rows` })
  }

  return (
    <div>
      <PageHeader title={t("Reports")} subtitle={t("Filter by date and halqa · export CSV or print")}
        actions={<><Button variant="secondary" icon={Printer} onClick={() => window.print()}>{t("Print")}</Button><Button icon={Download} onClick={exportCsv} disabled={!report.rows.length}>{t("Export CSV")}</Button></>} />
      <div className="no-print -mx-4 mb-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <div className="flex gap-1.5 lg:grid lg:grid-cols-4">
          {REPORTS.map((r) => (
            <button key={r.id} type="button" onClick={() => setRid(r.id)} aria-pressed={rid === r.id}
              className={cx('flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold transition', rid === r.id ? 'border-primary-700 bg-primary-700 text-white' : 'border-line bg-white text-ink-soft hover:border-primary-300')}>
              <r.icon size={16} /> {t(r.label)}
            </button>
          ))}
        </div>
      </div>
      <Card className="no-print mb-4 grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:p-4">
        <Input label={t("From")} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <Input label={t("To")} type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
        <Select className="col-span-2 sm:col-span-1" label={t("Halqa")} value={group} onChange={(e) => setGroup(e.target.value)} placeholder={t("All halqas")} options={state.groups.map((g) => ({ value: g.id, label: g.name }))} />
      </Card>

      <div className="print-area space-y-4">
        <div className="hidden print:block"><h2 className="text-[18px] font-bold">{state.settings.brandName} — {meta.label}</h2><p className="text-[12px]">{fmtDate(from)} {t("to")} {fmtDate(to)}{group ? ` · ${idx.groups[group].name}` : ''}</p></div>
        <div className="flex flex-wrap gap-2">{report.summary.map((s) => <span key={s} className="chip bg-white px-3 py-1.5 text-[13px] text-forest ring-1 ring-line">{t(s)}</span>)}</div>
        {report.chart && <Card className="print-break p-4 sm:p-5"><h3 className="section-title mb-3">{t(report.chartTitle)}</h3>{report.chart}</Card>}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto" data-lenis-prevent>
            <table className="w-full min-w-[560px] text-start text-[13px]">
              <thead className="bg-sage-50 text-[11.5px] uppercase tracking-wide text-ink-muted"><tr>{cols.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2.5 font-semibold">{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {report.rows.map((r, i) => <tr key={i} className="hover:bg-ivory-50">{cols.map((c) => <td key={c} className="px-3 py-2 tabular">{typeof r[c] === 'number' && /Amount|Outstanding|Overdue/.test(c) ? money(r[c], cur) : r[c]}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {!report.rows.length && <p className="p-6 text-center text-[13.5px] text-ink-muted">{t("No data for these filters.")}</p>}
          <p className="border-t border-line px-4 py-2 text-[12px] text-ink-muted">{report.rows.length} {t("rows · scroll sideways on small screens")}</p>
        </Card>
      </div>
    </div>
  )
}
