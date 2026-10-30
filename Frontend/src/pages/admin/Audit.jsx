import { t } from "../../i18n/I18nProvider"
import { Download, ShieldAlert, History } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../../context/DemoStore'
import { useQueryState } from '../../hooks/useQueryState'
import { PageHeader, Card, SearchInput, Select, Button, Notice, EmptyState, Dot } from '../../components/ui'
import { fmtDateTime } from '../../utils/date'
import { downloadCSV } from '../../utils/csv'
import { ROLE_LABELS } from '../../constants/labels'

export default function Audit() {
  const { state } = useStore()
  const [q, setQ] = useQueryState('q')
  const [action, setAction] = useQueryState('action')
  const [role, setRole] = useQueryState('role')
  const actions = [...new Set(state.audit.map((a) => a.action))].sort()
  const list = state.audit.filter((a) => (!action || a.action === action) && (!role || a.role === role) && (!q || `${a.actor} ${a.entity} ${a.description}`.toLowerCase().includes(q.toLowerCase())))
  const exportCsv = () => downloadCSV('activity-log', list.map((a) => ({ Time: fmtDateTime(a.ts), Actor: a.actor, Role: a.role, Action: a.action, Entity: a.entity, Description: a.description })))
  const link = (a) => a.entityId?.startsWith('S-') ? `/students/${a.entityId}` : a.entityId?.startsWith('EX') ? `/exams/${a.entityId}` : null

  return (
    <div>
      <PageHeader title={t("Activity log")} subtitle={t('{n} of {total} entries', { n: list.length, total: state.audit.length })} actions={<Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!list.length}>{t("Export CSV")}</Button>} />
      <Notice tone="green" icon={ShieldAlert} className="mb-4">{t('Every sign-in, change and export is recorded on the server. Entries cannot be edited or deleted.')}</Notice>
      <Card className="mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_220px_160px] sm:p-4">
        <SearchInput value={q} onChange={setQ} placeholder={t("Search actor, record or description")} />
        <Select aria-label={t("Action")} value={action} onChange={(e) => setAction(e.target.value)} placeholder={t("All actions")} options={actions} />
        <Select aria-label={t("Role")} value={role} onChange={(e) => setRole(e.target.value)} placeholder={t("All roles")} options={[{ value: 'admin', label: 'Admin' }, { value: 'mentor', label: 'Mentor' }, { value: 'parent', label: 'Parent' }, { value: 'student', label: 'Student' }]} />
      </Card>
      <Card>
        {list.length ? (
          <ol className="divide-y divide-line">
            {list.map((a) => {
              const to = link(a)
              const body = (
                <>
                  <Dot tone={a.role === 'admin' ? 'gold' : a.role === 'parent' ? 'blue' : a.role === 'mentor' ? 'green' : 'neutral'} />
                  <div className="-mt-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-[14px] text-forest"><span className="font-bold">{t(a.action)}</span> · {t(a.entity)}</p>
                      <time className="text-[12px] text-ink-muted">{fmtDateTime(a.ts)}</time>
                    </div>
                    <p className="text-[12.5px] text-ink-muted">{a.actor} <span>({t(ROLE_LABELS[a.role] || a.role)})</span> — {a.description}</p>
                  </div>
                </>
              )
              return <li key={a.id}>{to ? <Link to={to} className="flex items-start gap-3 px-4 py-3 hover:bg-ivory-50 sm:px-5">{body}</Link> : <div className="flex items-start gap-3 px-4 py-3 sm:px-5">{body}</div>}</li>
            })}
          </ol>
        ) : <EmptyState icon={History} title={t("No matching activity")} />}
      </Card>
    </div>
  )
}
