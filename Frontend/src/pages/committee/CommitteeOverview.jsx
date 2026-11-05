import { t } from '../../i18n/I18nProvider'
import { BarChart3, Building2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Card, CardHeader, Notice, PageHeader } from '../../components/ui'

// Committee members get read-only analytics across their madrasas (CR-01 §7). The
// dashboards are built in a later phase; until then this page says so plainly
// rather than showing figures that do not exist yet.
export default function CommitteeOverview() {
  const { user } = useAuth()
  const madrasas = user?.madrasas ?? []
  return (
    <div className="max-w-3xl">
      <PageHeader title={t('Overview')} subtitle={t('Read-only analytics for the madrasas you are assigned to')} />
      <Notice tone="blue" icon={BarChart3} className="mb-4">
        {t('Performance dashboards (strength, attendance, Hifz progress, assessments, finance summaries) are being built. They will appear here.')}
      </Notice>
      <Card>
        <CardHeader icon={Building2} title={t('Your madrasas')} />
        <ul className="divide-y divide-line">
          {madrasas.map((m) => (
            <li key={m.id} className="px-4 py-3 text-[14px] font-semibold text-forest sm:px-5">{m.name} <span className="text-[12.5px] font-normal text-ink-muted">· {m.code}</span></li>
          ))}
          {!madrasas.length && <li className="px-4 py-3 text-[13.5px] text-ink-muted sm:px-5">{t('No madrasa is assigned to you yet.')}</li>}
        </ul>
      </Card>
    </div>
  )
}
