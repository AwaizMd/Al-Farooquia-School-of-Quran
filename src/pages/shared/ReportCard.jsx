import { t } from "../../i18n/I18nProvider"
import { useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { PageHeader, Button, Logo, StarMotif } from '../../components/ui'
import { Forbidden, NotFound } from './Fallbacks'
import { canSeeStudent, resultView, studentAttendance, currentLevel, mentorOfStudent, latestTarget, learningStatus } from '../../services/selectors'
import { TRACKS, LEARNING_STATUS } from '../../constants/labels'
import { fmtDate } from '../../utils/date'

export default function ReportCard() {
  const { id } = useParams()
  const { state, idx, today } = useStore()
  const st = idx.students[id]
  if (!st) return <NotFound />
  if (!canSeeStudent(state, idx, id)) return <Forbidden />
  const results = state.results.filter((r) => r.studentId === id).map((r) => ({ r, ex: state.exams.find((e) => e.id === r.examId) })).filter((x) => x.ex).sort((a, b) => b.ex.date.localeCompare(a.ex.date))
  const att = studentAttendance(state, id)
  const level = currentLevel(state, idx, id)
  const mentor = mentorOfStudent(idx, st)
  const ls = learningStatus(idx, id, today)

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Examinations', to: '/exams' }, { label: 'Report card' }]} title={t("Report card")} subtitle={st.name}
        actions={<Button icon={Printer} onClick={() => window.print()}>{t("Print / Save PDF")}</Button>} />
      <article className="print-area card mx-auto max-w-3xl overflow-hidden">
        <header className="pattern-stars relative border-b-4 border-gold-500 bg-ivory-50 px-5 py-5 text-center sm:px-8">
          <StarMotif className="absolute start-4 top-4 h-12 w-12 text-gold-300" />
          <StarMotif className="absolute end-4 top-4 h-12 w-12 text-gold-300" />
          <Logo size={48} className="mx-auto" />
          <p className="mt-2 text-[19px] font-extrabold text-forest">{state.settings.brandName}</p>
          <p lang="ar" dir="rtl" className="text-[16px] text-primary-700">{state.settings.brandArabic}</p>
          <p className="mt-1 text-[12px] font-bold uppercase tracking-[0.2em] text-gold-700">{t("Student Report Card")}</p>
        </header>
        <div className="space-y-5 px-5 py-5 sm:px-8">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-3">
            {[['Name', st.name], ['Student ID', st.id], ['Halqa', idx.groups[st.groupId]?.name], ['Track', TRACKS[st.track].long], ['Mentor', mentor?.name], ['Attendance', `${att.rate ?? 0}% (${att.days} days)`]].map(([k, v]) => (
              <div key={k}><p className="text-[11.5px] text-ink-muted">{t(k)}</p><p className="font-semibold text-forest">{v}</p></div>
            ))}
          </div>

          {results.length ? results.map(({ r, ex }) => {
            const v = resultView(r, ex, state.grading)
            return (
              <section key={r.id} className="print-break overflow-hidden rounded-2xl border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-sage-50 px-4 py-2.5">
                  <p className="font-bold text-forest">{t(ex.title)}</p>
                  <p className="text-[12.5px] text-ink-muted">{fmtDate(ex.date)} · {ex.type}</p>
                </div>
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-line text-start text-[11.5px] uppercase tracking-wide text-ink-muted"><th className="px-4 py-2 font-semibold">{t("Subject")}</th><th className="px-4 py-2 text-end font-semibold">{t("Marks")}</th><th className="px-4 py-2 text-end font-semibold">{t("Max")}</th></tr></thead>
                  <tbody>{ex.subjects.map((s) => <tr key={s.name} className="border-b border-line/60"><td className="px-4 py-1.5">{s.name}</td><td className="px-4 py-1.5 text-end font-semibold tabular">{r.marks[s.name]}</td><td className="px-4 py-1.5 text-end tabular text-ink-muted">{s.max}</td></tr>)}</tbody>
                  <tfoot><tr className="font-bold"><td className="px-4 py-2">{t("Total")}</td><td className="px-4 py-2 text-end tabular">{v.total}</td><td className="px-4 py-2 text-end tabular">{v.max}</td></tr></tfoot>
                </table>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
                  <p className="text-[13px] italic text-ink-soft">“{t(r.remark) || '—'}”</p>
                  <p className="text-[14px] font-extrabold text-primary-700">{v.pct}% · {t(v.grade.grade)} <span lang="ar" className="font-arabic">{v.grade.arabic}</span></p>
                </div>
              </section>
            )
          }) : <p className="rounded-xl bg-ivory-100 p-4 text-center text-[13.5px] text-ink-muted">{t("No assessment results recorded yet.")}</p>}

          <section className="print-break grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-sage-50 p-4"><p className="text-[12px] font-bold text-primary-700">{t("Learning progress")}</p><p className="mt-1 text-[14px] font-semibold text-forest">{level.label}</p><p className="text-[12.5px] text-ink-muted">{t(LEARNING_STATUS[ls.key].label)}{ls.avg ? ` · recent average ${ls.avg}/5` : ''}</p></div>
            <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4"><p className="text-[12px] font-bold text-gold-700">{t("Next learning target")}</p><p className="mt-1 text-[14px] font-semibold text-forest">{t(latestTarget(idx, id))}</p></div>
          </section>

          <section className="print-break">
            <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-ink-muted">{t("Grading scale")}</p>
            <p className="text-[12px] text-ink-muted">{[...state.grading].sort((a, b) => b.min - a.min).map((g) => `${g.grade} ≥ ${g.min}%`).join(' · ')}</p>
          </section>

          <div className="grid grid-cols-2 gap-6 pt-6 text-center text-[12px] text-ink-muted">
            <div className="border-t border-line-strong pt-1.5">{t("Mentor")}</div>
            <div className="border-t border-line-strong pt-1.5">{t("Muhtamim")}</div>
          </div>
          <p className="text-center text-[11px] text-ink-muted">{t("Demo report card generated")} {fmtDate(today)} {t("from sample data.")}</p>
        </div>
      </article>
    </div>
  )
}
