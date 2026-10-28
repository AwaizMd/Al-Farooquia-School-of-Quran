import { t } from "../../i18n/I18nProvider"
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { UserPlus, SlidersHorizontal, LayoutGrid, List, Download, Users } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { logEvent } from '../../api/audit'
import { useVisibleStudents } from '../../hooks/useScope'
import { useQueryState } from '../../hooks/useQueryState'
import { PageHeader, Button, SearchInput, Select, Stagger, staggerItem, EmptyState, Card, Avatar, Segmented, LinkRow } from '../../components/ui'
import { AttendanceBadge, LearningBadge } from '../../components/cards/StatusBadges'
import StudentCard from '../../features/students/StudentCard'
import { learningStatus, currentLevel, latestSchoolDay, mentorOfStudent } from '../../services/selectors'
import { TRACKS, LEARNING_STATUS } from '../../constants/labels'
import { downloadCSV } from '../../utils/csv'
import { useToast } from '../../context/ToastContext'

export default function Students() {
  const { state, idx, today, dispatch } = useStore()
  const toast = useToast()
  const role = state.session.role
  const all = useVisibleStudents()
  const [q, setQ] = useQueryState('q')
  const [group, setGroup] = useQueryState('group')
  const [status, setStatus] = useQueryState('status', 'active')
  const [mentor, setMentor] = useQueryState('mentor')
  const [track, setTrack] = useQueryState('track')
  const [learning, setLearning] = useQueryState('learning')
  const [view, setView] = useQueryState('view', 'cards')

  const groups = state.groups.filter((g) => all.some((s) => s.groupId === g.id) || role === 'admin')
  const day = latestSchoolDay(idx, today)

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return all.filter((s) => {
      if (term && !s.name.toLowerCase().includes(term) && !s.id.toLowerCase().includes(term)) return false
      if (group && s.groupId !== group) return false
      if (status !== 'all' && s.status !== status) return false
      if (track && s.track !== track) return false
      if (mentor && idx.groups[s.groupId]?.mentorId !== mentor) return false
      if (learning && learningStatus(idx, s.id, today).key !== learning) return false
      return true
    })
  }, [all, q, group, status, track, mentor, learning, idx, today])

  const exportCsv = () => {
    downloadCSV(`students-${today}`, list.map((s) => ({
      ID: s.id, Name: s.name, Halqa: idx.groups[s.groupId]?.name, Track: TRACKS[s.track].label, Mentor: mentorOfStudent(idx, s)?.name,
      Level: currentLevel(state, idx, s.id).label, Learning: LEARNING_STATUS[learningStatus(idx, s.id, today).key].label,
      Guardian: idx.parents[s.guardianId]?.name, Phone: s.phone, Hostel: s.hostel ? 'Yes' : 'No', Admission: s.admissionDate, Status: s.status,
    })))
    logEvent('export.csv', 'Student list', `${list.length} rows`)
    toast('CSV downloaded', { description: `${list.length} students exported.` })
  }

  const filtersActive = [group, track, mentor, learning].filter(Boolean).length + (status !== 'active' ? 1 : 0)
  const clear = () => { setGroup(''); setTrack(''); setMentor(''); setLearning(''); setStatus('active'); setQ('') }

  return (
    <div>
      <PageHeader
        title={role === 'mentor' ? 'My Students' : 'Students'}
        subtitle={t(role === 'mentor' ? '{n} of {total} students in your halqas' : '{n} of {total} students', { n: list.length, total: all.length })}
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!list.length}>{t("Export CSV")}</Button>
          {state.session.persona === 'admin' && <Button icon={UserPlus} to="/students/new">{t("Add student")}</Button>}
        </>}
      />

      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput value={q} onChange={setQ} placeholder={t("Search by name or student ID")} className="md:flex-1" />
          <Segmented size="sm" value={view} onChange={setView} label={t("View")} options={[{ value: 'cards', label: 'Cards', icon: LayoutGrid }, { value: 'list', label: 'List', icon: List }]} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Select aria-label={t("Halqa")} value={group} onChange={(e) => setGroup(e.target.value)} placeholder={t("All halqas")} options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          <Select aria-label={t("Learning track")} value={track} onChange={(e) => setTrack(e.target.value)} placeholder={t("All tracks")} options={Object.entries(TRACKS).map(([k, v]) => ({ value: k, label: v.label }))} />
          <Select aria-label={t("Learning status")} value={learning} onChange={(e) => setLearning(e.target.value)} placeholder={t("Any progress")} options={Object.entries(LEARNING_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
          {role === 'admin' && <Select aria-label={t("Mentor")} value={mentor} onChange={(e) => setMentor(e.target.value)} placeholder={t("All mentors")} options={state.mentors.map((m) => ({ value: m.id, label: m.name }))} />}
          <Select aria-label={t("Status")} value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All statuses' }]} />
        </div>
        {filtersActive > 0 && (
          <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-ink-muted">
            <SlidersHorizontal size={14} /> {filtersActive} {t("filter")}{filtersActive > 1 ? 's' : ''} applied
            <button type="button" onClick={clear} className="font-semibold text-primary-700 hover:underline">{t("Clear all")}</button>
          </div>
        )}
      </Card>

      {!list.length ? (
        <Card><EmptyState icon={Users} title={t("No students match")} action={<Button variant="secondary" onClick={clear}>{t("Clear filters")}</Button>}>{t("Try a different name, ID or filter.")}</EmptyState></Card>
      ) : view === 'cards' ? (
        <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => <motion.div key={s.id} variants={staggerItem}><StudentCard student={s} /></motion.div>)}
        </Stagger>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id}>
                <LinkRow to={`/students/${s.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} size={36} />
                    <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[1.4fr_1fr_auto] sm:items-center sm:gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold text-forest">{s.name}</p>
                        <p className="truncate text-[12px] text-ink-muted">{s.id} · {t(idx.groups[s.groupId]?.short)}</p>
                      </div>
                      <p className="hidden truncate text-[13px] text-ink-soft sm:block">{currentLevel(state, idx, s.id).label}</p>
                      <div className="mt-1 flex gap-1.5 sm:mt-0">
                        <AttendanceBadge status={state.attendance[day]?.[s.id]} />
                        <LearningBadge status={learningStatus(idx, s.id, today).key} />
                      </div>
                    </div>
                  </div>
                </LinkRow>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
