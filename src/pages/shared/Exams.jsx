import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ClipboardList, CalendarClock, Award, Settings2, Printer, Save, ChevronRight, BarChart3 } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useAuth } from '../../context/AuthContext'
import { post, put } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import { useActiveChild } from '../../hooks/useScope'
import { PageHeader, Card, CardHeader, Button, Badge, Modal, Input, Select, EmptyState, Tabs, Notice, cx } from '../../components/ui'
import ChildSwitcher from '../../components/cards/ChildSwitcher'
import { HorizontalBars, C } from '../../components/charts/Charts'
import { examStatus, examStudents, resultView, mentorGroups } from '../../services/selectors'
import { SUBJECTS } from '../../data/generate'
import { TRACKS } from '../../constants/labels'
import { fmtDate, diffDays, addDays, dateLocale } from '../../utils/date'

const STATUS = { upcoming: ['Upcoming', 'blue'], pending: ['Marks pending', 'gold'], completed: ['Completed', 'green'] }

export default function Exams() {
  const { state } = useStore()
  const role = state.session.role
  return role === 'student' || role === 'parent' ? <MyExams /> : <StaffExams />
}

function MyExams() {
  const { state, idx, today } = useStore()
  const { child } = useActiveChild()
  if (!child) return null
  const exams = state.exams.filter((e) => e.groupIds.includes(child.groupId)).sort((a, b) => b.date.localeCompare(a.date))
  const upcoming = exams.filter((e) => e.date >= today).reverse()
  const results = state.results.filter((r) => r.studentId === child.id)
  return (
    <div>
      <PageHeader title={t("Tests & Report Card")} subtitle={child.name} actions={<Button icon={Printer} to={`/report-card/${child.id}`}>{t("Report card")}</Button>} />
      <ChildSwitcher className="mb-4" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("Upcoming")} icon={CalendarClock} />
          {upcoming.length ? (
            <ul className="mt-2 divide-y divide-line">
              {upcoming.map((e) => (
                <li key={e.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-2"><p className="font-bold text-forest">{t(e.title)}</p><Badge tone="gold">{t("in")} {diffDays(e.date, today)} {t("days")}</Badge></div>
                  <p className="text-[12.5px] text-ink-muted">{fmtDate(e.date)} · {e.subjects.map((s) => t(s.name)).join(' · ')}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t("No upcoming tests")} />}
        </Card>
        <Card>
          <CardHeader title={t("Results")} icon={Award} />
          {results.length ? (
            <ul className="mt-2 divide-y divide-line">
              {results.map((r) => {
                const ex = state.exams.find((e) => e.id === r.examId)
                const v = resultView(r, ex, state.grading)
                return (
                  <li key={r.id} className="px-4 py-3 sm:px-5">
                    <div className="flex items-center justify-between gap-2"><p className="font-bold text-forest">{t(ex.title)}</p><span className="font-extrabold tabular text-primary-700">{v.pct}%</span></div>
                    <p className="text-[12.5px] text-ink-muted">{fmtDate(ex.date)} · {v.total}/{v.max} · {t(v.grade.grade)} <span lang="ar">{v.grade.arabic}</span></p>
                    <p className="mt-1 text-[13px] italic text-ink-soft">“{t(r.remark)}”</p>
                  </li>
                )
              })}
            </ul>
          ) : <EmptyState title={t("No results yet")} />}
        </Card>
      </div>
    </div>
  )
}

function StaffExams() {
  const { state, idx, today } = useStore()
  const role = state.session.role
  const myGroups = role === 'admin' ? state.groups : mentorGroups(state, state.session.userId)
  const exams = state.exams.filter((e) => e.groupIds.some((g) => myGroups.some((x) => x.id === g))).sort((a, b) => b.date.localeCompare(a.date))
  const [tab, setTab] = useState('schedule')
  const [create, setCreate] = useState(false)

  const perf = myGroups.map((g) => {
    const rs = state.results.filter((r) => idx.students[r.studentId]?.groupId === g.id).map((r) => resultView(r, state.exams.find((e) => e.id === r.examId), state.grading))
    return { label: g.name, value: rs.length ? Math.round(rs.reduce((a, r) => a + r.pct, 0) / rs.length) : 0, suffix: '%', n: rs.length }
  })

  return (
    <div>
      <PageHeader title={t("Tests & Examinations")} subtitle={t("Schedule, marks entry and report cards")} actions={<Button icon={Plus} onClick={() => setCreate(true)}>{t("Create test")}</Button>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'schedule', label: 'Schedule & history' }, { value: 'performance', label: 'Class performance' }, ...(role === 'admin' ? [{ value: 'grading', label: 'Grading scale' }] : [])]} />
      {tab === 'schedule' && (
        <Card>
          <ul className="divide-y divide-line">
            {exams.map((e) => {
              const st = examStatus(state, e, today)
              const n = examStudents(state, e).length
              const done = state.results.filter((r) => r.examId === e.id).length
              return (
                <li key={e.id}>
                  <Link to={`/exams/${e.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ivory-50 sm:px-5">
                    <span className={cx('flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ring-1', st === 'upcoming' ? 'bg-slateblue-50 text-slateblue-600 ring-slateblue-100' : 'bg-ivory-100 text-ink-soft ring-line')}>
                      <span className="text-[16px] font-extrabold leading-none">{new Date(`${e.date}T00:00`).getDate()}</span>
                      <span className="text-[10px] font-bold uppercase">{new Date(`${e.date}T00:00`).toLocaleDateString(dateLocale(), { month: 'short' })}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold text-forest">{t(e.title)}</span>
                      <span className="block truncate text-[12px] text-ink-muted">{e.type} · {e.groupIds.map((g) => idx.groups[g]?.short).join(', ')} · {done}/{n} {t("marked")}</span>
                    </span>
                    <Badge tone={STATUS[st][1]}>{t(STATUS[st][0])}</Badge>
                    <ChevronRight size={16} className="hidden text-ink-muted/60 sm:block" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {tab === 'performance' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("Average score by halqa")} subtitle={t("All entered results")} icon={BarChart3} />
            <div className="p-4 sm:p-5"><HorizontalBars data={perf} color={C.green} /></div>
          </Card>
          <Card>
            <CardHeader title={t("Grade distribution")} subtitle={t("All entered results")} icon={Award} />
            <div className="p-4 sm:p-5">
              <HorizontalBars data={[...state.grading].sort((a, b) => b.min - a.min).map((g) => ({
                label: `${g.grade} (≥${g.min}%)`,
                value: state.results.filter((r) => myGroups.some((x) => x.id === idx.students[r.studentId]?.groupId)).map((r) => resultView(r, state.exams.find((e) => e.id === r.examId), state.grading)).filter((v) => v.grade.grade === g.grade).length,
                color: g.min >= 70 ? C.green : g.min >= 40 ? C.gold : C.red,
              }))} />
            </div>
          </Card>
        </div>
      )}
      {tab === 'grading' && role === 'admin' && <GradingEditor />}
      <CreateExam open={create} onClose={() => setCreate(false)} groups={myGroups} />
    </div>
  )
}

function GradingEditor() {
  const { state } = useStore()
  const { refreshExams } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState(state.grading)
  const canEdit = state.session.persona === 'admin'
  const [error, setError] = useState('')
  const save = () => {
    const mins = rows.map((r) => Number(r.min))
    if (mins.some((m) => !Number.isFinite(m) || m < 0 || m > 100)) return setError('Each minimum must be between 0 and 100.')
    if (new Set(mins).size !== mins.length) return setError('Minimum percentages must be different.')
    if (!mins.includes(0)) return setError('One grade must start at 0% so every score has a grade.')
    setError('')
    put('/grading', { bands: rows.map((r) => ({ grade: r.grade, ...(r.arabic ? { arabic: r.arabic } : {}), min: Number(r.min), ...(r.meaning ? { meaning: r.meaning } : {}) })) })
      .then(refreshExams)
      .then(() => toast('Grading scale updated', { description: 'New results use it. Published report cards keep the scale they were graded with.' }), (err) => setError(err.message))
  }
  return (
    <Card className="max-w-xl">
      <CardHeader title={t("Demo grading scale")} subtitle={t("Traditional Arabic grade names; edit the thresholds")} icon={Settings2} />
      <ul className="space-y-2 p-4 sm:p-5">
        {rows.map((g, i) => (
          <li key={g.grade} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="min-w-0 flex-1"><span className="block font-bold text-forest">{g.grade} <span lang="ar" className="text-primary-700">{g.arabic}</span></span><span className="text-[12px] text-ink-muted">{g.meaning}</span></span>
            <span className="text-[12px] text-ink-muted">from</span>
            <Input aria-label={`Minimum for ${g.grade}`} type="number" min={0} max={100} value={g.min} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} className="w-20" />
            <span className="text-[12px] text-ink-muted">%</span>
          </li>
        ))}
        {error && <p className="rounded-xl bg-clay-50 px-3 py-2 text-[13px] text-clay-700" role="alert">{error}</p>}
        {canEdit && <Button icon={Save} onClick={save} className="w-full">{t("Save grading scale")}</Button>}
      </ul>
    </Card>
  )
}

function CreateExam({ open, onClose, groups }) {
  const { state, today } = useStore()
  const { refreshExams } = useAuth()
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const [f, setF] = useState({ title: '', type: 'Monthly Test', track: groups[0]?.track || 'hifz', groupIds: [], date: addDays(today, 7) })
  const [errors, setErrors] = useState({})
  const trackGroups = groups.filter((g) => g.track === f.track)
  const submit = async () => {
    const e = {}
    if (f.title.trim().length < 3) e.title = 'Enter a title.'
    if (!f.groupIds.length) e.groups = 'Choose at least one halqa.'
    if (!f.date) e.date = 'Choose a date.'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      await post('/exams', { title: f.title.trim(), type: f.type, track: f.track.toUpperCase(), date: f.date, groupIds: f.groupIds.map((g) => state.groups.find((x) => x.id === g).uuid) })
      await refreshExams()
      toast('Test scheduled', { description: `${f.title} · ${fmtDate(f.date)}` })
      setF({ ...f, title: '', groupIds: [] })
      onClose()
    } catch (err) {
      toast(err.message, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("Create a test")} footer={<><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button icon={Plus} onClick={submit} loading={saving}>{t("Schedule test")}</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Input className="sm:col-span-2" label={t("Title")} required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} placeholder="e.g. Juz 3 Review Test" />
        <Select label={t("Type")} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={['Monthly Test', 'Hifz Juz Test', 'Oral Assessment', 'Term Exam']} />
        <Input label={t("Date")} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} error={errors.date} />
        <Select className="sm:col-span-2" label={t("Learning track")} value={f.track} onChange={(e) => setF({ ...f, track: e.target.value, groupIds: [] })} options={[...new Set(groups.map((g) => g.track))].map((t) => ({ value: t, label: TRACKS[t].long }))} />
        <div className="sm:col-span-2">
          <span className="label">{t("Halqas")}</span>
          <div className="flex flex-wrap gap-2">
            {trackGroups.map((g) => (
              <label key={g.id} className={cx('flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-[13.5px] font-semibold', f.groupIds.includes(g.id) ? 'border-primary-600 bg-primary-50' : 'border-line-strong')}>
                <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={f.groupIds.includes(g.id)} onChange={(e) => setF({ ...f, groupIds: e.target.checked ? [...f.groupIds, g.id] : f.groupIds.filter((x) => x !== g.id) })} />{g.name}
              </label>
            ))}
          </div>
          {errors.groups && <p className="mt-1 text-[12.5px] text-clay-600">{errors.groups}</p>}
        </div>
        <Notice tone="green" className="sm:col-span-2">{t("Subjects:")} {SUBJECTS[f.track].map((s) => `${s.name} (${s.max})`).join(' · ')}</Notice>
      </div>
    </Modal>
  )
}
