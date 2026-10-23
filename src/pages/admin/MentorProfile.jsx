import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Phone, Mail, GraduationCap, CalendarDays, ArrowRightLeft, Power, BookOpenCheck } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { PageHeader, Card, CardHeader, Avatar, Badge, Button, ConfirmDialog, Stat } from '../../components/ui'
import StudentCard from '../../features/students/StudentCard'
import { LearningTimeline } from '../../features/sabaq/SabaqViews'
import { NotFound } from '../shared/Fallbacks'
import { AssignMentor } from './Mentors'
import { mentorGroups, attendanceCounts, sabaqToday, learningStatus } from '../../services/selectors'
import { fmtDate, addDays } from '../../utils/date'
import { pct } from '../../utils/format'

export default function MentorProfile() {
  const { id } = useParams()
  const { state, idx, today, dispatch } = useStore()
  const toast = useToast()
  const [assign, setAssign] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const m = idx.mentors[id]
  if (!m) return <NotFound />
  const groups = mentorGroups(state, id)
  const students = state.students.filter((s) => groups.some((g) => g.id === s.groupId) && s.status === 'active')
  const att = attendanceCounts(state, today, students)
  const sb = sabaqToday(state, idx, students, today)
  const recent = state.sabaq.filter((r) => r.mentorId === id).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
  const last30 = recent.filter((r) => r.date >= addDays(today, -30))
  const onTrack = students.filter((s) => learningStatus(idx, s.id, today).key === 'on-track').length
  const days30 = idx.schoolDays.filter((d) => d >= addDays(today, -30) && d <= today)
  const avgAtt = days30.length ? Math.round(days30.reduce((a, d) => { const c = attendanceCounts(state, d, students); return a + pct(c.attending, c.marked || 1) }, 0) / days30.length) : 0

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Mentors', to: '/mentors' }, { label: m.name }]} title={m.name} subtitle={t(m.role)}
        actions={<>
          <Button variant="secondary" icon={Power} onClick={() => setConfirm(true)}>{m.status === 'active' ? 'Mark inactive' : 'Mark active'}</Button>
          <Button icon={ArrowRightLeft} onClick={() => setAssign(groups[0]?.id || state.groups[0].id)}>{t("Assign halqa")}</Button>
        </>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3"><Avatar name={m.name} size={56} /><div><Badge tone={m.status === 'active' ? 'green' : 'neutral'}>{m.status}</Badge><p className="mt-1 text-[13px] text-ink-muted">{m.specialisation}</p></div></div>
          <dl className="mt-4 space-y-2 text-[13.5px]">
            <p className="flex gap-2"><Phone size={15} className="text-primary-600" />{m.phone}</p>
            <p className="flex gap-2"><Mail size={15} className="text-primary-600" />{m.email || '—'}</p>
            <p className="flex gap-2"><GraduationCap size={15} className="text-primary-600" />{m.qualification || '—'}</p>
            <p className="flex gap-2"><CalendarDays size={15} className="text-primary-600" />{t("Joined")} {fmtDate(m.joined)}</p>
          </dl>
          <div className="mt-4 flex flex-wrap gap-1.5">{groups.map((g) => <Badge key={g.id} tone="gold">{g.name} · {g.timing}</Badge>)}</div>
        </Card>
        <div className="grid grid-cols-2 gap-2.5 self-start lg:col-span-2 lg:grid-cols-3">
          <Stat label={t("Assigned students")} value={students.length} />
          <Stat label={t("Present today")} value={att.marked ? att.attending : '—'} sub={att.marked ? `${att.absent} absent` : 'Not marked yet'} tone={att.marked ? 'green' : 'amber'} />
          <Stat label={t("Sabaq today")} value={`${sb.done.length}/${sb.present.length}`} sub={sb.pending.length ? `${sb.pending.length} pending` : 'Complete'} tone={sb.pending.length ? 'gold' : 'green'} icon={BookOpenCheck} />
          <Stat label={t("Records (30 days)")} value={last30.length} />
          <Stat label={t("Avg. attendance (30d)")} value={`${avgAtt}%`} />
          <Stat label={t("Students on track")} value={`${onTrack}/${students.length}`} />
        </div>
      </div>
      <h3 className="section-title mb-3 mt-6">{t("Assigned students")}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{students.map((s) => <StudentCard key={s.id} student={s} />)}</div>
      <Card className="mt-6 p-4 sm:p-5">
        <CardHeader title={t("Recent Sabaq records")} className="!p-0 mb-4" />
        <LearningTimeline records={recent} limit={6} showStudent />
      </Card>
      <AssignMentor open={!!assign} groupId={assign} onClose={() => setAssign(null)} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={m.status === 'active' ? 'Mark mentor inactive?' : 'Reactivate mentor?'} confirmLabel={t("Confirm")} tone={m.status === 'active' ? 'danger' : 'primary'}
        onConfirm={() => { dispatch({ type: 'SET_MENTOR_STATUS', id, status: m.status === 'active' ? 'inactive' : 'active' }); toast('Mentor status updated') }}>
        {m.status === 'active' && groups.length ? `${m.name} still leads ${groups.map((g) => g.name).join(', ')}. Reassign the halqa so its students keep a mentor.` : 'The mentor status will be updated.'}
      </ConfirmDialog>
    </div>
  )
}
