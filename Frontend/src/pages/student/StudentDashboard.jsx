import { t } from "../../i18n/I18nProvider"
import { Link } from 'react-router-dom'
import { Sun, Target, CalendarClock, MessageSquareQuote, Library, CalendarCheck, Sprout, ChevronRight, BookOpen } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useActiveChild } from '../../hooks/useScope'
import { Card, CardHeader, Button, ProgressRing, Badge, StarMotif, FadeIn } from '../../components/ui'
import { RatingBadge } from '../../components/cards/StatusBadges'
import { RecordRange } from '../../features/sabaq/SabaqViews'
import { currentLevel, latestTarget, recordsFor, studentAttendance, latestSchoolDay, isMain } from '../../services/selectors'
import { ATTENDANCE } from '../../constants/labels'
import { addDays, diffDays, fmtDate, relativeDay } from '../../utils/date'

export default function StudentDashboard() {
  const { state, idx, today } = useStore()
  const { child: me } = useActiveChild()
  const group = idx.groups[me.groupId]
  const mentor = idx.mentors[group?.mentorId]
  const level = currentLevel(state, idx, me.id)
  const att = studentAttendance(state, me.id, { from: addDays(today, -30) })
  const recs = recordsFor(idx, me.id).filter((r) => isMain(idx, r))
  const recent = recs.slice(0, 3)
  const exam = state.exams.filter((e) => e.groupIds.includes(me.groupId) && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
  const todayStatus = state.attendance[latestSchoolDay(idx, today)]?.[me.id]
  const praise = recs.find((r) => r.performance >= 4 && r.comments)
  const resources = state.library.filter((r) => r.access === 'All students' || (r.access === 'Hifz groups' && me.track === 'hifz') || (r.access === 'Alimiyyah' && me.track === 'alim')).slice(0, 3)

  const schedule = me.track === 'hifz'
    ? [['After Fajr', 'Sabaq — new lesson'], ['8:30 am', 'Sabqi — recent revision'], ['10:30 am', 'Manzil — older portions'], ['After Asr', 'Self-revision of tomorrow\'s Sabaq']]
    : me.track === 'alim'
      ? [['8:00 am', 'Nahw & Arabic'], ['10:00 am', 'Fiqh / Hadith'], ['12:00 pm', 'Manzil revision'], ['After Asr', 'Muta\'ala (self-study)']]
      : [['4:00 pm', me.track === 'qaida' ? 'Qaida lesson' : 'Nazira reading'], ['5:00 pm', 'Tajweed practice'], ['5:45 pm', 'Duas & Masail'], ['At home', 'Read today\'s lesson once']]

  return (
    <div className="space-y-5">
      <FadeIn>
        <section className="pattern-stars-light relative overflow-hidden rounded-3xl bg-primary-800 p-5 text-white sm:p-6">
          <StarMotif className="absolute -bottom-10 -end-10 h-44 w-44 text-gold-300/25" strokeWidth={0.6} />
          <div className="relative flex items-center gap-4">
            <ProgressRing value={level.progress ?? 100} size={84} tone="#D9BE85" label={t("Overall progress")}>
              <span className="text-[17px] font-extrabold text-white">{level.progress ?? '✓'}{level.progress != null && '%'}</span>
            </ProgressRing>
            <div className="min-w-0">
              <p className="text-[13px] text-gold-200">{t("Assalamu Alaikum,")}</p>
              <h1 className="truncate text-[22px] font-extrabold !text-white">{me.name.split(' ')[0]}</h1>
              <p className="text-[13px] text-sage-200">{level.label}</p>
            </div>
          </div>
          <div className="relative mt-4 rounded-2xl bg-white/10 p-3.5 backdrop-blur">
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-gold-200"><Target size={14} /> {t("Your current target")}</p>
            <p className="mt-0.5 text-[15px] font-bold text-white">{t(latestTarget(idx, me.id))}</p>
          </div>
        </section>
      </FadeIn>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title={t("Today's schedule")} subtitle={`${group?.name} · ${group?.room}`} icon={Sun} />
          <ol className="space-y-1 p-4 pt-3 sm:px-5">
            {schedule.map(([t, s]) => (
              <li key={t} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ivory-50">
                <span className="w-20 shrink-0 text-[12.5px] font-bold text-gold-700">{t}</span>
                <span className="text-[14px] text-forest">{s}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader title={t("Attendance")} subtitle={t("Last 30 days")} icon={CalendarCheck} />
          <div className="flex items-center gap-4 p-4 sm:px-5">
            <ProgressRing value={att.rate ?? 0} size={76} label={t("Attendance rate")}><span className="text-[16px] font-extrabold text-forest">{att.rate ?? 0}%</span></ProgressRing>
            <div className="text-[13px] text-ink-soft">
              <p>{t("Today:")} <span className="font-bold text-forest">{todayStatus ? ATTENDANCE[todayStatus].label : 'Not marked yet'}</span></p>
              <p className="mt-1">{t("{p} present · {l} late · {a} absent", { p: att.present, l: att.late, a: att.absent })}</p>
              {att.rate >= 90 && <p className="mt-1 font-semibold text-primary-700">{t("MashaAllah, keep it up!")}</p>}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("Recent Sabaq")} icon={BookOpen} action={<Button size="sm" variant="ghost" to="/sabaq">{t("History")}</Button>} />
          <ul className="mt-2 divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id} className="px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between gap-2"><p className="text-[13.5px] font-semibold text-forest"><RecordRange r={r} showArabic={false} /></p></div>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-muted"><RatingBadge value={r.performance} /> {relativeDay(r.date, today)}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title={t("Mentor feedback")} subtitle={mentor?.name} icon={MessageSquareQuote} />
          <div className="space-y-3 p-4 sm:px-5">
            {recs[0] && <blockquote className="rounded-2xl bg-sage-50 p-3.5 text-[14px] text-ink"><p className="text-[11.5px] font-bold text-primary-700">{t("Latest · {d}", { d: fmtDate(recs[0].date) })}</p>“{t(recs[0].comments)}”</blockquote>}
            {praise && praise.id !== recs[0]?.id && <blockquote className="rounded-2xl border border-gold-200 bg-gold-50 p-3.5 text-[14px] text-ink"><p className="text-[11.5px] font-bold text-gold-700">{t("Well done · {d}", { d: fmtDate(praise.date) })}</p>“{t(praise.comments)}”</blockquote>}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("Next assessment")} icon={CalendarClock} />
          <div className="p-4 sm:px-5">
            {exam ? (
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-200"><span className="text-[20px] font-extrabold leading-none">{diffDays(exam.date, today)}</span><span className="text-[10px] font-bold">{t("DAYS")}</span></span>
                <div><p className="font-bold text-forest">{t(exam.title)}</p><p className="text-[12.5px] text-ink-muted">{fmtDate(exam.date)} · {exam.subjects.map((s) => t(s.name)).join(', ')}</p></div>
              </div>
            ) : <p className="text-[13.5px] text-ink-muted">{t("No assessment scheduled.")}</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("Study resources")} icon={Library} action={<Button size="sm" variant="ghost" to="/library">{t("Library")}</Button>} />
          <ul className="mt-2 divide-y divide-line">
            {resources.map((r) => (
              <li key={r.id}>
                <Link to={`/library?open=${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ivory-50 sm:px-5">
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold text-forest">{r.title}</span><span className="text-[12px] text-ink-muted">{r.category} · {r.type}</span></span>
                  <ChevronRight size={16} className="text-ink-muted/60" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Button variant="soft" icon={Sprout} to="/journey" className="w-full">{t("Open my learning journey")}</Button>
      {me.track === 'hifz' && <p className="text-center"><Badge tone="gold">{t("{n} Juz memorised so far", { n: level.completedJuz })}</Badge></p>}
    </div>
  )
}
