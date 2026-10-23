import { t } from "../../i18n/I18nProvider"
import { motion } from 'framer-motion'
import { Users, UserCheck, UserX, BookOpenCheck, Clock, RefreshCcw, CalendarClock, MessageSquareQuote, CalendarCheck, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../../context/DemoStore'
import { useVisibleStudents } from '../../hooks/useScope'
import { Card, CardHeader, Stat, Stagger, staggerItem, Button, Avatar, EmptyState, Notice, StarMotif, Badge } from '../../components/ui'
import { LearningBadge, RatingBadge } from '../../components/cards/StatusBadges'
import { RecordRange } from '../../features/sabaq/SabaqViews'
import { attendanceCounts, sabaqToday, learningStatus, mentorGroups, recordsFor, examStatus, latestTarget } from '../../services/selectors'
import { fmtLong, relativeDay, diffDays, dateLocale } from '../../utils/date'

export default function MentorDashboard() {
  const { state, idx, today } = useStore()
  const me = idx.mentors[state.session.userId]
  const students = useVisibleStudents().filter((s) => s.status === 'active')
  const groups = mentorGroups(state, me.id)
  const att = attendanceCounts(state, today, students)
  const sb = sabaqToday(state, idx, students, today)
  const needs = students.map((s) => ({ s, ls: learningStatus(idx, s.id, today) })).filter((x) => x.ls.key === 'attention' || x.ls.key === 'revision').sort((a, b) => (a.ls.avg ?? 9) - (b.ls.avg ?? 9))
  const recent = students.flatMap((s) => recordsFor(idx, s.id).slice(0, 2)).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 5)
  const exams = state.exams.filter((e) => e.groupIds.some((g) => groups.some((x) => x.id === g)) && (e.date >= today || examStatus(state, e, today) === 'pending')).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="space-y-5">
      <section className="pattern-stars-light relative overflow-hidden rounded-3xl bg-primary-800 px-4 py-5 text-white sm:px-6">
        <StarMotif className="absolute -end-8 -top-8 h-36 w-36 text-gold-300/30" strokeWidth={0.8} />
        <p lang="ar" dir="rtl" className="align-page text-[18px] text-gold-200">السَّلَامُ عَلَيْكُمْ</p>
        <h1 className="text-[21px] font-extrabold !text-white sm:text-[25px]">{me.name}</h1>
        <p className="text-[13.5px] text-sage-200">{groups.map((g) => t(g.name)).join(' · ') || t('No halqa assigned')} · {fmtLong(today)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="gold" icon={BookOpenCheck} to={sb.pending[0] ? `/sabaq/new?student=${sb.pending[0].id}` : '/sabaq/new'}>{sb.pending.length ? t('Record Sabaq ({n} pending)', { n: sb.pending.length }) : t('Record Sabaq')}</Button>
          <Button variant="secondary" icon={CalendarCheck} to="/attendance" className="!border-white/20 !bg-white/10 !text-white hover:!bg-white/20">{t("Mark attendance")}</Button>
        </div>
      </section>

      {att.unmarked > 0 && (
        <Notice tone="amber" icon={CalendarCheck}>
          Attendance for {att.unmarked} {t("student")}{att.unmarked > 1 ? 's' : ''} {t("is not marked today.")} <Link to="/attendance" className="font-bold underline">{t("Mark now")}</Link>
        </Notice>
      )}

      <Stagger className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Assigned students', value: students.length, icon: Users, to: '/students' },
          { label: 'Present today', value: att.attending, sub: t('{n} late', { n: att.late }), icon: UserCheck, to: '/attendance' },
          { label: 'Absent today', value: att.absent, sub: t('{n} excused', { n: att.excused }), icon: UserX, tone: 'red', to: '/attendance' },
          { label: 'Sabaq completed', value: sb.done.length, sub: t('of {n} present', { n: sb.present.length }), icon: BookOpenCheck, tone: 'green', to: '/sabaq' },
          { label: 'Sabaq pending', value: sb.pending.length, icon: Clock, tone: 'gold', to: '/sabaq/new' },
          { label: 'Need revision', value: needs.length, icon: RefreshCcw, tone: 'amber', to: '/students?learning=revision' },
        ].map((k) => <motion.div key={k.label} variants={staggerItem}><Stat {...k} /></motion.div>)}
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("Sabaq pending today")} subtitle={t("Present students without a lesson record")} icon={Clock} />
          {sb.pending.length ? (
            <ul className="mt-2 divide-y divide-line">
              {sb.pending.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <Avatar name={s.name} size={36} />
                  <Link to={`/students/${s.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-forest">{s.name}</p>
                    <p className="truncate text-[12px] text-ink-muted">{t('Target: {t}', { t: t(latestTarget(idx, s.id)) })}</p>
                  </Link>
                  <Button size="sm" to={`/sabaq/new?student=${s.id}`}>{t("Record")}</Button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={BookOpenCheck} title={t("All lessons recorded")}>{t("Every present student has today's Sabaq on file. JazakAllahu khairan.")}</EmptyState>}
        </Card>

        <Card>
          <CardHeader title={t("Students requiring revision")} subtitle={t("From the last five records")} icon={RefreshCcw} />
          {needs.length ? (
            <ul className="mt-2 divide-y divide-line">
              {needs.slice(0, 6).map(({ s, ls }) => (
                <li key={s.id}>
                  <Link to={`/students/${s.id}?tab=learning`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ivory-50 sm:px-5">
                    <Avatar name={s.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-forest">{s.name}</p>
                      <p className="text-[12px] text-ink-muted">{t('Avg {avg}/5 · {f} follow-ups · {m} unmet targets', { avg: ls.avg, f: ls.follow, m: ls.missed })}</p>
                    </div>
                    <LearningBadge status={ls.key} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t("No one flagged")}>{t("All students are on track.")}</EmptyState>}
        </Card>

        <Card>
          <CardHeader title={t("Recent mentor feedback")} icon={MessageSquareQuote} action={<Button size="sm" variant="ghost" to="/sabaq">{t("All records")}</Button>} />
          <ul className="mt-2 divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13.5px] font-bold text-forest">{idx.students[r.studentId].name}</p>
                  <RatingBadge value={r.performance} />
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-muted"><RecordRange r={r} showArabic={false} /> · {relativeDay(r.date, today)}</p>
                {r.comments && <p className="mt-1 line-clamp-2 text-[13px] italic text-ink-soft">“{t(r.comments)}”</p>}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title={t("Upcoming tests & assessments")} icon={CalendarClock} action={<Button size="sm" variant="ghost" to="/exams">{t("All")}</Button>} />
          {exams.length ? (
            <ul className="mt-2 divide-y divide-line">
              {exams.map((e) => (
                <li key={e.id}>
                  <Link to={`/exams/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory-50 sm:px-5">
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gold-50 text-gold-700 ring-1 ring-gold-200">
                      <span className="text-[15px] font-extrabold leading-none">{new Date(`${e.date}T00:00`).getDate()}</span>
                      <span className="text-[10px] font-bold uppercase">{new Date(`${e.date}T00:00`).toLocaleDateString(dateLocale(), { month: 'short' })}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-forest">{t(e.title)}</p>
                      <p className="text-[12px] text-ink-muted">{t(e.type)} · {e.groupIds.map((g) => t(idx.groups[g]?.short)).join('، ')}</p>
                    </div>
                    {e.date < today ? <Badge tone="gold">{t("Marks pending")}</Badge> : <span className="text-[12px] font-semibold text-ink-muted">{diffDays(e.date, today) === 0 ? 'Today' : `${diffDays(e.date, today)}d`}</span>}
                    <ChevronRight size={16} className="text-ink-muted/60" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CalendarClock} title={t("No upcoming assessments")} />}
        </Card>
      </div>
    </div>
  )
}
