import { t } from "../../i18n/I18nProvider"
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, UserRound, UserCheck, UserX, Wallet, AlertCircle, BedDouble, HeartPulse, UserPlus, CalendarCheck,
  BookOpenCheck, Receipt, FileText, CalendarClock, ClipboardCheck, ChevronRight, Activity,
} from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { Card, CardHeader, Stat, Stagger, staggerItem, Button, Dot, EmptyState, StarMotif } from '../../components/ui'
import { ChartCard, AttendanceTrendChart, ATTENDANCE_LEGEND, FeeCollectionChart, DonutChart, HorizontalBars, C } from '../../components/charts/Charts'
import { attendanceCounts, feeTotals, learningStatus, actionItems, hostelSummary, latestSchoolDay } from '../../services/selectors'
import { money, compactMoney, pct } from '../../utils/format'
import { fmtLong, fmtMonthShort, fmtDateTime, fromISO } from '../../utils/date'
import { LEARNING_STATUS } from '../../constants/labels'

const KIND_ICON = { attendance: UserX, learning: HeartPulse, fees: Wallet, exam: CalendarClock, review: ClipboardCheck, mentor: UserRound, hostel: BedDouble }
const TONE_BG = { red: 'bg-clay-50 text-clay-600', amber: 'bg-amber-50 text-amber-700', gold: 'bg-gold-50 text-gold-700', blue: 'bg-slateblue-50 text-slateblue-600', green: 'bg-primary-50 text-primary-700' }

export default function AdminDashboard() {
  const { state, idx, today } = useStore()
  const navigate = useNavigate()
  const cur = state.settings.currency

  const d = useMemo(() => {
    const active = state.students.filter((s) => s.status === 'active')
    const day = latestSchoolDay(idx, today)
    const att = attendanceCounts(state, day, active)
    const fees = feeTotals(state, idx, today)
    const statuses = active.map((s) => learningStatus(idx, s.id, today).key)
    const statusCount = Object.fromEntries(Object.keys(LEARNING_STATUS).map((k) => [k, statuses.filter((x) => x === k).length]))
    const week = idx.schoolDays.filter((x) => x <= today).slice(-7).map((date) => {
      const c = attendanceCounts(state, date, active)
      return { label: fromISO(date).toLocaleDateString('en-GB', { weekday: 'short' }), date, present: c.present, late: c.late, absent: c.absent, excused: c.excused }
    })
    const hostel = hostelSummary(state, idx)
    const totalBilled = state.invoices.reduce((a, i) => a + i.amount, 0)
    return { active, day, att, fees, statusCount, week, hostel, items: actionItems(state, idx, today), totalBilled }
  }, [state, idx, today])

  const attentionCount = d.statusCount.attention + d.statusCount.revision
  const groups = state.groups.map((g) => ({ id: g.id, label: g.name, value: d.active.filter((s) => s.groupId === g.id).length }))

  const quick = [
    { label: 'Add Student', icon: UserPlus, to: '/students/new' },
    { label: 'Add Mentor', icon: UserRound, to: '/mentors?new=1' },
    { label: 'Record Attendance', icon: CalendarCheck, to: '/attendance?tab=mark' },
    { label: 'Record Sabaq', icon: BookOpenCheck, to: '/sabaq/new' },
    { label: 'Add Fee Payment', icon: Receipt, to: '/fees?pay=1' },
    { label: 'Progress Report', icon: FileText, to: '/progress-report' },
  ]

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Greeting */}
      <section className="pattern-stars relative overflow-hidden rounded-3xl border border-line bg-white px-4 py-4 sm:px-6 sm:py-5">
        <StarMotif className="absolute -end-6 -top-6 h-32 w-32 text-gold-200" strokeWidth={0.8} />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p lang="ar" dir="rtl" className="align-page text-[18px] text-gold-600 sm:text-[20px]">السَّلَامُ عَلَيْكُمْ</p>
            <h1 className="text-[21px] font-extrabold sm:text-[25px]">{t("Madarsa overview")}</h1>
            <p className="text-[13.5px] text-ink-muted">{fmtLong(today)} · {t("{marked} of {total} students marked today", { marked: d.att.marked, total: d.att.total })}</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-sage-50 px-3.5 py-2.5">
            <Activity size={18} className="text-primary-600" />
            <p className="text-[13px] text-ink-soft">{t("{n} items need your attention", { n: d.items.length })}</p>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <Stagger className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Students', value: d.active.length, sub: t("{n} halqas", { n: state.groups.length }), icon: Users, to: '/students' },
          { label: 'Active Mentors', value: state.mentors.filter((m) => m.status === 'active').length, sub: t("{n} inactive", { n: state.mentors.filter((m) => m.status !== 'active').length }), icon: UserRound, to: '/mentors' },
          { label: 'Present Today', value: d.att.attending, sub: t("{late} late · {pct}% of marked", { late: d.att.late, pct: pct(d.att.attending, d.att.marked) }), icon: UserCheck, to: '/attendance?status=present' },
          { label: 'Absent Today', value: d.att.absent, sub: t("{excused} excused · {unmarked} not marked", { excused: d.att.excused, unmarked: d.att.unmarked }), icon: UserX, tone: 'red', to: '/attendance?status=absent' },
          { label: 'Collected This Month', value: compactMoney(d.fees.collectedThisMonth, cur), sub: t("{pct}% of this month's billing", { pct: pct(d.fees.collectedThisMonth, d.fees.billedThisMonth) }), icon: Wallet, tone: 'gold', to: '/fees' },
          { label: 'Outstanding Fees', value: compactMoney(d.fees.outstanding, cur), sub: t("{amount} overdue", { amount: money(d.fees.overdue, cur) }), icon: AlertCircle, tone: 'red', to: '/fees?status=overdue' },
          { label: 'Hostel Residents', value: d.hostel.residents.length, sub: t("{n} beds free", { n: d.hostel.available }), icon: BedDouble, tone: 'blue', to: '/hostel' },
          { label: 'Need Attention', value: attentionCount, sub: t("{a} urgent · {b} revision", { a: d.statusCount.attention, b: d.statusCount.revision }), icon: HeartPulse, tone: 'amber', to: '/students?learning=attention' },
        ].map((k) => <motion.div key={k.label} variants={staggerItem}><Stat {...k} /></motion.div>)}
      </Stagger>

      {/* Quick actions */}
      <section aria-label={t("Quick actions")} className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <div className="flex gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-6">
          {quick.map((q) => (
            <Link key={q.label} to={q.to} className="flex min-h-[48px] shrink-0 items-center gap-2 rounded-2xl border border-line bg-white px-3.5 text-[13.5px] font-semibold text-forest shadow-card transition hover:border-primary-300 hover:bg-primary-50">
              <q.icon size={17} className="text-primary-600" /> {t(q.label)}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Action centre */}
        <Card className="lg:col-span-2">
          <CardHeader title={t("Action centre")} subtitle={t("Decisions and follow-ups for today")} icon={ClipboardCheck} />
          {d.items.length ? (
            <ul className="mt-2 divide-y divide-line">
              {d.items.slice(0, 9).map((it) => {
                const Icon = KIND_ICON[it.kind] || AlertCircle
                return (
                  <li key={it.id}>
                    <Link to={it.to} className="group flex min-h-[56px] items-center gap-3 px-4 py-2.5 hover:bg-ivory-50 sm:px-5">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE_BG[it.tone]}`}><Icon size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold leading-snug text-forest">{it.title}</span>
                        <span className="block truncate text-[12px] text-ink-muted">{it.meta}</span>
                      </span>
                      <ChevronRight size={17} className="shrink-0 text-ink-muted/60 group-hover:text-primary-600" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : <EmptyState title={t("All clear")}>{t("No pending actions right now.")}</EmptyState>}
          {d.items.length > 9 && <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-muted">{t("+{n} more items", { n: d.items.length - 9 })}</p>}
        </Card>

        <div className="grid gap-5 lg:col-span-3">
          <ChartCard title={t("Weekly attendance")} subtitle={t("Last 7 school days · all halqas")} legend={ATTENDANCE_LEGEND}
            action={<Button size="sm" variant="ghost" to="/attendance">{t("Details")}</Button>}>
            <AttendanceTrendChart data={d.week} />
          </ChartCard>
          <ChartCard title={t("Monthly fee collection")} subtitle={t("Billed vs collected, by month")}
            legend={[{ label: 'Billed', color: '#D3E0D5' }, { label: 'Collected', color: C.green }]}
            action={<Button size="sm" variant="ghost" to="/fees">{t("Fees")}</Button>}>
            <FeeCollectionChart currency={cur} data={d.fees.byMonth.map((m) => ({ label: fmtMonthShort(m.month), billed: m.billed, collected: m.collected }))} />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <ChartCard title={t("Learning progress")} subtitle={t("Based on each student's last 5 records")} height={200}
          footer={<div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {[['on-track', C.green], ['revision', C.gold], ['attention', C.red], ['none', C.muted]].map(([k, c]) => (
              <Link key={k} to={`/students?learning=${k}`} className="flex items-center gap-1.5 hover:text-primary-700"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{t(LEARNING_STATUS[k].label)} <b className="text-forest">{d.statusCount[k]}</b></Link>
            ))}
          </div>}>
          <DonutChart data={[
            { name: 'On track', value: d.statusCount['on-track'], color: C.green },
            { name: 'Needs revision', value: d.statusCount.revision, color: C.gold },
            { name: 'Needs attention', value: d.statusCount.attention, color: C.red },
            { name: 'No recent record', value: d.statusCount.none, color: C.muted },
          ]} center={(tot) => <><span className="text-[22px] font-extrabold text-forest">{pct(d.statusCount['on-track'], tot)}%</span><span className="text-[11.5px] text-ink-muted">{t("on track")}</span></>} />
        </ChartCard>

        <ChartCard title={t("Collected vs outstanding")} subtitle={t("All billed fees in the demo period")} height={200}
          footer={<div className="flex flex-wrap justify-between gap-2">
            <span className="flex items-center gap-1.5"><Dot tone="green" /> {t("Collected")} <b className="text-forest">{money(d.totalBilled - d.fees.outstanding, cur)}</b></span>
            <span className="flex items-center gap-1.5"><Dot tone="red" /> {t("Outstanding")} <b className="text-forest">{money(d.fees.outstanding, cur)}</b></span>
          </div>}>
          <DonutChart fmt={(v) => money(v, cur)} data={[
            { name: 'Collected', value: d.totalBilled - d.fees.outstanding, color: C.green },
            { name: 'Outstanding', value: d.fees.outstanding, color: C.red },
          ]} center={(tot) => <><span className="text-[22px] font-extrabold text-forest">{pct(tot - d.fees.outstanding, tot)}%</span><span className="text-[11.5px] text-ink-muted">{t("collected")}</span></>} />
        </ChartCard>

        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader title={t("Students by halqa")} subtitle={t("Tap a halqa to see its students")} icon={Users} />
          <div className="px-4 pb-4 pt-3 sm:px-5">
            <HorizontalBars data={groups} onSelect={(g) => navigate(`/students?group=${g.id}`)} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("Recent activity")} subtitle={t("Simulated activity log")} icon={Activity} action={<Button size="sm" variant="ghost" to="/audit">{t("View all")}</Button>} />
        <ul className="mt-2 divide-y divide-line">
          {state.audit.slice(0, 5).map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <Dot tone={a.role === 'admin' ? 'gold' : a.role === 'parent' ? 'blue' : 'green'} />
              <div className="-mt-1 min-w-0 flex-1">
                <p className="text-[13.5px] text-forest"><span className="font-bold">{t(a.action)}</span> · {t(a.entity)}</p>
                <p className="truncate text-[12px] text-ink-muted">{a.actor} · {fmtDateTime(a.ts)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
