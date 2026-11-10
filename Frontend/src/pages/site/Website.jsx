import { t } from '../../i18n/I18nProvider'
import { useCallback, useEffect, useState } from 'react'
import { Eye, Globe, Image as ImageIcon, Plus, Trash2 } from 'lucide-react'
import { del, get, patch, post, put, upload } from '../../api/client'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Notice, PageHeader, Segmented, Select, Stat, Tabs, Textarea } from '../../components/ui'

// Content for the public website. Nothing here touches private records: this is the only
// material the public site can show, and only once published.
const STATUS = { DRAFT: { label: 'Draft', tone: 'neutral' }, PENDING_APPROVAL: { label: 'Waiting for approval', tone: 'amber' }, PUBLISHED: { label: 'Published', tone: 'green' }, ARCHIVED: { label: 'Archived', tone: 'neutral' } }
const TYPES = [{ value: 'PAGE', label: 'Pages' }, { value: 'PROGRAM', label: 'Courses & programs' }, { value: 'ANNOUNCEMENT', label: 'Announcements' }, { value: 'EVENT', label: 'Events' }, { value: 'FAQ', label: 'FAQs' }]
/** The fields each kind of content has beyond title, summary and body. A "lines" field is one entry per line. */
const FIELDS = {
  PROGRAM: [['eligibility', 'Eligibility'], ['duration', 'Duration'], ['timings', 'Timings'], ['seats', 'Available seats'], ['registration', 'Registration instructions', 'long']],
  EVENT: [['date', 'Date', 'date'], ['startTime', 'Start time', 'time'], ['endTime', 'End time', 'time'], ['venue', 'Venue'], ['contactInfo', 'Contact information'], ['registration', 'Registration instructions', 'long']],
  ANNOUNCEMENT: [], FAQ: [],
}
/** The fixed pages of the site and what each holds. */
const PAGES = {
  home: { title: 'Home page', fields: [['mission', 'Mission', 'long'], ['vision', 'Vision', 'long'], ['principalIntro', 'Principal’s introduction (only if approved for publication)', 'long'], ['halaqaInfo', 'About the Halaqas', 'long'], ['admissionInfo', 'About admissions', 'long']] },
  about: { title: 'About us', fields: [['history', 'History', 'long'], ['mission', 'Mission', 'long'], ['vision', 'Vision', 'long'], ['philosophy', 'Educational philosophy', 'long'], ['principalName', 'Principal’s public name'], ['principalProfile', 'Principal’s public profile', 'long'], ['achievements', 'Achievements (one per line)', 'long'], ['facilities', 'Facilities (one per line)', 'long']] },
  admissions: { title: 'Admissions', fields: [['process', 'Admission process (one step per line)', 'long'], ['eligibility', 'Eligibility', 'long'], ['documents', 'Required documents (one per line)', 'long'], ['dates', 'Important dates (one per line)', 'long']] },
}
const FORMS = [['ADMISSION', 'Student admission'], ['HALAQA', 'Halaqa registration'], ['MUREED', 'Mureed registration'], ['EVENT', 'Event registration'], ['ENQUIRY', 'General enquiry']]
const FIELD_TYPES = ['text', 'textarea', 'date', 'tel', 'email', 'number', 'select']

const local = (d) => { if (!d) return ''; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }

export default function Website() {
  const auth = useAuth()
  const [tab, setTab] = useState('overview')
  const publish = auth.can('site.publish')
  return (
    <div className="space-y-4">
      <PageHeader title={t('Public Website')} subtitle={t('Content for the public site. Only what is published appears there.')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'content', label: 'Content' }, { value: 'settings', label: 'Settings' }]} />
      {tab === 'overview' && <Overview />}
      {tab === 'content' && <Content publish={publish} />}
      {tab === 'settings' && <Settings canEdit={publish} />}
    </div>
  )
}

function Overview() {
  const auth = useAuth()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([get('/site/items'), get('/site/domains'), auth.can('applications.read') ? get('/applications/stats') : null, auth.can('halaqa.read') ? get('/halaqa/dashboard') : null]).then(([items, domains, apps, halaqa]) => setD({ items: items.items, domains: domains.items, apps, halaqa }), (e) => setError(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <Notice tone="red">{error}</Notice>
  if (!d) return null
  const now = new Date()
  const n = (s) => d.items.filter((i) => i.status === s).length
  const upcoming = d.items.filter((i) => i.type === 'EVENT' && i.status === 'PUBLISHED' && String(i.data?.date ?? '') >= now.toISOString().slice(0, 10)).length
  return (
    <>
      {!d.domains.length && <Notice tone="gold">{t('No website address has been added yet, so the site cannot be reached. Add one under Settings.')}</Notice>}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {d.apps && <><Stat label={t('Total applications')} value={d.apps.total} tone="green" /><Stat label={t('Pending')} value={d.apps.pending + d.apps.infoRequested} tone="gold" to="/applications" /><Stat label={t('Approved')} value={d.apps.approved} tone="green" /><Stat label={t('Rejected')} value={d.apps.rejected} tone="red" /><Stat label={t('New enquiries')} value={d.apps.newEnquiries} tone="blue" /></>}
        <Stat label={t('Upcoming events')} value={upcoming} tone="amber" />
        {d.halaqa && <><Stat label={t('Active Halaqas')} value={d.halaqa.activeHalaqas} tone="green" /><Stat label={t('Halaqa participants')} value={d.halaqa.totalParticipants} tone="gold" /></>}
        <Stat label={t('Published items')} value={n('PUBLISHED')} sub={`${n('DRAFT')} ${t('drafts')} · ${n('PENDING_APPROVAL')} ${t('waiting')}`} tone="green" />
      </div>
    </>
  )
}

// ---------- Content ----------

function Content({ publish }) {
  const toast = useToast()
  const [type, setType] = useState('PAGE')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => get(`/site/items?type=${type}`).then((r) => { setData(r); setError('') }, (e) => setError(e.message)), [type])
  useEffect(() => { load() }, [load])
  const setStatus = async (i, status, msg) => { try { await post(`/site/items/${i.id}/status`, { status }); toast(msg); load() } catch (e) { toast(e.message, { type: 'error' }) } }
  const remove = async (i) => { try { await del(`/site/items/${i.id}`); toast(t('Deleted')); load() } catch (e) { toast(e.message, { type: 'error' }) } }
  const preview = async (i) => { try { const r = await post(`/site/items/${i.id}/preview`); if (r.url) window.open(r.url, '_blank', 'noopener'); else toast(t('Add a website address first.'), { type: 'error' }) } catch (e) { toast(e.message, { type: 'error' }) } }
  const missing = type === 'PAGE' ? Object.keys(PAGES).filter((slug) => !data?.items.some((i) => i.slug === slug)) : []
  return (
    <>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Select label={t('Content')} value={type} onChange={(e) => setType(e.target.value)} options={TYPES.map((x) => ({ value: x.value, label: t(x.label) }))} />
        {type !== 'PAGE' && <Button icon={Plus} onClick={() => setEdit({ type, title: '', summary: '', body: '', data: {} })}>{t('New')}</Button>}
        {missing.map((slug) => <Button key={slug} variant="secondary" icon={Plus} onClick={() => setEdit({ type: 'PAGE', slug, title: t(PAGES[slug].title), summary: '', body: '', data: {} })}>{t(PAGES[slug].title)}</Button>)}
      </Card>
      {!publish && <Notice tone="gold">{t('You can draft and send for approval. The Principal publishes.')}</Notice>}
      {error && <Notice tone="red">{error}</Notice>}
      {data && !data.items.length && <EmptyState icon={Globe} title={t('Nothing here yet')} />}
      {data?.items.length > 0 && (
        <Card><ul className="divide-y divide-line">{data.items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
            <span className="min-w-[180px] flex-1"><span className="block text-[14px] font-bold text-forest">{i.title}</span><span className="block text-[12px] text-ink-muted">/{i.slug}{i.publishAt ? ` · ${t('from')} ${new Date(i.publishAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}{i.expiresAt ? ` · ${t('until')} ${new Date(i.expiresAt).toLocaleDateString('en-IN')}` : ''}</span></span>
            {i.featured && <Badge tone="gold">{t('Featured')}</Badge>}
            <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
            <Button size="sm" variant="ghost" icon={Eye} onClick={() => preview(i)}>{t('Preview')}</Button>
            <Button size="sm" variant="soft" onClick={() => setEdit({ ...i, summary: i.summary ?? '', body: i.body ?? '', category: i.category ?? '' })}>{t('Edit')}</Button>
            {i.status !== 'PUBLISHED' && publish && <Button size="sm" onClick={() => setStatus(i, 'PUBLISHED', t('Published'))}>{t('Publish')}</Button>}
            {i.status === 'DRAFT' && !publish && <Button size="sm" variant="soft" onClick={() => setStatus(i, 'PENDING_APPROVAL', t('Sent for approval'))}>{t('Send for approval')}</Button>}
            {i.status === 'PUBLISHED' && <Button size="sm" variant="danger-soft" onClick={() => setStatus(i, 'DRAFT', t('Unpublished'))}>{t('Unpublish')}</Button>}
            {i.status !== 'PUBLISHED' && i.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" onClick={() => setStatus(i, 'ARCHIVED', t('Archived'))}>{t('Archive')}</Button>}
            {i.status !== 'PUBLISHED' && <Button size="sm" variant="ghost" icon={Trash2} aria-label={t('Delete')} onClick={() => remove(i)} />}
          </li>
        ))}</ul></Card>
      )}
      <Editor item={edit} onClose={() => setEdit(null)} onSaved={load} />
    </>
  )
}

function Editor({ item, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(null)
  const [assets, setAssets] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!item) return
    setError('')
    setF({ ...item, publishAtLocal: local(item.publishAt), expiresAtLocal: local(item.expiresAt), imageId: item.imageId ?? '', ar: item.data?.ar ?? {} })
    get('/site/assets').then((r) => setAssets(r.items), () => setAssets([]))
  }, [item])
  if (!item || !f) return null
  const defs = f.type === 'PAGE' ? PAGES[f.slug]?.fields ?? [] : FIELDS[f.type] ?? []
  const setData = (k, v) => setF({ ...f, data: { ...f.data, [k]: v } })
  const setAr = (k, v) => setF({ ...f, ar: { ...f.ar, [k]: v } })
  const save = async () => {
    setBusy(true); setError('')
    const ar = Object.fromEntries(Object.entries(f.ar).filter(([, v]) => String(v ?? '').trim()))
    const { ar: _old, ...rest } = f.data ?? {}
    const body = { title: f.title.trim(), summary: f.summary || null, body: f.body || null, data: { ...rest, ...(Object.keys(ar).length ? { ar } : {}) }, category: f.category || null, imageId: f.imageId || null, featured: !!f.featured, publishAt: f.publishAtLocal ? new Date(f.publishAtLocal).toISOString() : null, expiresAt: f.expiresAtLocal ? new Date(f.expiresAtLocal).toISOString() : null, ...(f.slug ? { slug: f.slug } : {}) }
    try { if (f.id) await patch(`/site/items/${f.id}`, body); else await post('/site/items', { type: f.type, ...body }); toast(t('Saved')); onClose(); onSaved() } catch (e) { setError(Object.values(e.fieldErrors ?? {})[0] || e.message) } finally { setBusy(false) }
  }
  const addImage = async (e) => { const file = e.target.files?.[0]; if (!file) return; setError(''); try { const a = await upload('/site/assets', file, { method: 'POST' }); setAssets([{ id: a.id, fileName: a.fileName }, ...assets]); setF((x) => ({ ...x, imageId: a.id })) } catch (err) { setError(err.message) } }
  const control = ([k, label, kind], value, onChange) => (kind === 'long' ? <Textarea key={k} label={t(label)} rows={3} value={value ?? ''} onChange={(e) => onChange(k, e.target.value)} /> : <Input key={k} label={t(label)} type={kind ?? 'text'} value={value ?? ''} onChange={(e) => onChange(k, e.target.value)} />)
  return (
    <Modal open onClose={onClose} size="xl" title={t(f.id ? 'Edit' : 'New')} subtitle={f.type === 'PAGE' ? t(PAGES[f.slug]?.title ?? '') : ''} footer={<>{error && <Notice tone="red" className="w-full">{error}</Notice>}<Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button onClick={save} loading={busy}>{t('Save')}</Button></>}>
      <div className="space-y-3.5">
        <Notice tone="gold">{t('Saving does not publish. Text is shown exactly as written; a blank line starts a new paragraph.')}</Notice>
        <Input label={t('Title')} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
        {f.type !== 'PAGE' && <Input label={t('Web address (optional)')} hint={t('Letters, numbers and hyphens. Made from the title if left empty.')} value={f.slug ?? ''} maxLength={80} onChange={(e) => setF({ ...f, slug: e.target.value })} />}
        <Textarea label={t('Short summary')} rows={2} maxLength={1000} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        <Textarea label={t(f.type === 'FAQ' ? 'Answer' : 'Text')} rows={6} maxLength={20000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        {defs.map((d) => control(d, f.data?.[d[0]], setData))}
        {f.type === 'EVENT' && <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" checked={f.data?.registrationOpen === true} onChange={(e) => setData('registrationOpen', e.target.checked)} />{t('Open for registration on the website')}</label>}
        {f.type !== 'FAQ' && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1"><Select label={t('Image')} value={f.imageId} placeholder={t('None')} onChange={(e) => setF({ ...f, imageId: e.target.value })} options={assets.map((a) => ({ value: a.id, label: a.fileName }))} /></div>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-sage-100 px-4 text-[14px] font-semibold text-primary-800"><ImageIcon size={16} aria-hidden />{t('Upload image')}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={addImage} /></label>
          </div>
        )}
        {f.type === 'ANNOUNCEMENT' && <Input label={t('Category')} value={f.category ?? ''} maxLength={60} onChange={(e) => setF({ ...f, category: e.target.value })} />}
        {(f.type === 'ANNOUNCEMENT' || f.type === 'EVENT' || f.type === 'PROGRAM') && <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" checked={!!f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} />{t('Feature this at the top')}</label>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t('Publish from (optional)')} type="datetime-local" value={f.publishAtLocal} onChange={(e) => setF({ ...f, publishAtLocal: e.target.value })} />
          <Input label={t('Expires (optional)')} type="datetime-local" value={f.expiresAtLocal} onChange={(e) => setF({ ...f, expiresAtLocal: e.target.value })} />
        </div>
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-[14px] font-semibold">{t('Arabic version (optional)')}</summary>
          <div className="mt-3 space-y-3" dir="rtl">
            <Input label={t('Title')} value={f.ar.title ?? ''} onChange={(e) => setAr('title', e.target.value)} />
            <Textarea label={t('Short summary')} rows={2} value={f.ar.summary ?? ''} onChange={(e) => setAr('summary', e.target.value)} />
            <Textarea label={t('Text')} rows={5} value={f.ar.body ?? ''} onChange={(e) => setAr('body', e.target.value)} />
            {defs.filter((d) => !d[2] || d[2] === 'long').map((d) => control(d, f.ar[d[0]], setAr))}
          </div>
        </details>
      </div>
    </Modal>
  )
}

// ---------- Settings ----------

function Settings({ canEdit }) {
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const [c, setC] = useState(null)
  const [domains, setDomains] = useState([])
  const [assets, setAssets] = useState([])
  const [host, setHost] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const loadDomains = () => get('/site/domains').then((r) => setDomains(r.items))
  useEffect(() => { get('/site/settings').then(setC, (e) => setError(e.message)); loadDomains(); get('/site/assets').then((r) => setAssets(r.items), () => {}) }, [])
  if (!c) return error ? <Notice tone="red">{error}</Notice> : null
  const off = !canEdit
  const set = (k, v) => setC({ ...c, [k]: v })
  const setForm = (type, patchIn) => setC({ ...c, forms: { ...c.forms, [type]: { ...c.forms[type], ...patchIn } } })
  const save = async () => { setBusy(true); setError(''); try { setC(await put('/site/settings', c)); toast(t('Saved')) } catch (e) { setError(Object.values(e.fieldErrors ?? {})[0] || e.message) } finally { setBusy(false) } }
  const addDomain = async () => { setError(''); try { await run(() => post('/site/domains', { hostname: host.trim() })); setHost(''); loadDomains(); toast(t('Saved')) } catch (e) { if (e.code !== 'CANCELLED') setError(Object.values(e.fieldErrors ?? {})[0] || e.message) } }
  const removeDomain = async (id) => { setError(''); try { await run(() => del(`/site/domains/${id}`)); loadDomains() } catch (e) { if (e.code !== 'CANCELLED') setError(e.message) } }
  const addLogo = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const a = await upload('/site/assets', f, { method: 'POST' }); setAssets([{ id: a.id, fileName: a.fileName }, ...assets]); set('logoAssetId', a.id) } catch (err) { setError(err.message) } }
  const contact = (k, label, type = 'text') => <Input key={k} label={t(label)} type={type} disabled={off} value={c.contact[k]} onChange={(e) => set('contact', { ...c.contact, [k]: e.target.value })} />
  return (
    <>
      {off && <Notice tone="gold">{t('Only the Principal can change these.')}</Notice>}
      <Card>
        <CardHeader title={t('Website addresses')} subtitle={t('The address decides which madrasa’s website is shown. Point the domain at the server first.')} />
        <div className="space-y-3 p-4 sm:p-5">
          {domains.map((d) => <p key={d.id} className="flex flex-wrap items-center gap-2 text-[14px]"><b>{d.hostname}</b>{canEdit && <Button size="sm" variant="ghost" onClick={() => removeDomain(d.id)}>{t('Remove')}</Button>}</p>)}
          {canEdit && <div className="flex flex-wrap items-end gap-2"><div className="min-w-[220px] flex-1"><Input label={t('Add an address')} placeholder="madarsa.example.org" value={host} onChange={(e) => setHost(e.target.value)} /></div><Button variant="secondary" disabled={host.trim().length < 3} onClick={addDomain}>{t('Add')}</Button></div>}
        </div>
      </Card>
      <Card>
        <CardHeader title={t('Branding')} />
        <div className="grid gap-3.5 p-4 sm:grid-cols-2 sm:p-5">
          <Input label={t('Name on the website')} hint={t('The madrasa’s name is used if left empty.')} disabled={off} value={c.siteName} onChange={(e) => set('siteName', e.target.value)} />
          <Input label={t('Name in Arabic')} dir="rtl" disabled={off} value={c.siteNameAr} onChange={(e) => set('siteNameAr', e.target.value)} />
          <div className="sm:col-span-2"><Input label={t('Tagline')} disabled={off} value={c.tagline} onChange={(e) => set('tagline', e.target.value)} /></div>
          <Input label={t('Main colour')} type="color" disabled={off} value={c.colors.primary} onChange={(e) => set('colors', { ...c.colors, primary: e.target.value })} />
          <Input label={t('Accent colour')} type="color" disabled={off} value={c.colors.accent} onChange={(e) => set('colors', { ...c.colors, accent: e.target.value })} />
          <Select label={t('Logo')} disabled={off} value={c.logoAssetId ?? ''} placeholder={t('None')} onChange={(e) => set('logoAssetId', e.target.value || null)} options={assets.map((a) => ({ value: a.id, label: a.fileName }))} />
          {canEdit && <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 self-end rounded-xl bg-sage-100 px-4 text-[14px] font-semibold text-primary-800"><ImageIcon size={16} aria-hidden />{t('Upload logo')}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={addLogo} /></label>}
          <Segmented label={t('Languages')} value={c.languages.includes('ar') ? 'both' : 'en'} onChange={(v) => set('languages', v === 'both' ? ['en', 'ar'] : ['en'])} options={[{ value: 'en', label: 'English' }, { value: 'both', label: t('English and Arabic') }]} />
        </div>
      </Card>
      <Card>
        <CardHeader title={t('Contact details')} />
        <div className="grid gap-3.5 p-4 sm:grid-cols-2 sm:p-5">{contact('address', 'Address')}{contact('phone', 'Phone', 'tel')}{contact('email', 'Email', 'email')}{contact('hours', 'Office hours')}{contact('mapUrl', 'Map link (https://)', 'url')}</div>
      </Card>
      <Card>
        <CardHeader title={t('Registration forms')} subtitle={t('Name and a way of contact are always asked for. Everything else is yours to choose.')} />
        <div className="space-y-5 p-4 sm:p-5">
          {FORMS.map(([type, label]) => <FormEditor key={type} label={t(label)} form={c.forms[type]} off={off} onChange={(p) => setForm(type, p)} />)}
        </div>
      </Card>
      <Card>
        <CardHeader title={t('Privacy and applications')} />
        <div className="space-y-3.5 p-4 sm:p-5">
          <Textarea label={t('Privacy notice (shown on the website)')} rows={5} maxLength={5000} disabled={off} value={c.privacyNotice} onChange={(e) => set('privacyNotice', e.target.value)} />
          <Textarea label={t('Consent wording on every form')} rows={2} maxLength={500} disabled={off} value={c.consentText} onChange={(e) => set('consentText', e.target.value)} />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input label={t('Treat as a duplicate within (days, 0 = off)')} inputMode="numeric" disabled={off} value={c.duplicateWindowDays} onChange={(e) => set('duplicateWindowDays', Number(e.target.value) || 0)} />
            <Input label={t('Remove personal data after a decision (days, 0 = keep)')} inputMode="numeric" disabled={off} value={c.retentionDays} onChange={(e) => set('retentionDays', Number(e.target.value) || 0)} />
          </div>
          <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" disabled={off} checked={c.notifyApplicants} onChange={(e) => set('notifyApplicants', e.target.checked)} />{t('Email applicants when their application is received and decided')}</label>
          <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" disabled={off} checked={c.showSeats} onChange={(e) => set('showSeats', e.target.checked)} />{t('Show available seats on programs')}</label>
        </div>
      </Card>
      {error && <Notice tone="red">{error}</Notice>}
      {canEdit && <div><Button onClick={save} loading={busy}>{t('Save settings')}</Button></div>}
      {dialog}
    </>
  )
}

function FormEditor({ label, form, off, onChange }) {
  const [open, setOpen] = useState(false)
  const setField = (i, p) => onChange({ fields: form.fields.map((x, n) => (n === i ? { ...x, ...p } : x)) })
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[44px] flex-1 items-center gap-2.5 text-[14px] font-semibold"><input type="checkbox" disabled={off} checked={form.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />{label}</label>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{t(open ? 'Hide fields' : 'Fields')}</Button>
      </div>
      {open && (
        <div className="mt-2 space-y-3">
          <Textarea label={t('Instructions shown above the form')} rows={2} disabled={off} value={form.instructions} onChange={(e) => onChange({ instructions: e.target.value })} />
          <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" disabled={off} checked={form.allowDocuments} onChange={(e) => onChange({ allowDocuments: e.target.checked })} />{t('Applicants can attach documents')}</label>
          {form.fields.map((f, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <div className="min-w-[180px] flex-1"><Input label={t('Label')} disabled={off} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} /></div>
              <Select label={t('Type')} disabled={off} value={f.type} onChange={(e) => setField(i, { type: e.target.value })} options={FIELD_TYPES.map((v) => ({ value: v, label: v }))} />
              {f.type === 'select' && <div className="min-w-[180px] flex-1"><Input label={t('Choices, separated by commas')} disabled={off} value={(f.options ?? []).join(', ')} onChange={(e) => setField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></div>}
              <label className="flex min-h-[44px] items-center gap-2 text-[13.5px]"><input type="checkbox" disabled={off} checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />{t('Required')}</label>
              {!off && <Button size="sm" variant="ghost" icon={Trash2} aria-label={t('Remove')} onClick={() => onChange({ fields: form.fields.filter((_, n) => n !== i) })} />}
            </div>
          ))}
          {!off && <Button size="sm" variant="secondary" icon={Plus} onClick={() => onChange({ fields: [...form.fields, { key: `field${Date.now().toString(36)}`, label: t('New field'), type: 'text', required: false }] })}>{t('Add field')}</Button>}
        </div>
      )}
    </div>
  )
}
