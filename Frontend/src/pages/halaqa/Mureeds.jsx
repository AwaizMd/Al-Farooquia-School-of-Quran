import { t } from '../../i18n/I18nProvider'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { Lock, Plus, Users } from 'lucide-react'
import { del, get, patch, post } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, Input, Modal, Notice, PageHeader, SearchInput, Select, Tabs, Textarea } from '../../components/ui'

// The Mureed directory. Opening a profile is audited on the server, and private notes load
// only when asked for, because each read of them is audited too.
const KIND = { MEETING: 'Meeting', FOLLOW_UP: 'Follow-up', COMMUNICATION: 'Communication' }

export default function Mureeds() {
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  useEffect(() => { get(`/halaqa/participants?mureed=true&pageSize=200${search ? `&search=${encodeURIComponent(search)}` : ''}`).then((r) => { setData(r); setError('') }, (e) => setError(e.message)) }, [search])
  return (
    <div className="space-y-4">
      <PageHeader title={t('Mureed Directory')} subtitle={t('Private to those authorised. Every profile opened is recorded in the activity log.')} />
      <Card className="p-4"><SearchInput value={search} onChange={setSearch} placeholder={t('Search name, phone or email')} /></Card>
      {error && <Notice tone="red">{error}</Notice>}
      {data && !data.items.length && <EmptyState icon={Users} title={t('No Mureeds recorded')}>{t('Add them from Halaqa Programs, or approve a Mureed application.')}</EmptyState>}
      {data?.items.length > 0 && (
        <Card><ul className="divide-y divide-line">{data.items.map((p) => (
          <li key={p.id}><button type="button" onClick={() => setOpen(p.id)} className="flex min-h-[56px] w-full flex-wrap items-center gap-2 px-4 py-3 text-start hover:bg-ivory-50 sm:px-5">
            <span className="min-w-[160px] flex-1"><span className="block text-[14px] font-bold text-forest">{p.fullName}</span><span className="block text-[12px] text-ink-muted">{p.halaqas.map((h) => h.name).join(', ') || t('In no Halaqa')}{p.mureedSince ? ` · ${t('since')} ${p.mureedSince}` : ''}</span></span>
            {p.status === 'INACTIVE' && <Badge>{t('Inactive')}</Badge>}
          </button></li>
        ))}</ul></Card>
      )}
      {open && <Profile id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Profile({ id, onClose }) {
  const auth = useAuth()
  const toast = useToast()
  const manage = auth.can('mureeds.manage')
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const [entry, setEntry] = useState(null)
  const load = useCallback(() => get(`/mureeds/${id}`).then(setP, (e) => setError(e.message)), [id])
  useEffect(() => { load() }, [load])
  const saveEntry = async () => {
    setError('')
    try { await post(`/mureeds/${id}/entries`, { kind: entry.kind, summary: entry.summary.trim(), ...(entry.date ? { date: entry.date } : {}), ...(entry.kind === 'FOLLOW_UP' && entry.dueDate ? { dueDate: entry.dueDate } : {}) }); toast(t('Saved')); setEntry(null); load() } catch (e) { setError(Object.values(e.fieldErrors ?? {})[0] || e.message) }
  }
  const done = async (eid) => { try { await post(`/mureeds/entries/${eid}/done`); load() } catch (e) { setError(e.message) } }
  if (!p) return error ? <Modal open onClose={onClose} title={t('Mureed')}><Notice tone="red">{error}</Notice></Modal> : null
  const tabs = [{ value: 'overview', label: 'Overview' }, { value: 'records', label: 'Records' }, { value: 'attendance', label: 'Attendance' }, ...(p.canSeePrivateNotes ? [{ value: 'notes', label: 'Private notes' }] : [])]
  return (
    <Modal open onClose={onClose} size="lg" title={p.fullName} subtitle={p.mureedSince ? `${t('Mureed since')} ${p.mureedSince}` : t('Mureed')} footer={<Button variant="secondary" onClick={onClose}>{t('Close')}</Button>}>
      <div className="space-y-4 text-[14px]">
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
        {error && <Notice tone="red">{error}</Notice>}
        {tab === 'overview' && (
          <>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
              {[['Status', p.status === 'ACTIVE' ? t('Active') : t('Inactive')], ['Contact number', p.phone], ['Email', p.email], ['Address', p.address], ['Guardian', p.guardianName], ['Guardian contact', p.guardianPhone], ['Date of birth', p.dob], ['Notes', p.notes]].filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="text-ink-muted">{t(k)}</dt><dd className="break-words">{v}</dd></Fragment>)}
            </dl>
            <div><h3 className="mb-1 font-bold">{t('Halaqas')}</h3>{p.memberships.length ? <ul className="space-y-0.5">{p.memberships.map((m) => <li key={m.id}>{m.halaqa.name} · {m.joinedOn}{m.leftOn ? ` – ${m.leftOn}` : ''}</li>)}</ul> : <p className="text-ink-muted">{t('In no Halaqa')}</p>}</div>
          </>
        )}
        {tab === 'records' && (
          <>
            {manage && <Button size="sm" icon={Plus} onClick={() => setEntry({ kind: 'MEETING', summary: '', date: '', dueDate: '' })}>{t('Add record')}</Button>}
            {entry && (
              <div className="space-y-2.5 rounded-xl bg-sage-50 p-3">
                <Select label={t('Type')} value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })} options={Object.entries(KIND).map(([value, l]) => ({ value, label: t(l) }))} />
                <Input label={t('Date')} type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} />
                {entry.kind === 'FOLLOW_UP' && <Input label={t('Due')} type="date" value={entry.dueDate} onChange={(e) => setEntry({ ...entry, dueDate: e.target.value })} />}
                <Textarea label={t('Summary')} rows={3} value={entry.summary} maxLength={2000} onChange={(e) => setEntry({ ...entry, summary: e.target.value })} />
                <div className="flex gap-2"><Button size="sm" disabled={entry.summary.trim().length < 3} onClick={saveEntry}>{t('Save')}</Button><Button size="sm" variant="secondary" onClick={() => setEntry(null)}>{t('Cancel')}</Button></div>
              </div>
            )}
            {!p.entries.length && <p className="text-ink-muted">{t('Nothing recorded yet.')}</p>}
            <ul className="divide-y divide-line">{p.entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-[180px] flex-1"><span className="block text-[12.5px] text-ink-muted">{t(KIND[e.kind])} · {e.date}{e.dueDate ? ` · ${t('due')} ${e.dueDate}` : ''}</span>{e.summary}</span>
                {e.kind === 'FOLLOW_UP' && (e.doneAt ? <Badge tone="green">{t('Done')}</Badge> : manage && <Button size="sm" variant="soft" onClick={() => done(e.id)}>{t('Mark done')}</Button>)}
              </li>
            ))}</ul>
          </>
        )}
        {tab === 'attendance' && (p.attendance.length ? <ul className="divide-y divide-line">{p.attendance.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2 py-2"><span className="min-w-[160px] flex-1">{a.date} · {a.halaqa}{a.topic ? ` · ${a.topic}` : ''}</span><Badge tone={a.status === 'PRESENT' ? 'green' : a.status === 'ABSENT' ? 'red' : 'amber'}>{a.status.charAt(0) + a.status.slice(1).toLowerCase()}</Badge></li>)}</ul> : <p className="text-ink-muted">{t('No attendance yet.')}</p>)}
        {tab === 'notes' && p.canSeePrivateNotes && <PrivateNotes id={id} />}
      </div>
    </Modal>
  )
}

function PrivateNotes({ id }) {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [body, setBody] = useState('')
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(() => get(`/mureeds/${id}/notes`).then((r) => setItems(r.items), (e) => setError(e.message)), [id])
  useEffect(() => { load() }, [load])
  const run = async (fn, msg) => { setError(''); try { await fn(); toast(msg); await load(); return true } catch (e) { setError(e.message); return false } }
  return (
    <div className="space-y-3">
      <Notice tone="gold" icon={Lock}>{t('Only you can read these. They never appear in reports, the website or any other role’s screens. Each time they are opened, that is recorded.')}</Notice>
      {error && <Notice tone="red">{error}</Notice>}
      <Textarea label={t('New note')} rows={3} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
      <Button size="sm" disabled={!body.trim()} onClick={async () => { if (await run(() => post(`/mureeds/${id}/notes`, { body: body.trim() }), t('Saved'))) setBody('') }}>{t('Add note')}</Button>
      <ul className="divide-y divide-line">{items?.map((n) => (
        <li key={n.id} className="py-2.5">
          {edit?.id === n.id
            ? <div className="space-y-2"><Textarea label={t('Note')} rows={3} value={edit.body} maxLength={5000} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /><div className="flex gap-2"><Button size="sm" onClick={async () => { if (await run(() => patch(`/mureeds/notes/${n.id}`, { body: edit.body.trim() }), t('Saved'))) setEdit(null) }}>{t('Save')}</Button><Button size="sm" variant="secondary" onClick={() => setEdit(null)}>{t('Cancel')}</Button></div></div>
            : <><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">{n.authorName} · {new Date(n.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}<button type="button" className="font-semibold underline" onClick={() => setEdit({ id: n.id, body: n.body })}>{t('Edit')}</button><button type="button" className="font-semibold text-clay-700 underline" onClick={() => run(() => del(`/mureeds/notes/${n.id}`), t('Deleted'))}>{t('Delete')}</button></p></>}
        </li>
      ))}</ul>
    </div>
  )
}
