import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { BellRing, Send, Settings2, MessageSquare, Clock, CheckCircle2, Info, Save } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { PageHeader, Card, CardHeader, Button, Badge, Modal, Textarea, Input, Segmented, Notice, EmptyState, Tabs, Avatar } from '../../components/ui'
import { reminderQueue } from '../../services/selectors'
import { money } from '../../utils/format'
import { fmtDate, fmtMonth, relativeDay } from '../../utils/date'

export function renderMessage(template, row, settings) {
  return template
    .replaceAll('{guardian}', row.parent?.name || 'Guardian')
    .replaceAll('{madarsa}', settings.brandName)
    .replaceAll('{student}', row.student.name)
    .replaceAll('{period}', fmtMonth(row.invoice.period))
    .replaceAll('{dueDate}', fmtDate(row.invoice.dueDate))
    .replaceAll('{balance}', money(row.balance, settings.currency))
}

export default function Reminders() {
  const { state, idx, today, dispatch } = useStore()
  const toast = useToast()
  const rows = reminderQueue(state, idx, today)
  const [tab, setTab] = useState('queue')
  const [preview, setPreview] = useState(null)
  const [channel, setChannel] = useState('WhatsApp')

  const ready = rows.filter((r) => r.state === 'ready')
  const markSent = (row) => {
    const stage = row.dueStage || row.next
    dispatch({ type: 'MARK_REMINDER_SENT', studentId: row.student.id, invoiceId: row.invoice.id, stage: stage.id, channel })
    toast('Reminder marked as sent', { description: `${row.student.name} · simulated, nothing was transmitted` })
    setPreview(null)
  }

  return (
    <div>
      <PageHeader title={t("Fee reminders")} subtitle={t("Automated reminder schedule for outstanding dues")} />
      <Notice tone="gold" icon={Info} className="mb-4">
        {t('Demonstration only: reminders are previewed and marked as sent locally. No SMS, WhatsApp, push notification or email is delivered. Students are removed from the queue automatically once their dues are cleared.')}
      </Notice>
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {[['Ready to send', ready.length, 'text-clay-600'], ['Scheduled', rows.filter((r) => r.state === 'scheduled').length, 'text-gold-700'], ['With dues', rows.length, 'text-forest']].map(([k, v, c]) => (
          <div key={k} className="card p-3.5"><p className="text-[12px] font-semibold text-ink-muted">{t(k)}</p><p className={`text-[24px] font-extrabold tabular ${c}`}>{v}</p></div>
        ))}
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'queue', label: 'Reminder queue', count: rows.length }, { value: 'schedule', label: 'Schedule & message' }, { value: 'log', label: 'Sent log' }]} />

      {tab === 'queue' && (
        <Card>
          {rows.length ? (
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <li key={row.student.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <Avatar name={row.student.name} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[14px] font-bold text-forest">{row.student.name}</p>
                        <Badge tone={row.overdue ? 'red' : 'gold'}>{row.overdue ? 'Overdue' : 'Upcoming'}</Badge>
                        {row.state === 'ready' && <Badge tone="red" icon={BellRing}>{t("Ready to send")}</Badge>}
                        {row.state === 'complete' && <Badge tone="neutral">{t("All stages sent")}</Badge>}
                      </div>
                      <p className="text-[12.5px] text-ink-muted">{row.parent?.name} · {row.parent?.phone}</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12.5px] sm:grid-cols-4">
                        <span><span className="text-ink-muted">{t("Balance")} </span><b className="tabular text-clay-600">{money(row.balance, state.settings.currency)}</b></span>
                        <span><span className="text-ink-muted">{t("Due")} </span><b>{fmtDate(row.invoice.dueDate)}</b></span>
                        <span><span className="text-ink-muted">{t("Last sent")} </span><b>{row.last ? relativeDay(row.last.sentOn, today) : t('Never')}</b></span>
                        <span><span className="text-ink-muted">{t("Next")} </span><b>{row.next ? `${fmtDate(row.next.date)}` : '—'}</b></span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {row.plan.map((p) => <span key={p.id} title={p.label} className={`chip ${p.sent ? 'bg-primary-50 text-primary-700' : p.date <= today ? 'bg-clay-50 text-clay-700' : 'bg-ivory-100 text-ink-muted'}`}>{p.sent && <CheckCircle2 size={11} />}{p.offset === 0 ? 'Due day' : p.offset < 0 ? `${-p.offset}d before` : `+${p.offset}d`}</span>)}
                      </div>
                    </div>
                    <Button size="sm" variant={row.state === 'ready' ? 'primary' : 'secondary'} icon={MessageSquare} onClick={() => setPreview(row)} disabled={row.state === 'complete'}>{t("Preview")}</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CheckCircle2} title={t("No outstanding dues")}>{t("Every student's fees are cleared, so no reminders are needed.")}</EmptyState>}
        </Card>
      )}

      {tab === 'schedule' && <ScheduleEditor />}

      {tab === 'log' && (
        <Card>
          {state.reminderLog.length ? (
            <ul className="divide-y divide-line">
              {[...state.reminderLog].sort((a, b) => b.sentOn.localeCompare(a.sentOn)).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span><span className="block text-[14px] font-semibold text-forest">{idx.students[l.studentId]?.name}</span><span className="text-[12px] text-ink-muted">{state.reminderSchedule.find((s) => s.id === l.stage)?.label} · {l.channel}</span></span>
                  <span className="text-[12.5px] text-ink-muted">{fmtDate(l.sentOn)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t("No reminders sent yet")} />}
        </Card>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={t("Reminder preview")} subtitle={preview && `${preview.student.name} · ${(preview.dueStage || preview.next)?.label}`}
        footer={<><Button variant="secondary" onClick={() => setPreview(null)}>{t("Close")}</Button><Button icon={Send} onClick={() => markSent(preview)}>{t("Mark as sent (simulated)")}</Button></>}>
        {preview && (
          <div className="space-y-4">
            <div><span className="label">{t("Channel")}</span><Segmented value={channel} onChange={setChannel} label={t("Channel")} options={['WhatsApp', 'SMS', 'Email'].map((c) => ({ value: c, label: c }))} /></div>
            <div className="rounded-2xl bg-[#E9F1EA] p-3">
              <p className="mb-1 text-[11.5px] font-semibold text-ink-muted">{t("To:")} {preview.parent?.name} · {channel === 'Email' ? preview.parent?.email : preview.parent?.phone}</p>
              <div className="max-w-[92%] rounded-2xl rounded-ss-sm bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink shadow-card">{renderMessage(state.reminderTemplate, preview, state.settings)}</div>
            </div>
            <p className="text-[12.5px] text-ink-muted">{t("Marking as sent records it in the log and audit history only. No message leaves this device.")}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

function ScheduleEditor() {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const [schedule, setSchedule] = useState(state.reminderSchedule)
  const [template, setTemplate] = useState(state.reminderTemplate)
  const [error, setError] = useState('')
  const update = (id, patch) => setSchedule((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const save = () => {
    if (schedule.some((s) => !Number.isInteger(Number(s.offset)) || Math.abs(Number(s.offset)) > 60)) return setError('Offsets must be whole days between −60 and 60.')
    if (!template.includes('{balance}') || !template.includes('{student}')) return setError('The message must include {student} and {balance}.')
    setError('')
    dispatch({ type: 'UPDATE_REMINDER_SCHEDULE', schedule: schedule.map((s) => ({ ...s, offset: Number(s.offset) })) })
    dispatch({ type: 'UPDATE_REMINDER_TEMPLATE', template })
    toast('Reminder settings saved')
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={t("Reminder intervals")} subtitle={t("Relative to each invoice's due date")} icon={Clock} />
        <ul className="space-y-2 p-4 sm:p-5">
          {schedule.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" checked={s.enabled} onChange={(e) => update(s.id, { enabled: e.target.checked })} className="h-5 w-5 accent-primary-700" aria-label={`Enable ${s.label}`} />
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-forest">{t(s.label)}</span>
              <Input aria-label={t("Days offset")} type="number" value={s.offset} onChange={(e) => update(s.id, { offset: e.target.value })} className="w-20" />
              <span className="w-10 text-[12px] text-ink-muted">days</span>
            </li>
          ))}
        </ul>
        <p className="px-5 pb-4 text-[12px] text-ink-muted">{t("Negative numbers are days before the due date.")}</p>
      </Card>
      <Card>
        <CardHeader title={t("Message template")} icon={Settings2} />
        <div className="space-y-2 p-4 sm:p-5">
          <Textarea aria-label={t("Message template")} value={template} onChange={(e) => setTemplate(e.target.value)} className="[&_textarea]:min-h-[150px]" />
          <p className="text-[12px] text-ink-muted">{t("Placeholders:")} {'{guardian} {madarsa} {student} {period} {dueDate} {balance}'}</p>
          {error && <p className="rounded-xl bg-clay-50 px-3 py-2 text-[13px] text-clay-700" role="alert">{error}</p>}
          <Button icon={Save} onClick={save} className="w-full">{t("Save reminder settings")}</Button>
        </div>
      </Card>
    </div>
  )
}
