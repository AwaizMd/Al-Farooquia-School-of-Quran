import { t } from "../../i18n/I18nProvider"
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpenCheck, Minus, Plus, Save, CheckCircle2, ArrowRight, AlertTriangle, Sparkles, History } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { useVisibleStudents } from '../../hooks/useScope'
import { PageHeader, Card, CardHeader, Avatar, Select, Input, Textarea, Segmented, Rating, Button, Notice, SearchInput, cx, Badge } from '../../components/ui'
import { SURAHS, surahByNumber, juzOf, validAyahRange, QAIDA_LESSONS, rangeLabel } from '../../data/quran'
import { SABAQ_CATEGORIES, RATINGS, TAJWEED, PREV_REVISION, TARGET_STATUS } from '../../constants/labels'
import { recordsFor, sabaqToday, isMain } from '../../services/selectors'
import { todayISO, fmtDay } from '../../utils/date'
import { uid } from '../../utils/format'

const QUICK_NOTES = ['Improve fluency and revise today\'s lesson.', 'Revise three times before tomorrow.', 'Pay attention to madd and ghunnah.', 'Excellent — keep this pace.', 'Read slowly with the Mushaf before memorising.']

function suggest(idx, student, category) {
  const recs = recordsFor(idx, student.id)
  if (category === 'qaida') {
    const last = recs.find((r) => r.category === 'qaida')
    return { qaidaLesson: last ? (last.targetStatus === 'met' && last.nextTarget.startsWith('Qaida Lesson') ? Math.min(17, last.qaidaLesson + 1) : last.qaidaLesson) : 1 }
  }
  const primary = recs.find((r) => r.category === (student.track === 'hifz' ? 'sabaq' : 'nazira')) || recs.find((r) => r.surah)
  if (!primary) return { surah: 1, fromAyah: 1, toAyah: 7 }
  const len = Math.max(1, primary.toAyah - primary.fromAyah + 1)
  if (category === 'sabqi') {
    const from = Math.max(1, primary.fromAyah - len * 3)
    return primary.fromAyah > 1 ? { surah: primary.surah, fromAyah: from, toAyah: primary.toAyah } : { surah: primary.surah, fromAyah: 1, toAyah: primary.toAyah }
  }
  if (category === 'manzil') {
    const s = Math.max(1, primary.surah - 1)
    return { surah: s, fromAyah: 1, toAyah: Math.min(surahByNumber(s).ayahs, 20) }
  }
  // sabaq / nazira → continue from the last completed position
  if (primary.targetStatus === 'missed') return { surah: primary.surah, fromAyah: primary.fromAyah, toAyah: primary.toAyah }
  let surah = primary.surah
  let from = primary.toAyah + 1
  if (from > surahByNumber(surah).ayahs) { surah = Math.min(114, surah + 1); from = 1 }
  return { surah, fromAyah: from, toAyah: Math.min(from + len - 1, surahByNumber(surah).ayahs) }
}

const nextTargetText = (category, f) => {
  if (category === 'qaida') return f.targetStatus === 'met' ? `Qaida Lesson ${Math.min(17, f.qaidaLesson + 1)}` : `Repeat Qaida Lesson ${f.qaidaLesson}`
  const s = surahByNumber(Number(f.surah))
  if (!s || !f.toAyah) return ''
  if (category === 'sabqi') return 'Continue Sabqi of the last five lessons'
  if (category === 'manzil') return 'Next Manzil portion as per weekly plan'
  if (f.targetStatus === 'missed') return `Repeat: ${s.name} ${f.fromAyah}–${f.toAyah}`
  const len = Number(f.toAyah) - Number(f.fromAyah) + 1
  let surah = s.number, from = Number(f.toAyah) + 1
  if (f.targetStatus === 'partial') from = Number(f.fromAyah) + Math.max(1, Math.floor(len / 2))
  if (from > s.ayahs) { surah = Math.min(114, surah + 1); from = 1 }
  const ns = surahByNumber(surah)
  return `${ns.name} ${from}–${Math.min(from + len - 1, ns.ayahs)}`
}

const blank = (date) => ({ date, surah: '', fromAyah: '', toAyah: '', qaidaLesson: 1, prevRevision: 'done', performance: 0, mistakes: 0, fluency: 0, tajweed: '', revisionQuality: 0, targetStatus: 'met', comments: '', nextTarget: '', followUp: false })

export default function RecordSabaq() {
  const { state, idx, dispatch, today } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const students = useVisibleStudents().filter((s) => s.status === 'active')
  const [studentId, setStudentId] = useState(params.get('student') && students.some((s) => s.id === params.get('student')) ? params.get('student') : '')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [f, setF] = useState(blank(today))
  const [touchedTarget, setTouchedTarget] = useState(false)
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(null)

  const student = idx.students[studentId]
  const lastMain = student && recordsFor(idx, student.id).find((r) => isMain(idx, r))
  const pendingIds = new Set(sabaqToday(state, idx, students, today).pending.map((s) => s.id))

  // When the student or category changes, prefill a sensible next portion.
  useEffect(() => {
    if (!student) return
    const cat = category && SABAQ_CATEGORIES[category].tracks.includes(student.track) ? category : (student.track === 'hifz' ? 'sabaq' : student.track === 'alim' ? 'manzil' : student.track)
    if (cat !== category) { setCategory(cat); return }
    setF((prev) => ({ ...blank(prev.date), ...suggest(idx, student, cat) }))
    setTouchedTarget(false)
    setErrors({})
  }, [studentId, category]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }))
  const usesAyah = category && SABAQ_CATEGORIES[category].usesAyah
  const surah = surahByNumber(Number(f.surah))
  const juz = usesAyah && surah && f.fromAyah ? juzOf(surah.number, Number(f.fromAyah)) : null
  const autoTarget = category ? nextTargetText(category, { ...f, surah: Number(f.surah), fromAyah: Number(f.fromAyah), toAyah: Number(f.toAyah), qaidaLesson: Number(f.qaidaLesson) }) : ''
  const nextTarget = touchedTarget ? f.nextTarget : autoTarget
  const followSuggested = (f.performance && f.performance <= 2) || f.prevRevision === 'not' || f.targetStatus === 'missed'
  const duplicate = student && recordsFor(idx, student.id).some((r) => r.date === f.date && r.category === category)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return students.filter((s) => !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .sort((a, b) => Number(pendingIds.has(b.id)) - Number(pendingIds.has(a.id)))
  }, [students, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    const e = {}
    if (!student) e.student = 'Choose a student.'
    if (!f.date) e.date = 'Choose a date.'
    else if (f.date > todayISO()) e.date = 'Records cannot be dated in the future.'
    if (usesAyah) {
      if (!f.surah) e.surah = 'Select the Surah.'
      else {
        const err = validAyahRange(Number(f.surah), Number(f.fromAyah), Number(f.toAyah))
        if (err) e.ayah = err
      }
    } else if (!(f.qaidaLesson >= 1 && f.qaidaLesson <= 17)) e.qaida = 'Choose a Qaida lesson.'
    if (!f.performance) e.performance = 'Rate the lesson performance.'
    if (!f.fluency) e.fluency = 'Rate fluency.'
    if (!f.tajweed) e.tajweed = 'Choose a Tajweed assessment.'
    if (f.mistakes < 0 || f.mistakes > 99) e.mistakes = 'Enter 0–99.'
    if (!nextTarget.trim()) e.nextTarget = 'Set the next learning target.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = () => {
    if (!validate()) { toast('Some details are missing', { type: 'error', description: 'Check the highlighted fields.' }); return }
    const record = {
      id: uid('SB'), studentId: student.id, mentorId: idx.groups[student.groupId]?.mentorId, date: f.date, createdAt: new Date().toISOString(), category,
      surah: usesAyah ? Number(f.surah) : null, fromAyah: usesAyah ? Number(f.fromAyah) : null, toAyah: usesAyah ? Number(f.toAyah) : null,
      juz: usesAyah ? juz : null, qaidaLesson: usesAyah ? null : Number(f.qaidaLesson),
      performance: f.performance, mistakes: Number(f.mistakes), fluency: f.fluency, tajweed: f.tajweed, prevRevision: f.prevRevision,
      revisionQuality: f.revisionQuality || null, targetStatus: f.targetStatus, comments: f.comments.trim(), nextTarget: nextTarget.trim(), followUp: f.followUp,
    }
    const summary = `${SABAQ_CATEGORIES[category].short}: ${rangeLabel(record)} · ${RATINGS[f.performance].label}`
    dispatch({ type: 'ADD_SABAQ', record, summary })
    toast('Sabaq saved', { description: `${student.name} · ${rangeLabel(record)}` })
    setSaved({ record, student })
  }

  const nextPending = students.find((s) => pendingIds.has(s.id) && s.id !== saved?.student.id)

  if (saved) {
    return (
      <div className="mx-auto max-w-lg">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="pattern-stars p-6 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-600"><CheckCircle2 size={34} /></span>
            <h1 className="mt-3 text-[20px] font-extrabold">{t("Sabaq recorded")}</h1>
            <p className="mt-1 text-[14px] text-ink-muted">{saved.student.name} · {t(rangeLabel(saved.record))}</p>
            <div className="mx-auto mt-4 max-w-sm rounded-2xl border border-gold-200 bg-gold-50 p-3 text-start">
              <p className="text-[12px] font-bold text-gold-700">{t("Next target")}</p>
              <p className="text-[14px] font-semibold text-forest">{t(saved.record.nextTarget)}</p>
            </div>
            <p className="mt-3 text-[12.5px] text-ink-muted">{t("The student's learning history, the mentor dashboard and the parent's view are updated. A notification was added for the student and guardian (in-app only).")}</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="secondary" icon={History} to={`/students/${saved.student.id}?tab=learning`}>{t("View history")}</Button>
              {nextPending ? (
                <Button iconRight={ArrowRight} onClick={() => { setSaved(null); setStudentId(nextPending.id); setParams({ student: nextPending.id }, { replace: true }) }}>{t("Next:")} {nextPending.name.split(' ')[0]}</Button>
              ) : <Button onClick={() => navigate('/dashboard')}>{t("Back to dashboard")}</Button>}
            </div>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={t("Record Sabaq")} subtitle={t("Daily lesson, revision and mentor feedback")} eyebrow={fmtDay(f.date)} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Student picker */}
        <Card className="self-start lg:sticky lg:top-20">
          <CardHeader title={t("Student")} subtitle={t('{n} pending today', { n: pendingIds.size })} />
          <div className="p-3">
            <SearchInput value={search} onChange={setSearch} placeholder={t("Search student")} />
            {errors.student && <p className="mt-1.5 text-[12.5px] font-medium text-clay-600">{errors.student}</p>}
            <ul className="mt-2 flex max-h-[220px] flex-col gap-1 overflow-y-auto lg:max-h-[460px]" data-lenis-prevent role="listbox" aria-label={t("Students")}>
              {filtered.map((s) => (
                <li key={s.id}>
                  <button type="button" role="option" aria-selected={s.id === studentId} onClick={() => { setStudentId(s.id); setParams({ student: s.id }, { replace: true }) }}
                    className={cx('flex min-h-[52px] w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition', s.id === studentId ? 'bg-primary-700 text-white' : 'hover:bg-sage-100')}>
                    <Avatar name={s.name} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold">{s.name}</span>
                      <span className={cx('block truncate text-[11.5px]', s.id === studentId ? 'text-sage-200' : 'text-ink-muted')}>{t(idx.groups[s.groupId]?.short)} · {s.id}</span>
                    </span>
                    {pendingIds.has(s.id) && <span className={cx('chip', s.id === studentId ? 'bg-white/15 text-white' : 'bg-gold-50 text-gold-700')}>{t("Pending")}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {!student ? (
          <Card className="flex min-h-[240px] items-center justify-center p-8 text-center">
            <div><BookOpenCheck size={30} className="mx-auto text-primary-600" /><p className="mt-2 font-bold text-forest">{t("Choose a student to begin")}</p><p className="text-[13px] text-ink-muted">{t("Students with pending Sabaq today are listed first.")}</p></div>
          </Card>
        ) : (
          <div className="space-y-4 pb-20 lg:pb-0">
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={student.name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-extrabold text-forest">{student.name}</p>
                  <p className="text-[12.5px] text-ink-muted">{t(idx.groups[student.groupId]?.name)} · {t("last lesson: {l}", { l: lastMain ? `${t(rangeLabel(lastMain))} (${fmtDay(lastMain.date)})` : t("None") })}</p>
                </div>
                <Link to={`/students/${student.id}?tab=learning`} className="text-[13px] font-semibold text-primary-700 hover:underline">{t("History")}</Link>
              </div>
              <div className="mt-4 grid gap-3.5 sm:grid-cols-[1fr_200px]">
                <div>
                  <span className="label">{t("Learning category")}</span>
                  <Segmented value={category} onChange={setCategory} label={t("Learning category")}
                    options={Object.entries(SABAQ_CATEGORIES).filter(([, v]) => v.tracks.includes(student.track)).map(([k, v]) => ({ value: k, label: v.short }))} />
                  {category && <p className="mt-1.5 text-[12.5px] text-ink-muted">{t(SABAQ_CATEGORIES[category].hint)}</p>}
                </div>
                <Input label={t("Date")} type="date" value={f.date} max={today} onChange={set('date')} error={errors.date} />
              </div>
              {duplicate && <Notice tone="amber" icon={AlertTriangle} className="mt-3">A {t(SABAQ_CATEGORIES[category].short)} {t("record already exists for this date. Saving will add a second entry.")}</Notice>}
            </Card>

            <Card className="p-4 sm:p-5">
              <h3 className="section-title mb-3">{t("Portion")}</h3>
              {usesAyah ? (
                <div className="grid gap-3.5 sm:grid-cols-[1fr_110px_110px]">
                  <Select label={t("Surah")} value={f.surah} onChange={set('surah')} error={errors.surah} placeholder={t("Select Surah")}
                    options={SURAHS.map((s) => ({ value: s.number, label: `${s.number}. ${s.name} — ${s.arabic} (${s.ayahs})` }))} />
                  <Input label={t("From Ayah")} type="number" inputMode="numeric" min={1} max={surah?.ayahs} value={f.fromAyah} onChange={set('fromAyah')} />
                  <Input label={t("To Ayah")} type="number" inputMode="numeric" min={1} max={surah?.ayahs} value={f.toAyah} onChange={set('toAyah')} />
                  <div className="sm:col-span-3">
                    {errors.ayah ? <p className="text-[12.5px] font-medium text-clay-600" role="alert">{errors.ayah}</p> : surah && (
                      <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                        <span lang="ar" dir="rtl" className="text-[18px] text-primary-700">سورة {surah.arabic}</span>
                        <Badge tone="gold">{t("Para / Juz")} {juz}</Badge>
                        <span>{t('{n} ayahs in this Surah', { n: surah.ayahs })}</span>
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <Select label={t("Qaida lesson")} value={f.qaidaLesson} onChange={(e) => set('qaidaLesson')(Number(e.target.value))} error={errors.qaida}
                  options={QAIDA_LESSONS.map((l, i) => ({ value: i + 1, label: `Lesson ${i + 1} — ${l}` }))} />
              )}
              <div className="mt-4">
                <span className="label">{t("Previous lesson revision")}</span>
                <Segmented value={f.prevRevision} onChange={set('prevRevision')} label={t("Previous lesson revision")} options={Object.entries(PREV_REVISION).map(([k, v]) => ({ value: k, label: v }))} />
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <h3 className="section-title mb-3">{t("Assessment")}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <span className="label">{t("Performance")} <span className="text-clay-500">*</span>{f.performance ? <span className="font-medium text-ink-muted"> · {t(RATINGS[f.performance].label)}</span> : null}</span>
                  <Rating value={f.performance} onChange={set('performance')} labels={RATINGS} name="Performance" />
                  {errors.performance && <p className="mt-1 text-[12.5px] font-medium text-clay-600">{errors.performance}</p>}
                </div>
                <div>
                  <span className="label">{t("Fluency")} <span className="text-clay-500">*</span>{f.fluency ? <span className="font-medium text-ink-muted"> · {t(RATINGS[f.fluency].label)}</span> : null}</span>
                  <Rating value={f.fluency} onChange={set('fluency')} labels={RATINGS} name="Fluency" />
                  {errors.fluency && <p className="mt-1 text-[12.5px] font-medium text-clay-600">{errors.fluency}</p>}
                </div>
                <div>
                  <span className="label">{t("Mistakes / corrections")}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" icon={Minus} aria-label={t("Fewer mistakes")} onClick={() => set('mistakes')(Math.max(0, f.mistakes - 1))} className="w-12 px-0" />
                    <input type="number" inputMode="numeric" min={0} max={99} value={f.mistakes} onChange={(e) => set('mistakes')(Math.max(0, Number(e.target.value) || 0))} className="field w-20 text-center text-[18px] font-bold" aria-label={t("Mistakes count")} />
                    <Button variant="secondary" icon={Plus} aria-label={t("More mistakes")} onClick={() => set('mistakes')(f.mistakes + 1)} className="w-12 px-0" />
                  </div>
                </div>
                <div>
                  <span className="label">{t("Revision quality")} {f.revisionQuality ? <span className="font-medium text-ink-muted"> · {t(RATINGS[f.revisionQuality].label)}</span> : <span className="font-medium text-ink-muted">(optional)</span>}</span>
                  <Rating value={f.revisionQuality} onChange={set('revisionQuality')} labels={RATINGS} name="Revision quality" />
                </div>
                <div className="md:col-span-2">
                  <span className="label">{t("Tajweed assessment")} <span className="text-clay-500">*</span></span>
                  <Segmented value={f.tajweed} onChange={set('tajweed')} label={t("Tajweed")} options={Object.entries(TAJWEED).map(([k, v]) => ({ value: k, label: v.label }))} />
                  {errors.tajweed && <p className="mt-1 text-[12.5px] font-medium text-clay-600">{errors.tajweed}</p>}
                </div>
                <div className="md:col-span-2">
                  <span className="label">{t("Today's target")}</span>
                  <Segmented value={f.targetStatus} onChange={set('targetStatus')} label={t("Target status")} options={Object.entries(TARGET_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <h3 className="section-title mb-3">{t("Feedback & next step")}</h3>
              <Textarea label={t("Mentor comments")} value={f.comments} onChange={set('comments')} placeholder={t("Honest, constructive feedback for the student and parents")} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_NOTES.map((n0) => t(n0)).map((n) => <button key={n} type="button" onClick={() => set('comments')(f.comments ? `${f.comments} ${n}` : n)} className="rounded-full border border-line bg-white px-2.5 py-1 text-[12px] text-ink-soft hover:border-primary-300">+ {n}</button>)}
              </div>
              <div className="mt-4">
                <Input label={t("Next learning target")} value={nextTarget} onChange={(e) => { setTouchedTarget(true); set('nextTarget')(e.target.value) }} error={errors.nextTarget}
                  hint={!touchedTarget ? 'Suggested from today\'s portion — edit if needed.' : undefined} />
              </div>
              <label className="mt-4 flex min-h-[52px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-3.5">
                <span>
                  <span className="block text-[14px] font-semibold text-forest">{t("Follow-up required")}</span>
                  {followSuggested && !f.followUp && <span className="flex items-center gap-1 text-[12px] text-amber-700"><Sparkles size={12} /> {t("Suggested based on this assessment")}</span>}
                </span>
                <input type="checkbox" checked={f.followUp} onChange={(e) => set('followUp')(e.target.checked)} className="h-5 w-5 accent-primary-700" />
              </label>
            </Card>

            <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-white/95 px-4 py-2.5 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
              <div className="mx-auto flex max-w-6xl gap-2 lg:justify-end">
                <Button variant="secondary" className="flex-1 lg:flex-none" onClick={() => navigate(-1)}>{t("Cancel")}</Button>
                <Button className="flex-[2] lg:flex-none" icon={Save} onClick={save}>{t("Save Sabaq record")}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
