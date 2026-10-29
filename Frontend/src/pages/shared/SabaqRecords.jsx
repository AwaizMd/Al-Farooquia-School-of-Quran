import { t } from "../../i18n/I18nProvider"
import { useMemo } from 'react'
import { Plus, Download } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useVisibleStudents, useActiveChild } from '../../hooks/useScope'
import { useQueryState } from '../../hooks/useQueryState'
import { PageHeader, Card, Select, Button, Input } from '../../components/ui'
import ChildSwitcher from '../../components/cards/ChildSwitcher'
import { LearningTimeline } from '../../features/sabaq/SabaqViews'
import { SABAQ_CATEGORIES, RATINGS, TAJWEED, PREV_REVISION } from '../../constants/labels'
import { rangeLabel } from '../../data/quran'
import { downloadCSV } from '../../utils/csv'
import { addDays } from '../../utils/date'

export default function SabaqRecords() {
  const { state, idx, today } = useStore()
  const role = state.session.role
  const personal = role === 'student' || role === 'parent'
  const visible = useVisibleStudents()
  const { child } = useActiveChild()
  const [studentId, setStudentId] = useQueryState('student')
  const [category, setCategory] = useQueryState('category')
  const [from, setFrom] = useQueryState('from', addDays(today, -30))
  const [rating, setRating] = useQueryState('rating')

  const scopeIds = personal ? (child ? [child.id] : []) : (studentId ? [studentId] : visible.map((s) => s.id))
  const records = useMemo(() => {
    const set = new Set(scopeIds)
    return state.sabaq
      .filter((r) => set.has(r.studentId) && (!category || r.category === category) && (!from || r.date >= from) && (!rating || (rating === 'low' ? r.performance <= 2 : r.performance >= 4)))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
  }, [state.sabaq, scopeIds.join(), category, from, rating]) // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => downloadCSV(`sabaq-records-${today}`, records.map((r) => ({
    Date: r.date, Student: idx.students[r.studentId]?.name, Category: SABAQ_CATEGORIES[r.category].short, Portion: rangeLabel(r), Juz: r.juz ?? '',
    Performance: RATINGS[r.performance].label, Mistakes: r.mistakes, Fluency: r.fluency, Tajweed: TAJWEED[r.tajweed].label, Revision: PREV_REVISION[r.prevRevision],
    Target: r.targetStatus, 'Follow-up': r.followUp ? 'Yes' : 'No', Comments: r.comments, 'Next target': r.nextTarget, Mentor: idx.mentors[r.mentorId]?.name,
  })))

  return (
    <div>
      <PageHeader title={personal ? (role === 'student' ? 'My Sabaq History' : 'Sabaq Records') : 'Sabaq Records'}
        subtitle={personal ? `${child?.name} · tap a record for full details` : `${records.length} records`}
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!records.length}>{t("CSV")}</Button>
          {!personal && <Button icon={Plus} to="/sabaq/new">{t("Record Sabaq")}</Button>}
        </>} />
      <ChildSwitcher className="mb-4" />
      <Card className="mb-4 grid grid-cols-2 gap-2 p-3 sm:p-4 lg:grid-cols-4">
        {!personal && <Select aria-label={t("Student")} value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder={t("All students")} options={visible.map((s) => ({ value: s.id, label: s.name }))} />}
        <Select aria-label={t("Category")} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t("All categories")} options={Object.entries(SABAQ_CATEGORIES).map(([k, v]) => ({ value: k, label: v.short }))} />
        <Select aria-label={t("Rating")} value={rating} onChange={(e) => setRating(e.target.value)} placeholder={t("Any rating")} options={[{ value: 'high', label: 'Very good & above' }, { value: 'low', label: 'Needs improvement & below' }]} />
        <Input aria-label={t("From date")} type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
      </Card>
      <LearningTimeline records={records} limit={15} showStudent={!personal && !studentId} emptyText="No records match these filters." />
    </div>
  )
}
