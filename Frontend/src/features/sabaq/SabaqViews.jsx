import { t, currentLang } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { MessageSquareQuote, Target, Flag, CalendarDays, BookOpen } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { Modal, EmptyState, Badge, cx } from '../../components/ui'
import { CategoryBadge, RatingBadge, TajweedBadge, TargetBadge, RatingDots } from '../../components/cards/StatusBadges'
import { surahByNumber, rangeLabel, QAIDA_LESSONS } from '../../data/quran'
import { SABAQ_CATEGORIES, RATINGS, PREV_REVISION } from '../../constants/labels'
import { fmtDay, fmtLong, relativeDay } from '../../utils/date'

export function RecordRange({ r, showArabic = true }) {
  if (r.category === 'qaida') return <span>{t("Lesson")} {r.qaidaLesson} · <span className="text-ink-muted">{t(QAIDA_LESSONS[r.qaidaLesson - 1])}</span></span>
  const s = surahByNumber(r.surah)
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      {currentLang() !== "ur" && <span>{s.name}</span>}
      {showArabic && <span lang="ar" dir="rtl" className="text-[15px] text-primary-700">{s.arabic}</span>}
      <span className="text-ink-muted">· {t("Ayah")} <span className="ltr inline-block">{r.fromAyah}{r.toAyah !== r.fromAyah && `–${r.toAyah}`}</span> · {t("Juz")} {r.juz}</span>
    </span>
  )
}

export function SabaqDetail({ record, onClose }) {
  const { idx } = useStore()
  if (!record) return null
  const st = idx.students[record.studentId]
  const mentor = idx.mentors[record.mentorId]
  const rows = [
    ['Category', SABAQ_CATEGORIES[record.category].label],
    ['Portion', <RecordRange r={record} />],
    ['Performance', `${record.performance}/5 · ${RATINGS[record.performance].label}`],
    ['Mistakes / corrections', record.mistakes],
    ['Fluency', `${record.fluency}/5 · ${RATINGS[record.fluency].label}`],
    ['Tajweed', <TajweedBadge value={record.tajweed} />],
    ['Previous lesson revision', PREV_REVISION[record.prevRevision]],
    ['Revision quality', record.revisionQuality ? `${record.revisionQuality}/5 · ${RATINGS[record.revisionQuality].label}` : '—'],
    ['Target', <TargetBadge value={record.targetStatus} />],
    ['Follow-up required', record.followUp ? 'Yes' : 'No'],
    ['Recorded by', mentor?.name],
  ]
  return (
    <Modal open={!!record} onClose={onClose} title={`${SABAQ_CATEGORIES[record.category].short} · ${fmtLong(record.date)}`} subtitle={st?.name}>
      <dl className="divide-y divide-line rounded-2xl border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-[12.5px] font-semibold text-ink-muted">{t(k)}</dt>
            <dd className="text-[14px] font-semibold text-forest sm:text-end">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-2xl bg-sage-50 p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-primary-700"><MessageSquareQuote size={15} /> {t("Mentor comments")}</p>
        <p className="mt-1 text-[14px] text-ink">{record.comments || '—'}</p>
      </div>
      <div className="mt-3 rounded-2xl border border-gold-200 bg-gold-50 p-4">
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-gold-700"><Target size={15} /> {t("Next learning target")}</p>
        <p className="mt-1 text-[14px] font-semibold text-forest">{t(record.nextTarget)}</p>
      </div>
    </Modal>
  )
}

// Chronological timeline grouped by date.
export function LearningTimeline({ records, limit = 30, emptyText = 'No learning records yet.', showStudent }) {
  const { idx } = useStore()
  const [open, setOpen] = useState(null)
  const [count, setCount] = useState(limit)
  if (!records.length) return <EmptyState icon={BookOpen} title={t("Nothing recorded yet")}>{emptyText}</EmptyState>
  const shown = records.slice(0, count)
  const byDate = []
  for (const r of shown) {
    const last = byDate[byDate.length - 1]
    if (last && last.date === r.date) last.items.push(r)
    else byDate.push({ date: r.date, items: [r] })
  }
  return (
    <>
      <ol className="relative space-y-5 ps-6 before:absolute before:bottom-2 before:start-[7px] before:top-2 before:w-px before:bg-line-strong">
        {byDate.map((g) => (
          <li key={g.date} className="relative">
            <span className="absolute -start-6 top-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-ivory bg-gold-500 ring-1 ring-gold-300" aria-hidden />
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-ink-muted"><CalendarDays size={13} /> {fmtDay(g.date)} <span className="font-medium">· {relativeDay(g.date)}</span></p>
            <div className="space-y-2">
              {g.items.map((r) => (
                <button key={r.id} type="button" onClick={() => setOpen(r)} className="block w-full rounded-2xl border border-line bg-white p-3.5 text-start shadow-card transition hover:border-primary-200 hover:shadow-lift">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CategoryBadge value={r.category} />
                    <RatingBadge value={r.performance} />
                    {r.targetStatus !== 'met' && <Badge tone={r.targetStatus === 'missed' ? 'red' : 'amber'} icon={Flag}>{r.targetStatus === 'missed' ? 'Target missed' : 'Target partly met'}</Badge>}
                    {r.followUp && <Badge tone="red">{t("Follow-up")}</Badge>}
                  </div>
                  {showStudent && <p className="mt-2 text-[13px] font-bold text-forest">{idx.students[r.studentId]?.name}</p>}
                  <p className="mt-1.5 text-[14px] font-semibold text-forest"><RecordRange r={r} /></p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
                    <span className="flex items-center gap-1.5">{t("Fluency")} <RatingDots value={r.fluency} /></span>
                    <span>{t(r.mistakes === 1 ? "{n} mistake" : "{n} mistakes", { n: r.mistakes })}</span>
                    <span>{t("Tajweed:")} {t(r.tajweed === 'good' ? "Rules applied well" : r.tajweed === 'fair' ? "Minor slips" : "Needs focused work")}</span>
                  </div>
                  {r.comments && <p className="mt-2 line-clamp-2 border-s-2 border-gold-300 ps-2.5 text-[13px] italic text-ink-soft">“{t(r.comments)}”</p>}
                  {['sabaq', 'nazira', 'qaida'].includes(r.category) && <p className="mt-1.5 text-[12.5px] text-primary-700"><span className="font-semibold">{t("Next:")}</span> {t(r.nextTarget)}</p>}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {records.length > count && (
        <button type="button" onClick={() => setCount((c) => c + limit)} className="mt-4 w-full rounded-xl border border-line bg-white py-2.5 text-[13.5px] font-semibold text-primary-700 hover:bg-ivory-50">
          {t("Show older records ({n} more)", { n: records.length - count })}
        </button>
      )}
      <SabaqDetail record={open} onClose={() => setOpen(null)} />
    </>
  )
}

export function MiniRecord({ r, className }) {
  if (!r) return <p className={cx('text-[13px] text-ink-muted', className)}>{t("No record yet")}</p>
  return (
    <p className={cx('text-[13px] text-ink-soft', className)}>
      <span className="font-semibold text-forest">{t(rangeLabel(r))}</span> · {t(RATINGS[r.performance].label)} · {relativeDay(r.date)}
    </p>
  )
}
