import { t } from "../../i18n/I18nProvider"
import { useEffect, useRef } from 'react'
import { Printer, Info, CalendarClock } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useActiveChild, useVisibleStudents } from '../../hooks/useScope'
import { useQueryState } from '../../hooks/useQueryState'
import { PageHeader, Card, Button, Select, Segmented, Notice, Logo, StarMotif, EmptyState } from '../../components/ui'
import ChildSwitcher from '../../components/cards/ChildSwitcher'
import { RecordRange } from '../../features/sabaq/SabaqViews'
import { learningInsights } from '../student/Journey'
import { currentLevel, recordsFor, studentAttendance, latestTarget, resultView, mentorOfStudent, isMain } from '../../services/selectors'
import { RATINGS, TRACKS, SABAQ_CATEGORIES } from '../../constants/labels'
import { addDays, fmtDate, fmtShort, monthKey, fmtMonth } from '../../utils/date'
import { useToast } from '../../context/ToastContext'

export default function ProgressReport() {
  const { state, idx, today, dispatch } = useStore()
  const toast = useToast()
  const role = state.session.role
  const { child } = useActiveChild()
  const visible = useVisibleStudents()
  const [sid, setSid] = useQueryState('student', role === 'parent' ? '' : 'S-1001')
  const [period, setPeriod] = useQueryState('period', 'month')
  const student = role === 'parent' ? child : idx.students[sid] && visible.some((s) => s.id === sid) ? idx.students[sid] : visible[0]
  const logged = useRef('')

  const key = `${student?.id}-${period}`
  useEffect(() => {
    if (!student || logged.current === key) return
    logged.current = key
    dispatch({ type: 'LOG', entry: { action: 'Progress report preview generated', entity: student.name, entityId: student.id, description: `${period === 'week' ? 'Weekly' : 'Monthly'} report preview (not sent)` } })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!student) return <Card><EmptyState title={t("No student selected")} /></Card>
  const from = period === 'week' ? addDays(today, -6) : `${monthKey(today)}-01`
  const recs = recordsFor(idx, student.id).filter((r) => r.date >= from)
  const primary = recs.filter((r) => isMain(idx, r))
  const ins = learningInsights(primary)
  const att = studentAttendance(state, student.id, { from })
  const level = currentLevel(state, idx, student.id)
  const mentor = mentorOfStudent(idx, student)
  const guardian = idx.parents[student.guardianId]
  const results = state.results.filter((r) => r.studentId === student.id).map((r) => ({ r, ex: state.exams.find((e) => e.id === r.examId) })).filter((x) => x.ex).sort((a, b) => b.ex.date.localeCompare(a.ex.date)).slice(0, 2)
  const comments = primary.filter((r) => r.comments).slice(0, 3)
  const avgPerf = primary.length ? (primary.reduce((a, r) => a + r.performance, 0) / primary.length).toFixed(1) : null
  const periodLabel = period === 'week' ? `${fmtDate(from)} – ${fmtDate(today)}` : `${fmtMonth(monthKey(today))} (${t("to")} ${fmtShort(today)})`

  return (
    <div>
      <PageHeader title={t("Progress report")} subtitle={t("Preview of the scheduled report a guardian would receive")}
        actions={<Button icon={Printer} onClick={() => { window.print(); toast('Print dialog opened', { type: 'info', description: 'Choose "Save as PDF" to keep a copy.' }) }}>{t("Print / Save PDF")}</Button>} />
      <div className="no-print mb-4 space-y-3">
        <ChildSwitcher />
        <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:p-4">
          {role !== 'parent' && <Select className="sm:w-72" label={t("Student")} value={student.id} onChange={(e) => setSid(e.target.value)} options={visible.map((s) => ({ value: s.id, label: `${s.name} · ${idx.groups[s.groupId]?.short}` }))} />}
          <div><span className="label">{t("Report period")}</span><Segmented value={period} onChange={setPeriod} label={t("Period")} options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} /></div>
        </Card>
        <Notice tone="gold" icon={Info}>
          {t(period === 'week'
            ? 'This is a preview. In the demo, reports are not emailed or messaged. In production they could be delivered every Thursday after Asr by WhatsApp or email.'
            : 'This is a preview. In the demo, reports are not emailed or messaged. In production they could be delivered on the 1st of each month by WhatsApp or email.')}
        </Notice>
      </div>

      <article className="print-area card mx-auto max-w-3xl overflow-hidden">
        <header className="pattern-stars-light relative bg-primary-800 px-5 py-5 text-white sm:px-7">
          <StarMotif className="absolute end-4 top-4 h-16 w-16 text-gold-300/40" strokeWidth={0.8} />
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div>
              <p className="text-[17px] font-extrabold">{state.settings.brandName}</p>
              <p lang="ar" dir="rtl" className="align-page text-[15px] text-gold-200">{state.settings.brandArabic}</p>
            </div>
          </div>
          <h2 className="mt-4 text-[20px] font-extrabold !text-white">{t(period === 'week' ? "Weekly Progress Report" : "Monthly Progress Report")}</h2>
          <p className="text-[13px] text-sage-200">{periodLabel}</p>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-7">
          <section className="print-break grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-3">
            {[['Student', student.name], ['Student ID', student.id], ['Halqa', idx.groups[student.groupId]?.name], ['Track', TRACKS[student.track].long], ['Mentor', mentor?.name], ['Guardian', guardian?.name]].map(([k, v]) => (
              <div key={k}><p className="text-[11.5px] font-semibold text-ink-muted">{t(k)}</p><p className="font-semibold text-forest">{v}</p></div>
            ))}
          </section>

          <Section title={t("Attendance summary")}>
            <div className="grid grid-cols-5 gap-2 text-center">
              {[['Rate', att.rate != null ? `${att.rate}%` : '—'], ['Present', att.present], ['Late', att.late], ['Absent', att.absent], ['Excused', att.excused]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-ivory-100 px-1 py-2"><p className="text-[11px] text-ink-muted">{t(k)}</p><p className="text-[16px] font-extrabold tabular text-forest">{v}</p></div>
              ))}
            </div>
          </Section>

          <Section title={t("Learning progress")}>
            <p className="text-[14px] text-ink-soft">{t("Current position:")} <b className="text-forest">{level.label}</b>{level.progress != null && ` (${t("{pct}% overall", { pct: level.progress })})`}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[['Lessons recorded', primary.length], ['Targets met', `${ins.met}/${ins.n}`], ['Avg. performance', avgPerf ? `${avgPerf}/5` : '—'], ['Revision quality', ins.avgRev ? `${ins.avgRev}/5` : '—']].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line px-3 py-2"><p className="text-[11px] text-ink-muted">{t(k)}</p><p className="text-[15px] font-extrabold text-forest">{v}</p></div>
              ))}
            </div>
            {primary.length > 0 && (
              <table className="mt-3 w-full text-[12.5px]">
                <thead><tr className="border-b border-line text-start text-ink-muted"><th className="py-1.5 font-semibold">{t("Date")}</th><th className="py-1.5 font-semibold">{t("Portion")}</th><th className="py-1.5 text-end font-semibold">{t("Rating")}</th></tr></thead>
                <tbody>
                  {primary.slice(0, period === 'week' ? 7 : 10).map((r) => (
                    <tr key={r.id} className="border-b border-line/60"><td className="py-1.5 pe-2 whitespace-nowrap">{fmtShort(r.date)}</td><td className="py-1.5 pe-2">{t(SABAQ_CATEGORIES[r.category].short)} · <RecordRange r={r} showArabic={false} /></td><td className="py-1.5 text-end whitespace-nowrap">{t(RATINGS[r.performance].label)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title={t("Assessment results")}>
            {results.length ? results.map(({ r, ex }) => {
              const v = resultView(r, ex, state.grading)
              return <p key={r.id} className="text-[13.5px] text-ink-soft"><b className="text-forest">{t(ex.title)}</b> ({fmtDate(ex.date)}): {v.total}/{v.max} · {v.pct}% · {t(v.grade.grade)}</p>
            }) : <p className="text-[13.5px] text-ink-muted">{t("No assessment results in this period.")}</p>}
          </Section>

          <Section title={t("Mentor feedback")}>
            {comments.length ? comments.map((r) => <p key={r.id} className="mb-1.5 border-s-2 border-gold-300 ps-3 text-[13.5px] italic text-ink-soft">“{t(r.comments)}” <span className="not-italic text-ink-muted">— {fmtShort(r.date)}</span></p>) : <p className="text-[13.5px] text-ink-muted">{t("No comments in this period.")}</p>}
          </Section>

          <div className="grid gap-5 sm:grid-cols-2">
            <Section title={t("Areas for improvement")}><ul className="list-disc space-y-1 ps-5 text-[13.5px] text-ink-soft">{ins.improve.map((x) => <li key={x}>{t(x)}</li>)}</ul></Section>
            <Section title={t("Suggested practice at home")}><ul className="list-disc space-y-1 ps-5 text-[13.5px] text-ink-soft">{ins.practice.map((x) => <li key={x}>{t(x)}</li>)}</ul></Section>
          </div>

          <Section title={t("Next learning target")}>
            <p className="rounded-xl border border-gold-200 bg-gold-50 px-3.5 py-2.5 text-[14px] font-bold text-forest">{t(latestTarget(idx, student.id))}</p>
          </Section>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11.5px] text-ink-muted">
            <span className="flex items-center gap-1.5"><CalendarClock size={13} /> {t("Generated")} {fmtDate(today)} {t("from demo records")}</span>
            <span>{state.settings.brandName} · {state.settings.phone}</span>
          </footer>
        </div>
      </article>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="print-break">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.08em] text-primary-700">
        <span className="h-px w-4 bg-gold-500" />{title}
      </h3>
      {children}
    </section>
  )
}
