import { t } from "../../i18n/I18nProvider"
import { useCallback, useEffect, useState } from 'react'
import { BellRing, Send, Settings2, MessageSquare, Clock, CheckCircle2, Info, Save } from 'lucide-react'
import { get, post, put } from '../../api/client'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { PageHeader, Card, CardHeader, Button, Badge, Modal, Textarea, Input, Notice, EmptyState, Tabs, Avatar } from '../../components/ui'
import { money } from '../../utils/format'
import { fmtDate, fmtMonth, relativeDay } from '../../utils/date'

export function renderMessage(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m)
}

const STATUS_TONE = { SENT: 'green', QUEUED: 'gold', FAILED: 'red', SKIPPED: 'neutral' }
const STATUS_LABEL = { SENT: 'Sent', QUEUED: 'Queued', FAILED: 'Failed', SKIPPED: 'Skipped' }
const REASON = { balance_cleared: 'balance cleared', no_consent: 'no consent / opted out', channel_not_configured: 'channel not set up', no_recipient: 'no contact details', send_failed: 'send failed' }

// Fee reminders are sent by the server on schedule; this page shows what went
// out (and why anything was skipped) and lets the office send one now.
export default function Reminders() {
  const { state, today } = useStore()
  const toast = useToast()
  const canSend = state.session.persona === 'admin'
  const [tab, setTab] = useState('queue')
  const [queue, setQueue] = useState(null)
  const [template, setTemplate] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(() => Promise.all([get('/reminders/queue'), get('/reminders/template')]).then(([q, tm]) => { setQueue(q.items); setTemplate(tm) }, (e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const rows = queue || []
  const stageDue = (row) => row.stages.filter((s) => s.enabled && s.date <= today)
  const sentAny = (s) => s.deliveries.some((d) => d.status === 'SENT')
  const ready = rows.filter((r) => stageDue(r).some((s) => !s.deliveries.length))
  const sendNow = async (row) => {
    try {
      const r = await post(`/reminders/invoices/${row.invoice.id}/send`)
      toast(r.queued ? 'Reminder queued' : 'Nothing to send', { description: r.queued ? `${row.studentName} · delivered within a minute by the background worker` : 'Already sent today, balance cleared, or no contact details.' })
      setPreview(null)
      load()
    } catch (err) {
      toast(err.message, { type: 'error' })
    }
  }
  const varsFor = (row) => ({ guardian: 'Guardian', madarsa: state.settings.brandName, student: row.studentName, period: fmtMonth(row.invoice.period), dueDate: fmtDate(row.invoice.dueDate), balance: money(row.invoice.balanceMinor / 100, state.settings.currency) })

  return (
    <div>
      <PageHeader title={t("Fee reminders")} subtitle={t("Automated reminder schedule for outstanding dues")} />
      <Notice tone="blue" icon={Info} className="mb-4">
        {t('Reminders go out automatically on the schedule below by email and in the app. The balance is checked again just before sending, so nobody is reminded after paying. WhatsApp and SMS start once a provider is set up.')}
      </Notice>
      {error && <Notice tone="red" className="mb-4">{error}</Notice>}
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {[['Due a reminder', ready.length, 'text-clay-600'], ['Overdue', rows.filter((r) => r.invoice.overdue).length, 'text-gold-700'], ['With dues', rows.length, 'text-forest']].map(([k, v, c]) => (
          <div key={k} className="card p-3.5"><p className="text-[12px] font-semibold text-ink-muted">{t(k)}</p><p className={`text-[24px] font-extrabold tabular ${c}`}>{queue ? v : '…'}</p></div>
        ))}
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'queue', label: 'Reminder queue', count: rows.length }, { value: 'schedule', label: 'Schedule & message' }, { value: 'log', label: 'Sent log' }]} />

      {tab === 'queue' && (
        <Card>
          {queue === null ? <p className="px-5 py-6 text-[13.5px] text-ink-muted">{t("Loading…")}</p> : rows.length ? (
            <ul className="divide-y divide-line">
              {rows.map((row) => {
                const last = row.stages.flatMap((s) => s.deliveries).filter((d) => d.sentAt).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0]
                const next = row.stages.find((s) => s.enabled && s.date > today)
                return (
                  <li key={row.invoice.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <Avatar name={row.studentName} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[14px] font-bold text-forest">{row.studentName}</p>
                          <Badge tone={row.invoice.overdue ? 'red' : 'gold'}>{row.invoice.overdue ? 'Overdue' : 'Upcoming'}</Badge>
                        </div>
                        <p className="text-[12.5px] text-ink-muted">{row.invoice.admissionNo} · {fmtMonth(row.invoice.period)}</p>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12.5px] sm:grid-cols-4">
                          <span><span className="text-ink-muted">{t("Balance")} </span><b className="tabular text-clay-600">{money(row.invoice.balanceMinor / 100, state.settings.currency)}</b></span>
                          <span><span className="text-ink-muted">{t("Due")} </span><b>{fmtDate(row.invoice.dueDate)}</b></span>
                          <span><span className="text-ink-muted">{t("Last sent")} </span><b>{last ? relativeDay(last.sentAt.slice(0, 10), today) : t('Never')}</b></span>
                          <span><span className="text-ink-muted">{t("Next")} </span><b>{next ? fmtDate(next.date) : '—'}</b></span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.stages.filter((s) => s.enabled).map((s) => (
                            <span key={s.key} title={s.deliveries.map((d) => `${d.channel}: ${t(STATUS_LABEL[d.status])}${d.lastError ? ` (${t(REASON[d.lastError] || d.lastError)})` : ''}`).join('\n') || s.label}
                              className={`chip ${sentAny(s) ? 'bg-primary-50 text-primary-700' : s.date <= today ? 'bg-clay-50 text-clay-700' : 'bg-ivory-100 text-ink-muted'}`}>
                              {sentAny(s) && <CheckCircle2 size={11} />}{t(s.label)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" icon={MessageSquare} onClick={() => setPreview(row)}>{t("Preview")}</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : <EmptyState icon={CheckCircle2} title={t("No outstanding dues")}>{t("Every student's fees are cleared, so no reminders are needed.")}</EmptyState>}
        </Card>
      )}

      {tab === 'schedule' && <ScheduleEditor canEdit={canSend} onSaved={load} />}
      {tab === 'log' && <SentLog />}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={t("Reminder preview")} subtitle={preview?.studentName}
        footer={<><Button variant="secondary" onClick={() => setPreview(null)}>{t("Close")}</Button>{canSend && <Button icon={Send} onClick={() => sendNow(preview)}>{t("Send reminder now")}</Button>}</>}>
        {preview && template && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#E9F1EA] p-3">
              <p className="mb-1 text-[11.5px] font-semibold text-ink-muted">{renderMessage(template.subject, varsFor(preview))}</p>
              <div className="max-w-[92%] rounded-2xl rounded-ss-sm bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink shadow-card">{renderMessage(template.body, varsFor(preview))}</div>
            </div>
            <p className="text-[12.5px] text-ink-muted">{t("Each guardian with fee access receives it by email and in the app, addressed by name. It is sent at most once a day.")}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

function SentLog() {
  const [items, setItems] = useState(null)
  useEffect(() => { get('/reminders/log').then((r) => setItems(r.items), () => setItems([])) }, [])
  return (
    <Card>
      {items === null ? <p className="px-5 py-6 text-[13.5px] text-ink-muted">{t("Loading…")}</p> : items.length ? (
        <ul className="divide-y divide-line">
          {items.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <span className="min-w-0"><span className="block text-[14px] font-semibold text-forest">{l.student?.name}</span><span className="text-[12px] text-ink-muted">{l.stage?.startsWith('manual') ? t('Sent by the office') : l.stage} · {l.channel}{l.lastError ? ` · ${t(REASON[l.lastError] || l.lastError)}` : ''}</span></span>
              <span className="flex shrink-0 items-center gap-2"><Badge tone={STATUS_TONE[l.status]}>{t(STATUS_LABEL[l.status])}</Badge><span className="text-[12.5px] text-ink-muted">{fmtDate((l.sentAt || l.createdAt).slice(0, 10))}</span></span>
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t("No reminders sent yet")} />}
    </Card>
  )
}

function ScheduleEditor({ canEdit, onSaved }) {
  const toast = useToast()
  const [rules, setRules] = useState(null)
  const [template, setTemplate] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { Promise.all([get('/reminders/rules'), get('/reminders/template')]).then(([r, tm]) => { setRules(r.items); setTemplate(tm) }, (e) => setError(e.message)) }, [])
  const update = (key, patch) => setRules((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const save = async () => {
    if (rules.some((s) => !Number.isInteger(Number(s.offsetDays)) || Number(s.offsetDays) < -30 || Number(s.offsetDays) > 60)) return setError('Offsets must be whole days between −30 and 60.')
    if (!template.body.includes('{balance}') || !template.body.includes('{student}')) return setError('The message must include {student} and {balance}.')
    setError('')
    setSaving(true)
    try {
      await put('/reminders/rules', { rules: rules.map((s) => ({ key: s.key, enabled: s.enabled, offsetDays: Number(s.offsetDays) })) })
      await put('/reminders/template', { subject: template.subject, body: template.body })
      toast('Reminder settings saved')
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  if (!rules || !template) return <Card><p className="px-5 py-6 text-[13.5px] text-ink-muted">{error || t("Loading…")}</p></Card>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={t("Reminder intervals")} subtitle={t("Relative to each invoice's due date")} icon={Clock} />
        <ul className="space-y-2 p-4 sm:p-5">
          {rules.map((s) => (
            <li key={s.key} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" disabled={!canEdit} checked={s.enabled} onChange={(e) => update(s.key, { enabled: e.target.checked })} className="h-5 w-5 accent-primary-700" aria-label={`Enable ${s.label}`} />
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-forest">{t(s.label)}</span>
              <Input aria-label={t("Days offset")} type="number" disabled={!canEdit} value={s.offsetDays} onChange={(e) => update(s.key, { offsetDays: e.target.value })} className="w-20" />
              <span className="w-10 text-[12px] text-ink-muted">days</span>
            </li>
          ))}
        </ul>
        <p className="px-5 pb-4 text-[12px] text-ink-muted">{t("Negative numbers are days before the due date. Reminders are sent at 09:00.")}</p>
      </Card>
      <Card>
        <CardHeader title={t("Message template")} icon={Settings2} />
        <div className="space-y-2 p-4 sm:p-5">
          <Input label={t("Subject")} value={template.subject} disabled={!canEdit} onChange={(e) => setTemplate({ ...template, subject: e.target.value })} />
          <Textarea aria-label={t("Message template")} value={template.body} disabled={!canEdit} onChange={(e) => setTemplate({ ...template, body: e.target.value })} className="[&_textarea]:min-h-[150px]" />
          <p className="text-[12px] text-ink-muted">{t("Placeholders:")} {'{guardian} {madarsa} {student} {period} {dueDate} {balance}'}</p>
          {error && <p className="rounded-xl bg-clay-50 px-3 py-2 text-[13px] text-clay-700" role="alert">{error}</p>}
          {canEdit && <Button icon={Save} onClick={save} loading={saving} className="w-full">{t("Save reminder settings")}</Button>}
          {!canEdit && <p className="text-[12.5px] text-ink-muted"><BellRing size={13} className="me-1 inline" />{t("Only administrators can change reminders.")}</p>}
        </div>
      </Card>
    </div>
  )
}
