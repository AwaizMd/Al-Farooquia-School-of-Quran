import { t } from "../../i18n/I18nProvider"
import { Check, Target, RefreshCcw, CalendarRange, Lightbulb, AlertCircle, Sparkles, FileText } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useActiveChild } from '../../hooks/useScope'
import { PageHeader, Card, CardHeader, Badge, Button, ProgressBar, cx, Stat } from '../../components/ui'
import ChildSwitcher from '../../components/cards/ChildSwitcher'
import { LearningTimeline } from '../../features/sabaq/SabaqViews'
import { currentLevel, latestTarget, recordsFor, learningStatus, isMain } from '../../services/selectors'
import { surahByNumber, QAIDA_LESSONS, juzOf } from '../../data/quran'
import { TRACKS, RATINGS } from '../../constants/labels'
import { addDays, fmtShort } from '../../utils/date'
import { pct } from '../../utils/format'

function upcomingPortions(latest, count = 3) {
  if (!latest?.surah || latest.targetStatus === 'missed') return []
  const len = Math.max(1, latest.toAyah - latest.fromAyah + 1)
  let surah = latest.surah, from = latest.toAyah + 1
  const out = []
  for (let i = 0; i < count + 1; i++) {
    if (from > surahByNumber(surah).ayahs) { surah += 1; from = 1 }
    if (surah > 114) break
    const to = Math.min(from + len - 1, surahByNumber(surah).ayahs)
    out.push({ surah, from, to, juz: juzOf(surah, from) })
    from = to + 1
  }
  return out.slice(1) // the first one is the current target
}

export function learningInsights(records) {
  const n = records.length
  if (!n) return { n, met: 0, avgRev: null, tajweed: {}, improve: [], practice: [] }
  const met = records.filter((r) => r.targetStatus === 'met').length
  const revs = records.filter((r) => r.revisionQuality)
  const avgRev = revs.length ? +(revs.reduce((a, r) => a + r.revisionQuality, 0) / revs.length).toFixed(1) : null
  const tajweed = records.reduce((a, r) => ({ ...a, [r.tajweed]: (a[r.tajweed] || 0) + 1 }), {})
  const avgFlu = records.reduce((a, r) => a + r.fluency, 0) / n
  const notRevised = records.filter((r) => r.prevRevision !== 'done').length
  const avgMist = records.reduce((a, r) => a + r.mistakes, 0) / n
  const improve = []
  const practice = []
  if ((tajweed.weak || 0) + (tajweed.fair || 0) > n * 0.4) { improve.push('Tajweed rules — especially madd lengths and ghunnah — need steadier application.'); practice.push('Listen to the lesson recited slowly once, then recite along, focusing on madd and ghunnah.') }
  if (avgFlu < 3.5) { improve.push('Fluency: recitation pauses and hesitations are frequent.'); practice.push('Read the day\'s portion aloud 3 times from the Mushaf before memorising or reciting.') }
  if (notRevised > n * 0.25) { improve.push('Previous lessons are not always revised before the new Sabaq.'); practice.push('Set a fixed 15-minute revision time after Maghrib for yesterday\'s lesson.') }
  if (avgMist > 3) { improve.push(`On average ${avgMist.toFixed(1)} mistakes per lesson — portions need to be firmer before recitation.`); practice.push('Recite the lesson to a family member once before coming to the Madarsa.') }
  if (!improve.length) { improve.push('No major concerns. Keep the current routine and consistency.'); practice.push('Continue daily revision; recite memorised portions in Sunnah and Nafl prayers.') }
  return { n, met, metPct: pct(met, n), avgRev, tajweed, improve, practice, avgFlu: +avgFlu.toFixed(1) }
}

export default function Journey() {
  const { state, idx, today } = useStore()
  const { child, isParent } = useActiveChild()
  if (!child) return null
  const level = currentLevel(state, idx, child.id)
  const records = recordsFor(idx, child.id)
  const month = records.filter((r) => r.date >= addDays(today, -30))
  const primary = month.filter((r) => isMain(idx, r))
  const ins = learningInsights(primary)
  const ls = learningStatus(idx, child.id, today)
  const missed = records.filter((r) => isMain(idx, r) && r.targetStatus !== 'met').slice(0, 4)
  const upcoming = upcomingPortions(level.latest)
  const revisionToday = child.track === 'hifz'
    ? ['Sabqi: revise the last five lessons', level.juz > 1 ? t("Manzil: one portion from Juz {a}–{b}", { a: Math.max(1, level.juz - 2), b: level.juz - 1 }) : t("Manzil: revise Surah Al-Fatihah and recent ayahs")]
    : child.track === 'alim' ? ['Manzil: one Juz as per weekly plan', 'Review Nahw notes from today\'s class']
      : child.track === 'qaida' ? [t("Read Lesson {n} twice at home", { n: level.lesson }), 'Practise difficult letters from the lesson']
        : ['Read yesterday\'s portion once more', 'Practise Tajweed rules from the mentor\'s note']

  return (
    <div>
      <PageHeader title={isParent ? 'Learning Report' : 'My Learning Journey'} subtitle={`${child.name} · ${TRACKS[child.track].long}`}
        actions={isParent && <Button variant="secondary" icon={FileText} to="/progress-report">{t("Monthly report")}</Button>} />
      <ChildSwitcher className="mb-4" />

      {/* Milestones */}
      <Card className="mb-4 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="section-title">{t(child.track === 'qaida' ? 'Noorani Qaida lessons' : child.track === 'alim' ? 'Hifz completed — Manzil revision' : 'Quran milestones (Juz / Para)')}</h3>
            <p className="text-[12.5px] text-ink-muted">{level.label}</p>
          </div>
          <div className="flex gap-3 text-[11.5px] text-ink-muted">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary-600" />{t("Completed")}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-gold-500" />{t("Current")}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-dashed border-line-strong" />{t("Planned")}</span>
          </div>
        </div>
        {child.track === 'qaida' ? (
          <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {QAIDA_LESSONS.map((l, i) => {
              const n = i + 1, done = n < level.lesson, curr = n === level.lesson
              return (
                <li key={l} className={cx('flex min-h-[40px] items-center gap-2.5 rounded-xl px-3 text-[13px]', done ? 'bg-primary-50 text-primary-800' : curr ? 'bg-gold-50 font-bold text-gold-700 ring-1 ring-gold-300' : 'border border-dashed border-line-strong text-ink-muted')}>
                  <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', done ? 'bg-primary-600 text-white' : curr ? 'bg-gold-500 text-white' : 'bg-ivory-100')}>{done ? <Check size={13} /> : n}</span>
                  {l}
                </li>
              )
            })}
          </ol>
        ) : (
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
            {Array.from({ length: 30 }, (_, i) => {
              const j = i + 1
              const done = child.track === 'alim' || (child.track === 'hifz' ? j < level.juz : j < level.juz)
              const curr = child.track !== 'alim' && j === level.juz
              return (
                <div key={j} title={`Juz ${j}: ${done ? 'completed' : curr ? 'in progress' : 'planned'}`}
                  className={cx('flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] font-extrabold', done ? 'bg-primary-600 text-white' : curr ? 'bg-gold-500 text-white ring-2 ring-gold-200' : 'border border-dashed border-line-strong text-ink-muted')}>
                  {j}
                  {curr && <span className="text-[8.5px] font-bold uppercase">{t("now")}</span>}
                </div>
              )
            })}
          </div>
        )}
        {level.progress != null && <ProgressBar value={level.progress} className="mt-4" label={t("Overall progress")} />}
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label={t("Targets met (30 days)")} value={`${ins.met}/${ins.n}`} sub={t("{pct}% of lessons", { pct: ins.metPct ?? 0 })} icon={Target} />
        <Stat label={t("Revision quality")} value={ins.avgRev ? `${ins.avgRev}/5` : '—'} sub={ins.avgRev ? RATINGS[Math.round(ins.avgRev)].label : 'No data'} icon={RefreshCcw} tone="gold" />
        <Stat label={t("Fluency (avg)")} value={ins.avgFlu ? `${ins.avgFlu}/5` : '—'} icon={Sparkles} tone="blue" />
        <Stat label={t("Tajweed applied well")} value={`${pct(ins.tajweed?.good || 0, ins.n)}%`} sub={t("{n} lessons need focused work", { n: ins.tajweed?.weak || 0 })} icon={Check} tone={ins.tajweed?.weak ? 'amber' : 'green'} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("Current target")} icon={Target} />
          <div className="p-4 sm:px-5">
            <p className="rounded-2xl border border-gold-200 bg-gold-50 p-3.5 text-[15px] font-bold text-forest">{t(latestTarget(idx, child.id))}</p>
            <p className="mt-3 text-[12px] font-bold uppercase tracking-wider text-ink-muted">{t("Revision tasks")}</p>
            <ul className="mt-1.5 space-y-1.5">
              {revisionToday.map((x) => <li key={x} className="flex items-start gap-2 text-[13.5px] text-ink-soft"><RefreshCcw size={14} className="mt-0.5 shrink-0 text-primary-600" />{t(x)}</li>)}
            </ul>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("Upcoming targets")} subtitle={t("Planned — not yet assessed")} icon={CalendarRange} />
          <ul className="space-y-1.5 p-4 sm:px-5">
            {upcoming.length ? upcoming.map((u, i) => (
              <li key={i} className="flex items-center justify-between rounded-xl border border-dashed border-line-strong px-3 py-2 text-[13.5px]">
                <span className="text-forest">{surahByNumber(u.surah).name} {u.from}–{u.to}</span><Badge>{t("Juz")} {u.juz}</Badge>
              </li>
            )) : <li className="text-[13px] text-ink-muted">{child.track === 'qaida' ? `Next: Lesson ${Math.min(17, level.lesson + 1)} — ${QAIDA_LESSONS[Math.min(16, level.lesson)]}` : 'Targets follow the mentor\'s weekly plan.'}</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t("Missed or partial targets")} icon={AlertCircle} />
          <ul className="space-y-1.5 p-4 sm:px-5">
            {missed.length ? missed.map((r) => (
              <li key={r.id} className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-700">{fmtShort(r.date)} · {r.targetStatus === 'missed' ? t("Missed") : t("Partly met")} — {t(r.nextTarget)}</li>
            )) : <li className="text-[13px] text-ink-muted">{t("No missed targets recently. MashaAllah.")}</li>}
          </ul>
        </Card>
      </div>

      {isParent && (
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title={t("Areas requiring improvement")} subtitle={t("From the last 30 days of mentor records")} icon={AlertCircle} />
            <ul className="space-y-2 p-4 sm:px-5">{ins.improve.map((x) => <li key={x} className="flex gap-2 text-[13.5px] text-ink-soft"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />{t(x)}</li>)}</ul>
          </Card>
          <Card>
            <CardHeader title={t("Suggested practice at home")} icon={Lightbulb} />
            <ul className="space-y-2 p-4 sm:px-5">{ins.practice.map((x) => <li key={x} className="flex gap-2 text-[13.5px] text-ink-soft"><Check size={15} className="mt-0.5 shrink-0 text-primary-600" />{t(x)}</li>)}</ul>
          </Card>
        </div>
      )}

      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="section-title">{t("Sabaq history")}</h3>
          <Badge tone={ls.key === 'on-track' ? 'green' : ls.key === 'attention' ? 'red' : 'amber'}>{ls.avg ? t("Recent average {avg}/5", { avg: ls.avg }) : t("No recent records")}</Badge>
        </div>
        <LearningTimeline records={records} limit={8} />
      </Card>
    </div>
  )
}
