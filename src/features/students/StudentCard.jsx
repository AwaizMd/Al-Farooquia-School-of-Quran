import { t } from "../../i18n/I18nProvider"
import { Link } from 'react-router-dom'
import { BedDouble } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { Avatar, ProgressBar } from '../../components/ui'
import { AttendanceBadge, LearningBadge } from '../../components/cards/StatusBadges'
import { MiniRecord } from '../sabaq/SabaqViews'
import { currentLevel, learningStatus, recordsFor, latestSchoolDay } from '../../services/selectors'
import { TRACKS } from '../../constants/labels'

export default function StudentCard({ student, to, action }) {
  const { state, idx, today } = useStore()
  const level = currentLevel(state, idx, student.id)
  const ls = learningStatus(idx, student.id, today)
  const status = state.attendance[latestSchoolDay(idx, today)]?.[student.id]
  const last = recordsFor(idx, student.id)[0]
  const group = idx.groups[student.groupId]
  return (
    <div className="card flex h-full flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link to={to || `/students/${student.id}`} className="flex items-start gap-3">
        <Avatar name={student.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-forest">{student.name}</p>
          <p className="truncate text-[12.5px] text-ink-muted">{student.id} · {t(group?.short)} · {t(TRACKS[student.track].label)}</p>
        </div>
        {student.hostel && <BedDouble size={16} className="mt-1 shrink-0 text-slateblue-500" aria-label={t("Hostel resident")} />}
      </Link>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <AttendanceBadge status={status} />
        <LearningBadge status={ls.key} />
        {student.status !== 'active' && <span className="chip bg-ivory-100 text-ink-muted">{t("Inactive")}</span>}
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[12px]">
          <span className="font-semibold text-ink-soft">{level.label}</span>
          {level.progress != null && <span className="text-ink-muted tabular">{level.progress}%</span>}
        </div>
        {level.progress != null && <ProgressBar value={level.progress} height={6} label={t("Learning progress")} tone={ls.key === 'attention' ? 'amber' : 'green'} />}
      </div>
      <div className="mt-3 border-t border-line pt-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{t("Last record")}</p>
        <MiniRecord r={last} className="mt-0.5 truncate" />
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
