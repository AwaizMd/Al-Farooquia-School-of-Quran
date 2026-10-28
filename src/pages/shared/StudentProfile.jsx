import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil, BookOpenCheck, Phone, MapPin, CalendarDays, BedDouble, Wallet, Users, ClipboardList, Target, HeartPulse, Printer, Receipt, Mail, Droplet } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useQueryState } from '../../hooks/useQueryState'
import { PageHeader, Card, CardHeader, Avatar, Badge, Button, Tabs, ProgressBar, EmptyState, Stat, LinkRow } from '../../components/ui'
import { AttendanceBadge, LearningBadge, FeeBadge } from '../../components/cards/StatusBadges'
import { LearningTimeline } from '../../features/sabaq/SabaqViews'
import AttendanceCalendar from '../../features/students/AttendanceCalendar'
import { FeeSummary, InvoiceList, PaymentHistory, ReceiptModal, RecordPaymentModal } from '../../features/fees/FeeViews'
import { Forbidden, NotFound } from './Fallbacks'
import {
  canSeeStudent, currentLevel, learningStatus, latestTarget, recordsFor, studentAttendance, studentFees, mentorOfStudent,
  resultView, latestSchoolDay, hostelAlerts,
} from '../../services/selectors'
import { TRACKS, ATTENDANCE } from '../../constants/labels'
import { fmtDate, ageFrom, addDays, fmtDay } from '../../utils/date'
import { money } from '../../utils/format'

export default function StudentProfile() {
  const { id } = useParams()
  const { state, idx, today } = useStore()
  const [tab, setTab] = useQueryState('tab', 'overview')
  const [receipt, setReceipt] = useState(null)
  const [pay, setPay] = useState(false)
  const st = idx.students[id]
  if (!st) return <NotFound />
  if (!canSeeStudent(state, idx, id)) return <Forbidden />
  const role = state.session.role
  const cur = state.settings.currency
  const group = idx.groups[st.groupId]
  const mentor = mentorOfStudent(idx, st)
  const guardian = idx.parents[st.guardianId]
  const level = currentLevel(state, idx, id)
  const ls = learningStatus(idx, id, today)
  const att30 = studentAttendance(state, id, { from: addDays(today, -30) })
  const attAll = studentAttendance(state, id)
  const fees = studentFees(state, idx, id)
  const records = recordsFor(idx, id)
  const bed = idx.bedByStudent[id]
  const results = state.results.filter((r) => r.studentId === id).map((r) => ({ r, ex: state.exams.find((e) => e.id === r.examId) })).filter((x) => x.ex)
  const todayStatus = state.attendance[latestSchoolDay(idx, today)]?.[id]

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'attendance', label: 'Attendance' },
    { value: 'learning', label: 'Sabaq & Learning', count: records.length },
    { value: 'exams', label: 'Examinations' },
    ...(role === 'admin' ? [{ value: 'fees', label: 'Fees' }] : []),
    { value: 'guardian', label: 'Guardian' },
    { value: 'hostel', label: 'Hostel' },
  ]

  return (
    <div>
      <PageHeader crumbs={[{ label: role === 'mentor' ? 'My Students' : 'Students', to: '/students' }, { label: st.name }]} title={st.name}
        subtitle={`${st.id} · ${t(group?.name)} · ${t(TRACKS[st.track].long)}`}
        actions={<>
          {state.session.persona === 'admin' && <Button variant="secondary" icon={Pencil} to={`/students/${id}/edit`}>{t("Edit")}</Button>}
          <Button icon={BookOpenCheck} to={`/sabaq/new?student=${id}`}>{t("Record Sabaq")}</Button>
        </>} />

      <Card className="pattern-stars mb-4 overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5">
            <Avatar name={st.name} size={64} className="ring-4 ring-white" />
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                <AttendanceBadge status={todayStatus} />
                <LearningBadge status={ls.key} />
                {st.hostel && <Badge tone="blue" icon={BedDouble}>{t("Hostel")}</Badge>}
                {st.status !== 'active' && <Badge>{t("Inactive")}</Badge>}
              </div>
              <p className="mt-1.5 text-[13px] text-ink-muted">{t('Age {n}', { n: ageFrom(st.dob, today) })} · {t('Mentor')}: <span className="font-semibold text-ink-soft">{mentor?.name || '—'}</span></p>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2 sm:ms-auto sm:max-w-md">
            <MiniStat label={t("Attendance (30d)")} value={att30.rate != null ? `${att30.rate}%` : '—'} />
            <MiniStat label={t("Avg. rating")} value={ls.avg ? `${ls.avg}/5` : '—'} />
            <MiniStat label={t("Fee balance")} value={money(fees.balance, cur)} warn={fees.balance > 0} />
          </div>
        </div>
      </Card>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title={t("Learning position")} subtitle={t(TRACKS[st.track].long)} icon={Target} />
            <div className="p-4 sm:p-5">
              <p className="text-[18px] font-extrabold text-forest">{level.label}</p>
              {level.surah && <p lang="ar" dir="rtl" className="align-page text-[20px] text-primary-700">{level.surah.arabic}</p>}
              {level.progress != null && <><ProgressBar value={level.progress} className="mt-3" label={t("Overall progress")} /><p className="mt-1.5 text-[12.5px] text-ink-muted">{st.track === 'hifz' ? t('{n} of 30 Juz memorised', { n: level.completedJuz }) : st.track === 'qaida' ? t('{n} of 17 lessons completed', { n: level.lesson - 1 }) : t('Reading in Juz {n} of 30', { n: level.juz })}</p></>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-gold-200 bg-gold-50 p-3.5">
                  <p className="text-[12px] font-bold text-gold-700">{t("Current target")}</p>
                  <p className="mt-0.5 text-[14px] font-semibold text-forest">{t(latestTarget(idx, id))}</p>
                </div>
                <div className="rounded-2xl bg-sage-50 p-3.5">
                  <p className="text-[12px] font-bold text-primary-700">{t("Latest mentor comment")}</p>
                  <p className="mt-0.5 line-clamp-3 text-[13.5px] text-ink">{records[0]?.comments || '—'}</p>
                </div>
              </div>
              {ls.key !== 'on-track' && ls.key !== 'none' && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-700"><HeartPulse size={16} className="mt-0.5 shrink-0" /> {ls.follow} {t("follow-up")}{ls.follow === 1 ? '' : 's'} {t("and")} {ls.missed} {t("unmet target")}{ls.missed === 1 ? '' : 's'} {t("in the last 5 records.")}</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title={t("Profile")} icon={Users} />
            <dl className="space-y-2.5 p-4 text-[13.5px] sm:p-5">
              <Row icon={CalendarDays} k="Date of birth" v={fmtDate(st.dob)} />
              <Row icon={CalendarDays} k="Admitted" v={fmtDate(st.admissionDate)} />
              <Row icon={Phone} k="Phone" v={st.phone} />
              <Row icon={MapPin} k="Address" v={st.address || '—'} />
              <Row icon={Wallet} k="Fee plan" v={`${t(state.feePlans.find((p) => p.id === st.feePlanId)?.name)}${st.concession ? ` · ${t(st.concession.type)}` : ''}`} />
              <Row icon={Droplet} k="Blood group" v={st.bloodGroup || '—'} />
              {st.medical && <Row icon={HeartPulse} k="Medical" v={st.medical} />}
            </dl>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader title={t("Recent learning")} action={<Button size="sm" variant="ghost" onClick={() => setTab('learning')}>{t("Full history")}</Button>} />
            <div className="p-4 sm:p-5"><LearningTimeline records={records.slice(0, 4)} limit={4} /></div>
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 sm:p-5 lg:col-span-2">
            <h3 className="section-title mb-3">{t("Last five weeks")}</h3>
            <AttendanceCalendar history={attAll.history} today={today} weeklyOff={state.settings.weeklyOff} />
          </Card>
          <div className="grid grid-cols-2 gap-2.5 self-start">
            {Object.entries(ATTENDANCE).map(([k, v]) => <Stat key={k} label={v.label} value={attAll[k]} tone={v.tone} sub={`of ${attAll.days} days`} />)}
            <div className="col-span-2"><Stat label={t("Attendance rate")} value={`${attAll.rate ?? 0}%`} sub="Present + late, over all recorded days" /></div>
          </div>
          <Card className="lg:col-span-3">
            <CardHeader title={t("Daily history")} />
            <ul className="mt-2 max-h-[420px] divide-y divide-line overflow-y-auto" data-lenis-prevent>
              {[...attAll.history].reverse().map((h) => (
                <li key={h.date} className="flex items-center justify-between px-4 py-2.5 sm:px-5"><span className="text-[13.5px] text-ink-soft">{fmtDay(h.date)}</span><AttendanceBadge status={h.status} /></li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'learning' && (
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="section-title">{t("Learning timeline")}</h3>
            <Button size="sm" variant="secondary" icon={Printer} to={`/progress-report?student=${id}`}>{t("Progress report")}</Button>
          </div>
          <LearningTimeline records={records} limit={12} />
        </Card>
      )}

      {tab === 'exams' && (
        <Card>
          <CardHeader title={t("Assessment results")} icon={ClipboardList} action={<Button size="sm" variant="secondary" icon={Printer} to={`/report-card/${id}`}>{t("Report card")}</Button>} />
          {results.length ? (
            <ul className="mt-2 divide-y divide-line">
              {results.map(({ r, ex }) => {
                const v = resultView(r, ex, state.grading)
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1"><p className="text-[14px] font-bold text-forest">{t(ex.title)}</p><p className="text-[12px] text-ink-muted">{fmtDate(ex.date)} · {ex.type}</p></div>
                    <div className="text-end"><p className="font-bold tabular text-forest">{v.total}/{v.max}</p><p className="text-[12px] text-ink-muted">{v.pct}% · {t(v.grade.grade)}</p></div>
                  </li>
                )
              })}
            </ul>
          ) : <EmptyState icon={ClipboardList} title={t("No results yet")}>{t("Results appear after marks are entered for an assessment.")}</EmptyState>}
        </Card>
      )}

      {tab === 'fees' && role === 'admin' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="text-[13px] text-ink-muted">{t("Status")}</span><FeeBadge status={fees.status} /></div>
            {state.session.persona === 'admin' && <Button icon={Receipt} onClick={() => setPay(true)} disabled={!fees.balance}>{t("Record payment")}</Button>}
          </div>
          <FeeSummary fees={fees} currency={cur} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title={t("Invoices")} /><div className="mt-2"><InvoiceList invoices={fees.invoices} currency={cur} /></div></Card>
            <Card><CardHeader title={t("Payment history")} /><div className="mt-2"><PaymentHistory payments={fees.payments} currency={cur} onReceipt={setReceipt} /></div></Card>
          </div>
        </div>
      )}

      {tab === 'guardian' && (
        <Card className="max-w-xl">
          <CardHeader title={guardian?.name || 'Guardian'} subtitle={guardian?.relation} icon={Users} />
          <dl className="space-y-2.5 p-4 text-[13.5px] sm:p-5">
            <Row icon={Phone} k="Phone" v={guardian?.phone} />
            <Row icon={Mail} k="Email" v={guardian?.email || '—'} />
            <Row icon={Users} k="Occupation" v={guardian?.occupation || '—'} />
          </dl>
          <div className="border-t border-line">
            <p className="px-4 pt-3 text-[12px] font-bold uppercase tracking-wider text-ink-muted sm:px-5">{t("Linked children")}</p>
            <ul>
              {guardian?.children.map((c) => idx.students[c]).filter(Boolean).map((c) => (
                <li key={c.id}><LinkRow to={`/students/${c.id}`}><p className="text-[14px] font-semibold text-forest">{c.name}</p><p className="text-[12px] text-ink-muted">{t(idx.groups[c.groupId]?.name)}</p></LinkRow></li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {tab === 'hostel' && (
        <Card className="max-w-xl">
          <CardHeader title={t("Hostel")} icon={BedDouble} />
          {st.hostel ? (
            <div className="space-y-3 p-4 sm:p-5">
              {bed ? (
                <div className="rounded-2xl bg-slateblue-50 p-4">
                  <p className="text-[12px] font-bold text-slateblue-600">{t("Room & bed")}</p>
                  <p className="mt-0.5 text-[18px] font-extrabold text-forest">{bed.roomId} · {bed.label}</p>
                  <p className="text-[12.5px] text-ink-muted">{state.rooms.find((r) => r.id === bed.roomId)?.block}</p>
                </div>
              ) : <p className="rounded-xl bg-gold-50 px-3 py-2 text-[13px] text-gold-700">{t("Hostel resident without a bed.")} {state.session.persona === 'admin' && <Link to="/hostel?tab=rooms" className="font-bold underline">{t("Assign a bed")}</Link>}</p>}
              <div>
                <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-muted">{t("Recent night roll call")}</p>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {Object.keys(state.hostelAttendance).sort().reverse().slice(0, 5).map((d) => (
                    <li key={d} className="flex justify-between px-3 py-2 text-[13px]"><span>{fmtDay(d)}</span><span className="font-semibold capitalize">{state.hostelAttendance[d][id] || '—'}</span></li>
                  ))}
                </ul>
              </div>
              {hostelAlerts(state, idx, today).filter((a) => a.student.id === id).map((a, i) => <p key={i} className="rounded-xl bg-clay-50 px-3 py-2 text-[13px] text-clay-700">{fmtDay(a.date)}: {a.text}</p>)}
            </div>
          ) : <EmptyState icon={BedDouble} title={t("Day scholar")}>{t("This student does not stay in the hostel.")}</EmptyState>}
        </Card>
      )}

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
      <RecordPaymentModal open={pay} onClose={() => setPay(false)} studentId={id} />
    </div>
  )
}

function MiniStat({ label, value, warn }) {
  return (
    <div className="rounded-2xl bg-white/80 px-3 py-2.5 ring-1 ring-line">
      <p className="truncate text-[11px] font-semibold text-ink-muted">{t(label)}</p>
      <p className={`mt-0.5 truncate text-[15px] font-extrabold tabular ${warn ? 'text-clay-600' : 'text-forest'}`}>{value}</p>
    </div>
  )
}

function Row({ icon: Icon, k, v }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-primary-600" />
      <dt className="w-28 shrink-0 text-ink-muted">{t(k)}</dt>
      <dd className="min-w-0 font-semibold text-forest">{v}</dd>
    </div>
  )
}
