import { t } from "../../i18n/I18nProvider"
import { useEffect, useState } from 'react'
import { Save, Building2, Info, FileText, Activity, Play } from 'lucide-react'
import { get, post, put } from '../../api/client'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { PageHeader, Card, CardHeader, Input, Select, Button, Notice, Segmented, Badge } from '../../components/ui'
import { CURRENCIES } from '../../constants/config'
import { fmtDateTime } from '../../utils/date'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const FIELDS = ['brandName', 'shortName', 'brandArabic', 'tagline', 'address', 'phone', 'email', 'currency', 'weeklyOff', 'feeDueDay']

export default function Settings() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [f, setF] = useState(state.settings)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    if (f.brandName.trim().length < 3) return setError('Enter the Madarsa name.')
    setError('')
    const patch = Object.fromEntries(FIELDS.filter((k) => state.settings[k] !== f[k]).map((k) => [k, k === 'weeklyOff' || k === 'feeDueDay' ? Number(f[k]) : f[k]]))
    if (!Object.keys(patch).length) return toast('No changes to save', { type: 'info' })
    setSaving(true)
    try {
      const saved = await put('/settings', patch)
      dispatch({ type: 'UPDATE_SETTINGS', patch: Object.fromEntries(FIELDS.map((k) => [k, saved[k]])) })
      toast('Settings saved', { description: 'Branding and currency are updated across the app.' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="max-w-2xl">
      <PageHeader title={t("Settings")} subtitle={t("Institution details, parent reports and background jobs")} />
      <Card className="mb-4">
        <CardHeader title={t("Madarsa details")} subtitle={t("Shown across the app, on receipts and in messages")} icon={Building2} />
        <div className="grid gap-3.5 p-4 sm:grid-cols-2 sm:p-5">
          <Input label={t("Madarsa name")} value={f.brandName} onChange={set('brandName')} error={error} />
          <Input label={t("Arabic name")} value={f.brandArabic} onChange={set('brandArabic')} dir="rtl" lang="ar" />
          <Input label={t("Short name")} value={f.shortName} onChange={set('shortName')} />
          <Input label={t("Tagline")} value={f.tagline} onChange={set('tagline')} />
          <Input className="sm:col-span-2" label={t("Address")} value={f.address} onChange={set('address')} />
          <Input label={t("Phone")} value={f.phone} onChange={set('phone')} />
          <Input label={t("Email")} value={f.email} onChange={set('email')} />
          <Select label={t("Currency")} value={f.currency} onChange={set('currency')} options={Object.values(CURRENCIES).map((c) => ({ value: c.code, label: c.label }))} />
          <Select label={t("Weekly holiday")} value={f.weeklyOff} onChange={set('weeklyOff')} options={DAYS.map((d, i) => ({ value: i, label: d }))} />
          <Input label={t("Fee due day of the month")} type="number" min={1} max={28} value={f.feeDueDay} onChange={set('feeDueDay')} />
          <Notice tone="blue" icon={Info} className="sm:col-span-2">{t("Changing the currency changes the symbol for new records only; existing amounts are not converted.")}</Notice>
          <Button icon={Save} onClick={save} loading={saving} className="sm:col-span-2">{t("Save settings")}</Button>
        </div>
      </Card>
      <ReportSchedule />
      <Jobs />
    </div>
  )
}

function ReportSchedule() {
  const toast = useToast()
  const [c, setC] = useState(null)
  const [runs, setRuns] = useState([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    get('/scheduled-reports/config').then(setC, () => setC(false))
    get('/scheduled-reports/runs').then((r) => setRuns(r.items), () => {})
  }, [])
  if (c === null) return null
  if (c === false) return null
  const toggle = (key, value) => setC((x) => ({ ...x, [key]: x[key].includes(value) ? x[key].filter((v) => v !== value) : [...x[key], value] }))
  const save = async () => {
    setSaving(true)
    try {
      setC(await put('/scheduled-reports/config', { enabled: c.enabled, frequency: c.frequency, dayOfWeek: Number(c.dayOfWeek), dayOfMonth: Number(c.dayOfMonth), sendAt: c.sendAt, channels: c.channels, sections: c.sections }))
      toast('Report schedule saved')
    } catch (err) {
      toast(err.message, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card className="mb-4">
      <CardHeader title={t("Parent progress reports")} subtitle={t("Sent automatically to every guardian from saved records")} icon={FileText}
        action={<label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={c.enabled} onChange={(e) => setC({ ...c, enabled: e.target.checked })} className="h-5 w-5 accent-primary-700" />{t("On")}</label>} />
      <div className="grid gap-3.5 p-4 sm:grid-cols-2 sm:p-5">
        <div className="sm:col-span-2"><span className="label">{t("How often")}</span><Segmented value={c.frequency} onChange={(v) => setC({ ...c, frequency: v })} label={t("How often")} options={[{ value: 'MONTHLY', label: t('Monthly (previous month)') }, { value: 'WEEKLY', label: t('Weekly (previous 7 days)') }]} /></div>
        {c.frequency === 'MONTHLY'
          ? <Input label={t("Day of the month")} type="number" min={1} max={28} value={c.dayOfMonth} onChange={(e) => setC({ ...c, dayOfMonth: e.target.value })} />
          : <Select label={t("Day of the week")} value={c.dayOfWeek} onChange={(e) => setC({ ...c, dayOfWeek: e.target.value })} options={DAYS.map((d, i) => ({ value: i, label: d }))} />}
        <Input label={t("Time (Madarsa timezone)")} type="time" value={c.sendAt} onChange={(e) => setC({ ...c, sendAt: e.target.value })} />
        <div>
          <span className="label">{t("Channels")}</span>
          {[['IN_APP', 'In the app'], ['EMAIL', 'Email'], ['WHATSAPP', 'WhatsApp (needs a provider)']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={c.channels.includes(v)} onChange={() => toggle('channels', v)} className="h-4 w-4 accent-primary-700" />{t(l)}</label>
          ))}
        </div>
        <div>
          <span className="label">{t("Sections")}</span>
          {[['attendance', 'Attendance'], ['learning', 'Hifz / Nazira progress'], ['assessments', 'Published results'], ['feedback', 'Mentor feedback']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={c.sections.includes(v)} onChange={() => toggle('sections', v)} className="h-4 w-4 accent-primary-700" />{t(l)}</label>
          ))}
        </div>
        <Button icon={Save} onClick={save} loading={saving} className="sm:col-span-2">{t("Save report schedule")}</Button>
        {runs.length > 0 && (
          <ul className="space-y-1 text-[12.5px] text-ink-muted sm:col-span-2">
            {runs.slice(0, 5).map((r) => <li key={r.id}>{r.periodKey} · <Badge tone={r.status === 'COMPLETED' ? 'green' : r.status === 'FAILED' ? 'red' : 'gold'}>{r.status.toLowerCase()}</Badge> · {r._count.deliveries} {t("messages")} · {fmtDateTime(r.startedAt)}</li>)}
          </ul>
        )}
      </div>
    </Card>
  )
}

function Jobs() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const load = () => get('/admin/jobs').then(setData, () => setData(false))
  useEffect(() => { load() }, [])
  if (!data) return null
  const run = (name) => post(`/admin/jobs/${name}/run`).then(() => { toast('Job finished'); load() }, (err) => toast(err.message, { type: 'error' }))
  return (
    <Card>
      <CardHeader title={t("Background jobs")} subtitle={t("Run by the worker process on schedule; safe to run again")} icon={Activity} />
      <ul className="divide-y divide-line px-4 pb-2 sm:px-5">
        {data.jobs.map((j) => (
          <li key={j.name} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-forest">{t(j.description)}</p>
              <p className="text-[12px] text-ink-muted">{j.lastSucceededAt ? `${t("Last success")} ${fmtDateTime(j.lastSucceededAt)}` : t('Not run yet')}{j.lastError && j.lastFailedAt > (j.lastSucceededAt || '') ? ` · ${t("Last error")}: ${j.lastError}` : ''}</p>
            </div>
            <Button size="sm" variant="ghost" icon={Play} onClick={() => run(j.name)}>{t("Run now")}</Button>
          </li>
        ))}
      </ul>
      <p className="px-5 pb-4 text-[12px] text-ink-muted">{t("Messages:")} {Object.entries(data.deliveries).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(' · ') || '—'}</p>
    </Card>
  )
}
