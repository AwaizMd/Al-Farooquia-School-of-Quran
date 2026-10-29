import { t } from "../../i18n/I18nProvider"
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Save, Printer, Info, Send } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useAuth } from '../../context/AuthContext'
import { post, put } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import { PageHeader, Card, Button, Avatar, Input, Notice, Badge, EmptyState } from '../../components/ui'
import { NotFound, Forbidden } from './Fallbacks'
import { examStudents, resultView, gradeFor, mentorGroups } from '../../services/selectors'
import { fmtLong } from '../../utils/date'

export default function ExamDetail() {
  const { id } = useParams()
  const { state, idx, today } = useStore()
  const { refreshExams } = useAuth()
  const [saving, setSaving] = useState(false)
  const isAdmin = state.session.persona === 'admin'
  const toast = useToast()
  const exam = state.exams.find((e) => e.id === id)
  const [draft, setDraft] = useState({})
  const [errors, setErrors] = useState({})
  const students = exam ? examStudents(state, exam) : []
  useEffect(() => {
    if (!exam) return
    setDraft(Object.fromEntries(students.map((s) => {
      const r = state.results.find((x) => x.examId === exam.id && x.studentId === s.id)
      return [s.id, { marks: Object.fromEntries(exam.subjects.map((sub) => [sub.name, r?.marks[sub.name] ?? ''])), remark: r?.remark || '' }]
    })))
  }, [id, state.results]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!exam) return <NotFound />
  if (state.session.role === 'mentor' && !exam.groupIds.some((g) => mentorGroups(state, state.session.userId).some((x) => x.id === g))) return <Forbidden />
  const max = exam.subjects.reduce((a, s) => a + s.max, 0)
  const upcoming = exam.date > today

  const setMark = (sid, sub, v) => setDraft((d) => ({ ...d, [sid]: { ...d[sid], marks: { ...d[sid].marks, [sub]: v } } }))

  const save = async (reason) => {
    const e = {}
    const entries = []
    students.forEach((s) => {
      const d = draft[s.id]
      if (!d) return
      const vals = exam.subjects.map((sub) => d.marks[sub.name])
      if (vals.every((v) => v === '' || v == null)) return // skip untouched rows
      exam.subjects.forEach((sub) => {
        const v = d.marks[sub.name]
        const n = Number(v)
        if (v === '' || !Number.isFinite(n) || n < 0 || n > sub.max) e[`${s.id}-${sub.name}`] = `0–${sub.max}`
      })
      entries.push({ studentId: s.id, marks: Object.fromEntries(exam.subjects.map((sub) => [sub.name, Number(d.marks[sub.name])])), remark: d.remark.trim() })
    })
    setErrors(e)
    if (Object.keys(e).length) return toast('Some marks are invalid', { type: 'error', description: 'Each subject needs a number within its maximum.' })
    if (!entries.length) return toast('Enter marks for at least one student', { type: 'error' })
    setSaving(true)
    try {
      await put(`/exams/${exam.id}/results`, { entries: entries.map((x) => ({ ...x, studentId: idx.students[x.studentId].uuid })), ...(reason ? { reason } : {}) })
      await refreshExams()
      toast('Marks saved', { description: `${entries.length} students · grades calculated` })
    } catch (err) {
      if (err.code === 'REASON_REQUIRED') {
        const r = window.prompt(t('These results are published. Why are you changing them?'))
        if (r && r.trim().length >= 3) return save(r.trim())
      }
      toast(err.message, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const publish = async () => {
    if (!window.confirm(t('Publish these results to students and guardians? They are graded with the current scale from now on.'))) return
    try {
      await post(`/exams/${exam.id}/publish`)
      await refreshExams()
      toast('Results published', { description: 'Students and guardians can now see them.' })
    } catch (err) {
      toast(err.message, { type: 'error' })
    }
  }

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader crumbs={[{ label: 'Examinations', to: '/exams' }, { label: exam.title }]} title={exam.title}
        subtitle={`${t(exam.type)} · ${fmtLong(exam.date)} · ${exam.groupIds.map((g) => t(idx.groups[g]?.name)).join('، ')}`} />
      {upcoming && <Notice tone="blue" icon={Info} className="mb-4">{t("This test has not happened yet. Marks can be entered after it is held, but you may prepare entries now.")}</Notice>}
      <p className="mb-3 text-[13px] text-ink-muted">{t("Subjects:")} {exam.subjects.map((s) => `${t(s.name)} (/${s.max})`).join(' · ')} · {t('Total')} {max}</p>
      {students.length ? (
        <div className="space-y-3">
          {students.map((s) => {
            const d = draft[s.id]
            if (!d) return null
            const total = exam.subjects.reduce((a, sub) => a + (Number(d.marks[sub.name]) || 0), 0)
            const filled = exam.subjects.every((sub) => d.marks[sub.name] !== '')
            const pctV = Math.round((total / max) * 100)
            const g = gradeFor(pctV, state.grading)
            return (
              <Card key={s.id} className="p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={s.name} size={36} />
                  <Link to={`/students/${s.id}?tab=exams`} className="min-w-0 flex-1"><p className="truncate font-bold text-forest">{s.name}</p><p className="text-[12px] text-ink-muted">{s.id}</p></Link>
                  {filled ? <div className="text-end"><p className="font-extrabold tabular text-forest">{total}/{max} · {pctV}%</p><Badge tone={g.min >= 70 ? 'green' : g.min >= 40 ? 'gold' : 'red'}>{g.grade}</Badge></div> : <Badge>{t("Not entered")}</Badge>}
                  <Button size="sm" variant="ghost" icon={Printer} to={`/report-card/${s.id}`} aria-label={t("Report card")} className="hidden sm:inline-flex">{t("Report")}</Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {exam.subjects.map((sub) => (
                    <Input key={sub.name} label={`${t(sub.name)} /${sub.max}`} type="number" inputMode="numeric" min={0} max={sub.max} value={d.marks[sub.name]} error={errors[`${s.id}-${sub.name}`]}
                      onChange={(e) => setMark(s.id, sub.name, e.target.value)} />
                  ))}
                </div>
                <Input className="mt-2" label={t("Mentor remark")} value={d.remark} onChange={(e) => setDraft((x) => ({ ...x, [s.id]: { ...x[s.id], remark: e.target.value } }))} placeholder={t("Constructive comment for the report card")} />
              </Card>
            )
          })}
        </div>
      ) : <Card><EmptyState title={t("No students in these halqas")} /></Card>}
      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-white/95 px-4 py-2.5 backdrop-blur lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-6xl justify-end gap-2">
          {exam.published ? <Badge tone="green" className="self-center">{t("Published")}</Badge> : isAdmin && !upcoming && <Button variant="secondary" icon={Send} onClick={publish} className="w-full lg:w-auto">{t("Publish results")}</Button>}
          {(!exam.published || isAdmin) && <Button icon={Save} onClick={() => save()} loading={saving} className="w-full lg:w-auto">{t("Save marks")}</Button>}
        </div>
      </div>
    </div>
  )
}
