import { t } from '../../i18n/I18nProvider'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { Download, FileText, Inbox } from 'lucide-react'
import { blobUrl, del, get, post } from '../../api/client'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, Input, Modal, Notice, PageHeader, SearchInput, Select, Stat, Tabs, Textarea } from '../../components/ui'
import { downloadCSV } from '../../utils/csv'

// Public applications. The server allows these routes to the Principal alone; nothing here
// is what keeps others out.
const TYPE = { ADMISSION: 'Admission', HALAQA: 'Halaqa', MUREED: 'Mureed', EVENT: 'Event', ENQUIRY: 'Enquiry' }
const STATUS = { PENDING: { label: 'Pending', tone: 'gold' }, INFO_REQUESTED: { label: 'Information requested', tone: 'amber' }, APPROVED: { label: 'Approved', tone: 'green' }, REJECTED: { label: 'Rejected', tone: 'red' }, CLOSED: { label: 'Closed', tone: 'neutral' } }
const TABS = [{ value: '', label: 'All' }, { value: 'ADMISSION', label: 'Admissions' }, { value: 'HALAQA', label: 'Halaqa' }, { value: 'MUREED', label: 'Mureed' }, { value: 'EVENT', label: 'Events' }, { value: 'ENQUIRY', label: 'Enquiries' }]
const when = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

export default function Applications() {
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const load = useCallback(() => {
    const q = new URLSearchParams(Object.entries({ type, status, search, pageSize: '200' }).filter(([, v]) => v))
    return Promise.all([get(`/applications?${q}`), get('/applications/stats')]).then(([r, s]) => { setData(r); setStats(s); setError('') }, (e) => setError(e.message))
  }, [type, status, search])
  useEffect(() => { load() }, [load])
  const exportCsv = () => downloadCSV(`applications-${type || 'all'}`, data.items.map((a) => ({ Reference: a.reference, Type: TYPE[a.type], Status: STATUS[a.status].label, Name: a.applicantName, Phone: a.phone ?? '', Email: a.email ?? '', For: a.target ?? '', Received: a.createdAt.slice(0, 10) })))
  return (
    <div className="space-y-4">
      <PageHeader title={t('Applications')} subtitle={t('From the public website. Visible only to you.')} actions={<Button variant="secondary" icon={Download} disabled={!data?.items.length} onClick={exportCsv}>{t('CSV')}</Button>} />
      {stats && <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4"><Stat label={t('Total')} value={stats.total} tone="green" /><Stat label={t('Pending')} value={stats.pending + stats.infoRequested} tone="gold" /><Stat label={t('Approved')} value={stats.approved} tone="green" /><Stat label={t('Rejected')} value={stats.rejected} tone="red" /></div>}
      <Tabs value={type} onChange={setType} tabs={TABS.map((x) => ({ ...x, count: x.value ? stats?.openByType?.[x.value] : undefined }))} />
      <Card className="grid gap-2 p-3 sm:grid-cols-[1fr_220px] sm:p-4">
        <SearchInput value={search} onChange={setSearch} placeholder={t('Search name, reference, phone or email')} />
        <Select aria-label={t('Status')} value={status} placeholder={t('All statuses')} onChange={(e) => setStatus(e.target.value)} options={Object.entries(STATUS).map(([value, s]) => ({ value, label: t(s.label) }))} />
      </Card>
      {error && <Notice tone="red">{error}</Notice>}
      {data && !data.items.length && <EmptyState icon={Inbox} title={t('No applications')} />}
      {data?.items.length > 0 && (
        <Card><ul className="divide-y divide-line">{data.items.map((a) => (
          <li key={a.id}><button type="button" onClick={() => setOpen(a.id)} className="flex min-h-[56px] w-full flex-wrap items-center gap-2 px-4 py-3 text-start hover:bg-ivory-50 sm:px-5">
            <span className="min-w-[180px] flex-1"><span className="block text-[14px] font-bold text-forest">{a.applicantName}</span><span className="block text-[12px] text-ink-muted">{t(TYPE[a.type])}{a.target ? ` · ${a.target}` : ''} · {a.reference} · {when(a.createdAt)}</span></span>
            <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
          </button></li>
        ))}</ul></Card>
      )}
      {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

function Detail({ id, onClose, onChanged }) {
  const toast = useToast()
  const { run: sensitive, dialog } = useSensitiveAction()
  const [a, setA] = useState(null)
  const [error, setError] = useState('')
  const [action, setAction] = useState(null)
  const [link, setLink] = useState(null)
  const [groups, setGroups] = useState([])
  const [halaqas, setHalaqas] = useState([])
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => get(`/applications/${id}`).then(setA, (e) => setError(e.message)), [id])
  useEffect(() => { load(); get('/groups').then((r) => setGroups(r.items), () => {}); get('/halaqa').then((r) => setHalaqas(r.items), () => {}) }, [load])
  if (!a) return error ? <Modal open onClose={onClose} title={t('Application')}><Notice tone="red">{error}</Notice></Modal> : null
  const open = a.status === 'PENDING' || a.status === 'INFO_REQUESTED'
  const doc = async (d) => { try { const u = await blobUrl(`/applications/documents/${d.id}`); const l = document.createElement('a'); l.href = u; l.download = d.fileName; l.click(); setTimeout(() => URL.revokeObjectURL(u), 10000) } catch (e) { setError(e.message) } }
  const submit = async () => {
    setBusy(true); setError('')
    try {
      if (action.kind === 'approve') { await post(`/applications/${id}/approve`, { ...(action.groupId ? { groupId: action.groupId } : {}), ...(action.halaqaId ? { halaqaId: action.halaqaId } : {}), ...(action.existingParticipantId ? { existingParticipantId: action.existingParticipantId } : {}), ...(action.note ? { note: action.note } : {}) }); toast(t('Approved')) }
      if (action.kind === 'reject') { await post(`/applications/${id}/reject`, { reason: action.text.trim() }); toast(t('Rejected')) }
      if (action.kind === 'close') { await post(`/applications/${id}/close`, action.text ? { note: action.text.trim() } : {}); toast(t('Closed')) }
      if (action.kind === 'info') {
        const r = await post(`/applications/${id}/request-info`, { message: action.text.trim() })
        toast(t('Request recorded'))
        if (r.responseLink) setLink(r.responseLink)
      }
      setAction(null); await load(); onChanged()
    } catch (e) {
      if (e.code === 'PARTICIPANT_EXISTS') setAction({ ...action, match: e.details })
      else setError(Array.isArray(e.details) ? e.details.map((d) => d.message).join(' ') : e.message)
    } finally { setBusy(false) }
  }
  const removeData = async () => { setError(''); try { await sensitive(() => del(`/applications/${id}/personal-data`)); toast(t('Personal data removed')); await load(); onChanged() } catch (e) { if (e.code !== 'CANCELLED') setError(e.message) } }
  return (
    <Modal open onClose={onClose} size="lg" title={a.applicantName} subtitle={`${t(TYPE[a.type])} · ${a.reference}`} footer={<Button variant="secondary" onClick={onClose}>{t('Close')}</Button>}>
      <div className="space-y-4 text-[14px]">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge><span className="text-[12.5px] text-ink-muted">{t('Received')} {when(a.createdAt)}</span></div>
        {error && <Notice tone="red">{error}</Notice>}
        {link && <Notice tone="gold"><b>{t('No email could be sent. Give the applicant this link; it is shown only now:')}</b><span className="mt-1 block break-all font-mono text-[12.5px]">{link}</span></Notice>}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          {[['Phone', a.phone], ['Email', a.email], ['Halaqa', a.halaqa?.name], ['For', a.siteItem?.title], ...Object.entries(a.answers ?? {})].filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="text-ink-muted">{t(k)}</dt><dd className="whitespace-pre-wrap break-words">{String(v)}</dd></Fragment>)}
        </dl>
        {a.documents.length > 0 && <div><h3 className="mb-1 font-bold">{t('Documents')}</h3><ul className="space-y-1">{a.documents.map((d) => <li key={d.id}><button type="button" onClick={() => doc(d)} className="inline-flex min-h-[36px] items-center gap-1.5 font-semibold text-primary-700 underline"><FileText size={15} aria-hidden />{d.fileName}</button> <span className="text-[12px] text-ink-muted">{d.label}</span></li>)}</ul></div>}
        {a.consentAt && <p className="text-[12.5px] text-ink-muted">{t('Consent given')} {when(a.consentAt)}: “{a.consentText}”</p>}
        {open && !action && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setAction({ kind: 'approve', groupId: '', halaqaId: '', note: '' })}>{t('Approve')}</Button>
            <Button size="sm" variant="soft" onClick={() => setAction({ kind: 'info', text: '' })}>{t('Request information')}</Button>
            <Button size="sm" variant="danger-soft" onClick={() => setAction({ kind: 'reject', text: '' })}>{t('Reject')}</Button>
            {a.type === 'ENQUIRY' && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'close', text: '' })}>{t('Close enquiry')}</Button>}
          </div>
        )}
        {action && (
          <div className="space-y-2.5 rounded-xl bg-sage-50 p-3">
            {action.kind === 'approve' && a.type === 'ADMISSION' && <><Notice tone="gold">{t('This creates the student and guardian records. No login is created: accounts follow the usual invitation.')}</Notice><Select label={t('Class')} value={action.groupId} placeholder={t('Choose a class')} onChange={(e) => setAction({ ...action, groupId: e.target.value })} options={groups.map((g) => ({ value: g.id, label: g.name }))} /></>}
            {action.kind === 'approve' && (a.type === 'HALAQA' || a.type === 'MUREED') && <Select label={a.type === 'MUREED' ? t('Also add to a Halaqa (optional)') : t('Halaqa')} value={action.halaqaId || (a.type === 'HALAQA' ? a.halaqa?.id ?? '' : '')} placeholder={t('None')} onChange={(e) => setAction({ ...action, halaqaId: e.target.value })} options={halaqas.map((h) => ({ value: h.id, label: h.name }))} />}
            {action.kind === 'approve' && a.type === 'MUREED' && <p className="text-[12.5px] text-ink-muted">{t('Approving records this person as a Mureed.')}</p>}
            {action.match && <Notice tone="gold">{t('Someone with these contact details is already registered:')} <b>{action.match.fullName}</b>. <button type="button" className="font-semibold underline" onClick={() => setAction({ ...action, existingParticipantId: action.match.participantId, match: null, linked: action.match.fullName })}>{t('Link to this person')}</button></Notice>}
            {action.linked && <p className="font-semibold">{t('Will link to')} {action.linked}</p>}
            {action.kind === 'approve' && <Input label={t('Note (kept in the history)')} value={action.note} maxLength={1000} onChange={(e) => setAction({ ...action, note: e.target.value })} />}
            {action.kind !== 'approve' && <Textarea label={action.kind === 'reject' ? t('Reason (kept private)') : action.kind === 'info' ? t('What do you need from the applicant?') : t('Note')} rows={3} maxLength={2000} value={action.text} onChange={(e) => setAction({ ...action, text: e.target.value })} />}
            <div className="flex gap-2"><Button size="sm" loading={busy} disabled={(action.kind === 'reject' || action.kind === 'info') && action.text.trim().length < 5} onClick={submit}>{t('Confirm')}</Button><Button size="sm" variant="secondary" onClick={() => setAction(null)}>{t('Cancel')}</Button></div>
          </div>
        )}
        <div><h3 className="mb-1 font-bold">{t('History')}</h3><ul className="space-y-1 text-[13px] text-ink-soft">{a.history.map((h) => <li key={h.id}>{when(h.at)} · {h.kind.replace(/_/g, ' ')} · {h.actorName}{h.note ? `: ${h.note}` : ''}</li>)}</ul></div>
        {!open && !a.anonymisedAt && <Button size="sm" variant="ghost" onClick={removeData}>{t('Remove personal data')}</Button>}
      </div>
      {dialog}
    </Modal>
  )
}
