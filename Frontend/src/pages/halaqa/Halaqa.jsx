import { t } from '../../i18n/I18nProvider'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Download, Plus, QrCode, Send, UserPlus, Users } from 'lucide-react'
import { blobUrl, get, patch, post, put, upload } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useStore } from '../../context/DemoStore'
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Notice, PageHeader, SearchInput, Segmented, Select, Stat, Tabs, Textarea } from '../../components/ui'
import { useQrScanner } from '../../kiosk/useQrScanner'
import { downloadCSV } from '../../utils/csv'
import { todayISO } from '../../utils/date'

// Halaqa programs: separate from the academic halqa (Group) and its attendance.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STATUS_TONE = { PLANNED: 'blue', ACTIVE: 'green', PAUSED: 'amber', ENDED: 'neutral', SCHEDULED: 'blue', COMPLETED: 'green', CANCELLED: 'red', INACTIVE: 'neutral', PRESENT: 'green', ABSENT: 'red', EXCUSED: 'amber' }
const label = (s) => s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')
const blank = (v) => (v === '' || v === undefined ? null : v)

const useLoad = (path) => {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(() => (path ? get(path).then((r) => { setData(r); setError('') }, (e) => setError(e.message)) : Promise.resolve()), [path])
  useEffect(() => { load() }, [load])
  return { data, error, load }
}

export default function Halaqa() {
  const auth = useAuth()
  const full = auth.can('halaqa.read')
  const manage = auth.can('halaqa.manage')
  const [tab, setTab] = useState(full ? 'overview' : 'sessions')
  const tabs = full ? [{ value: 'overview', label: 'Overview' }, { value: 'halaqas', label: 'Halaqas' }, { value: 'participants', label: 'Participants' }, { value: 'sessions', label: 'Sessions' }, { value: 'reports', label: 'Reports' }, { value: 'messages', label: 'Messages' }] : [{ value: 'sessions', label: 'Sessions' }]
  return (
    <div className="space-y-4">
      <PageHeader title={t('Halaqa Programs')} subtitle={t('Gatherings, participants, sessions and their attendance. Regular class attendance is not affected.')} />
      {tabs.length > 1 && <Tabs value={tab} onChange={setTab} tabs={tabs} />}
      {tab === 'overview' && <Overview />}
      {tab === 'halaqas' && <Halaqas manage={manage} />}
      {tab === 'participants' && <Participants manage={manage} />}
      {tab === 'sessions' && <Sessions manage={manage} />}
      {tab === 'reports' && <Reports />}
      {tab === 'messages' && <Messages manage={manage} />}
    </div>
  )
}

// ---------- Overview ----------

function Overview() {
  const { data: d, error } = useLoad('/halaqa/dashboard')
  if (error) return <Notice tone="red">{error}</Notice>
  if (!d) return null
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label={t('Total Halaqas')} value={d.totalHalaqas} sub={`${d.activeHalaqas} ${t('active')}`} tone="green" />
        <Stat label={t('Participants')} value={d.totalParticipants} sub={`${d.inactiveParticipants} ${t('inactive')}`} tone="gold" />
        {d.totalMureeds !== null && <Stat label={t('Mureeds')} value={d.totalMureeds} tone="blue" />}
        <Stat label={t('Upcoming sessions')} value={d.upcomingSessions} sub={`${d.completedSessions} ${t('completed')}`} tone="amber" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('Attendance, last 30 days')} />
          <p className="p-4 text-[14px] tabular sm:px-5">{t('Present')} <b>{d.attendance30Days.present}</b> · {t('Absent')} <b>{d.attendance30Days.absent}</b> · {t('Excused')} <b>{d.attendance30Days.excused}</b></p>
          <CardHeader title={t('Next sessions')} className="!pt-0" />
          {d.nextSessions.length ? <ul className="mt-1 divide-y divide-line">{d.nextSessions.map((s) => <li key={s.id} className="px-4 py-2.5 text-[14px] sm:px-5"><b className="text-forest">{s.halaqaName}</b><span className="block text-[12.5px] text-ink-muted">{s.date}{s.startTime ? ` · ${s.startTime}` : ''}{s.topic ? ` · ${s.topic}` : ''}</span></li>)}</ul> : <p className="px-4 pb-4 text-[13.5px] text-ink-muted sm:px-5">{t('Nothing scheduled.')}</p>}
        </Card>
        <Card>
          <CardHeader title={t('Recent activity')} />
          {d.recentActivity.length ? <ul className="mt-1 divide-y divide-line">{d.recentActivity.map((e) => <li key={e.id} className="px-4 py-2.5 text-[14px] sm:px-5">{e.participant}: {e.summary}<span className="block text-[12.5px] text-ink-muted">{new Date(e.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></li>)}</ul> : <p className="px-4 pb-4 text-[13.5px] text-ink-muted sm:px-5">{t('Nothing yet.')}</p>}
        </Card>
      </div>
    </>
  )
}

// ---------- Halaqas ----------

const BLANK_HALAQA = { name: '', categoryId: '', description: '', purpose: '', location: '', teacherStaffId: '', frequency: 'WEEKLY', meetingDays: [], startTime: '', endTime: '', startDate: '', endDate: '', maxParticipants: '', status: 'PLANNED', instructions: '', allowQr: true, teacherWindowDays: '2', excusedCounts: false, isPublic: false, publicName: '', publicDescription: '', publicEligibility: '', registrationOpen: false }

function Halaqas({ manage }) {
  const { data, error, load } = useLoad('/halaqa')
  const cats = useLoad('/halaqa/categories')
  const staff = useLoad('/staff')
  const [form, setForm] = useState(null)
  const [members, setMembers] = useState(null)
  const [catName, setCatName] = useState('')
  const toast = useToast()
  const addCat = async () => { try { await post('/halaqa/categories', { name: catName.trim() }); setCatName(''); cats.load(); toast(t('Category added')) } catch (e) { toast(e.message, { type: 'error' }) } }
  if (error) return <Notice tone="red">{error}</Notice>
  return (
    <>
      {manage && (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Button icon={Plus} onClick={() => setForm({ ...BLANK_HALAQA, categoryId: cats.data?.items[0]?.id ?? '' })}>{t('New Halaqa')}</Button>
          <div className="ms-auto flex flex-wrap items-end gap-2"><Input label={t('New category')} value={catName} maxLength={60} onChange={(e) => setCatName(e.target.value)} /><Button variant="secondary" disabled={catName.trim().length < 2} onClick={addCat}>{t('Add')}</Button></div>
        </Card>
      )}
      {data && !data.items.length && <EmptyState icon={Users} title={t('No Halaqas yet')}>{t('Create the first one to begin.')}</EmptyState>}
      {data?.items.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {data.items.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span className="min-w-[180px] flex-1"><span className="block text-[14px] font-bold text-forest">{h.name}</span><span className="block text-[12px] text-ink-muted">{h.category.name} · {h.teacher?.displayName ?? t('No teacher')} · {h.activeMembers}{h.maxParticipants ? `/${h.maxParticipants}` : ''} {t('participants')}</span></span>
                {h.isPublic && <Badge tone="gold">{t('On website')}</Badge>}
                <Badge tone={STATUS_TONE[h.status]}>{label(h.status)}</Badge>
                <Button size="sm" variant="soft" onClick={() => setMembers(h)}>{t('Members')}</Button>
                {manage && <Button size="sm" variant="ghost" onClick={() => setForm({ ...BLANK_HALAQA, ...Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v ?? ''])), categoryId: h.category.id, teacherStaffId: h.teacher?.id ?? '', maxParticipants: h.maxParticipants ?? '', allowQr: h.attendanceRules.allowQr, teacherWindowDays: String(h.attendanceRules.teacherWindowDays), excusedCounts: h.attendanceRules.excusedCounts })}>{t('Edit')}</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <HalaqaForm form={form} setForm={setForm} cats={cats.data?.items ?? []} staff={staff.data?.items ?? []} onSaved={load} />
      <Members halaqa={members} manage={manage} all={data?.items ?? []} onClose={() => setMembers(null)} onChanged={load} />
    </>
  )
}

function HalaqaForm({ form, setForm, cats, staff, onSaved }) {
  const toast = useToast()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const firstCategory = cats.find((c) => c.active)?.id
  useEffect(() => { if (form && !form.categoryId && firstCategory) setForm({ ...form, categoryId: firstCategory }) }, [form, firstCategory, setForm])
  useEffect(() => { setError('') }, [form?.id])
  if (!form) return null
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const flag = (k) => (e) => setForm({ ...form, [k]: e.target.checked })
  const toggleDay = (d) => setForm({ ...form, meetingDays: form.meetingDays.includes(d) ? form.meetingDays.filter((x) => x !== d) : [...form.meetingDays, d].sort() })
  const save = async () => {
    setBusy(true); setError('')
    const body = {
      name: form.name.trim(), categoryId: form.categoryId, description: blank(form.description), purpose: blank(form.purpose), location: blank(form.location), teacherStaffId: blank(form.teacherStaffId), frequency: form.frequency, meetingDays: form.meetingDays, startTime: blank(form.startTime), endTime: blank(form.endTime), startDate: blank(form.startDate), endDate: blank(form.endDate), maxParticipants: form.maxParticipants === '' ? null : Number(form.maxParticipants), status: form.status, instructions: blank(form.instructions),
      attendanceRules: { allowQr: form.allowQr, teacherWindowDays: Number(form.teacherWindowDays) || 0, excusedCounts: form.excusedCounts }, isPublic: form.isPublic, publicName: blank(form.publicName), publicDescription: blank(form.publicDescription), publicEligibility: blank(form.publicEligibility), registrationOpen: form.registrationOpen,
    }
    try { if (form.id) await patch(`/halaqa/${form.id}`, body); else await post('/halaqa', body); toast(t('Saved')); setForm(null); onSaved() } catch (e) { setError(Object.values(e.fieldErrors ?? {})[0] || e.message) } finally { setBusy(false) }
  }
  const Check = ({ k, children }) => <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" checked={form[k]} onChange={flag(k)} />{children}</label>
  return (
    <Modal open onClose={() => setForm(null)} size="lg" title={t(form.id ? 'Edit Halaqa' : 'New Halaqa')} footer={<>{error && <Notice tone="red" className="w-full">{error}</Notice>}<Button variant="secondary" onClick={() => setForm(null)}>{t('Cancel')}</Button><Button onClick={save} loading={busy} disabled={!form.categoryId}>{t('Save')}</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Input label={t('Name')} value={form.name} maxLength={120} onChange={set('name')} autoFocus />
        <Select label={t('Category')} value={form.categoryId} onChange={set('categoryId')} options={cats.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} />
        <Select label={t('Teacher or mentor')} value={form.teacherStaffId} placeholder={t('None')} onChange={set('teacherStaffId')} options={staff.map((s) => ({ value: s.id, label: s.displayName ?? s.name }))} />
        <Select label={t('Status')} value={form.status} onChange={set('status')} options={['PLANNED', 'ACTIVE', 'PAUSED', 'ENDED'].map((v) => ({ value: v, label: t(label(v)) }))} />
        <Input label={t('Location')} value={form.location} maxLength={200} onChange={set('location')} />
        <Select label={t('Meets')} value={form.frequency} onChange={set('frequency')} options={[{ value: 'WEEKLY', label: t('Weekly') }, { value: 'MONTHLY', label: t('Monthly') }, { value: 'ONE_OFF', label: t('Once') }, { value: 'CUSTOM', label: t('By arrangement') }]} />
        <Input label={t('Start time')} type="time" value={form.startTime} onChange={set('startTime')} />
        <Input label={t('End time')} type="time" value={form.endTime} onChange={set('endTime')} />
        <Input label={t('Start date')} type="date" value={form.startDate} onChange={set('startDate')} />
        <Input label={t('End date')} type="date" value={form.endDate} onChange={set('endDate')} />
        <Input label={t('Maximum participants')} inputMode="numeric" value={form.maxParticipants} onChange={set('maxParticipants')} />
        <div><p className="mb-1.5 text-[13px] font-semibold">{t('Meeting days')}</p><div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <Button key={d} size="sm" variant={form.meetingDays.includes(i) ? 'primary' : 'secondary'} onClick={() => toggleDay(i)}>{t(d)}</Button>)}</div></div>
        <div className="sm:col-span-2"><Textarea label={t('Description')} value={form.description} maxLength={2000} rows={2} onChange={set('description')} /></div>
        <div className="sm:col-span-2"><Textarea label={t('Purpose')} value={form.purpose} maxLength={500} rows={2} onChange={set('purpose')} /></div>
        <div className="sm:col-span-2"><Textarea label={t('Additional instructions')} value={form.instructions} maxLength={2000} rows={2} onChange={set('instructions')} /></div>
        <fieldset className="rounded-xl border border-line p-3 sm:col-span-2">
          <legend className="px-1 text-[13px] font-bold">{t('Attendance rules')}</legend>
          <Check k="allowQr">{t('Allow QR cards')}</Check>
          <Check k="excusedCounts">{t('An excused absence counts as attended in percentages')}</Check>
          <Input label={t('Days a teacher can still mark after a session')} inputMode="numeric" value={form.teacherWindowDays} onChange={set('teacherWindowDays')} />
        </fieldset>
        <fieldset className="rounded-xl border border-line p-3 sm:col-span-2">
          <legend className="px-1 text-[13px] font-bold">{t('Public website')}</legend>
          <p className="mb-1 text-[12.5px] text-ink-muted">{t('Only these fields, the schedule and the location are shown. Members, teachers, attendance and notes never are.')}</p>
          <Check k="isPublic">{t('Show on the public website')}</Check>
          {form.isPublic && <div className="space-y-3">
            <Input label={t('Public name (optional)')} value={form.publicName} maxLength={120} onChange={set('publicName')} />
            <Textarea label={t('Public description')} value={form.publicDescription} maxLength={2000} rows={2} onChange={set('publicDescription')} />
            <Input label={t('Eligibility')} value={form.publicEligibility} maxLength={500} onChange={set('publicEligibility')} />
            <Check k="registrationOpen">{t('Open for registration')}</Check>
          </div>}
        </fieldset>
      </div>
    </Modal>
  )
}

function Members({ halaqa, manage, all, onClose, onChanged }) {
  const toast = useToast()
  const { data, load } = useLoad(halaqa ? `/halaqa/${halaqa.id}/members` : null)
  const people = useLoad(halaqa && manage ? '/halaqa/participants?status=ACTIVE&pageSize=200' : null)
  const [pick, setPick] = useState('')
  const [transfer, setTransfer] = useState(null)
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  if (!halaqa) return null
  const act = async (fn, done) => { setError(''); try { await fn(); toast(done); load(); onChanged(); return true } catch (e) { setError(e.message); return false } }
  const inHalaqa = new Set((data?.items ?? []).map((m) => m.id))
  return (
    <Modal open onClose={onClose} size="lg" title={halaqa.name} subtitle={t('Members')} footer={<Button variant="secondary" onClick={onClose}>{t('Close')}</Button>}>
      <div className="space-y-3.5">
        {manage && <div className="flex flex-wrap items-end gap-2"><div className="min-w-[200px] flex-1"><Select label={t('Add a participant')} value={pick} placeholder={t('Choose a person')} onChange={(e) => setPick(e.target.value)} options={(people.data?.items ?? []).filter((p) => !inHalaqa.has(p.id)).map((p) => ({ value: p.id, label: p.fullName }))} /></div><Button icon={UserPlus} disabled={!pick} onClick={async () => { if (await act(() => post(`/halaqa/${halaqa.id}/members`, { participantId: pick }), t('Added'))) setPick('') }}>{t('Add')}</Button></div>}
        {error && <Notice tone="red">{error}</Notice>}
        {data && !data.items.length && <p className="text-[13.5px] text-ink-muted">{t('Nobody has joined yet.')}</p>}
        <ul className="divide-y divide-line">
          {data?.items.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="min-w-[140px] flex-1 text-[14px] font-semibold">{m.fullName}{m.joinedOn && <span className="block text-[12px] font-normal text-ink-muted">{t('Joined')} {m.joinedOn}</span>}</span>
              {manage && <Button size="sm" variant="soft" onClick={() => { setTransfer(m); setTo('') }}>{t('Transfer')}</Button>}
              {manage && <Button size="sm" variant="ghost" onClick={() => act(() => post(`/halaqa/memberships/${m.membershipId}/leave`, {}), t('Marked as left'))}>{t('Left')}</Button>}
            </li>
          ))}
        </ul>
        {transfer && <div className="flex flex-wrap items-end gap-2 rounded-xl bg-sage-50 p-3"><div className="min-w-[200px] flex-1"><Select label={`${t('Move')} ${transfer.fullName} ${t('to')}`} value={to} placeholder={t('Choose a Halaqa')} onChange={(e) => setTo(e.target.value)} options={all.filter((h) => h.id !== halaqa.id).map((h) => ({ value: h.id, label: h.name }))} /></div><Button disabled={!to} onClick={async () => { if (await act(() => post(`/halaqa/memberships/${transfer.membershipId}/transfer`, { toHalaqaId: to }), t('Transferred'))) setTransfer(null) }}>{t('Move')}</Button></div>}
      </div>
    </Modal>
  )
}

// ---------- Participants ----------

const BLANK_PERSON = { mode: 'external', studentId: '', fullName: '', phone: '', email: '', address: '', guardianName: '', guardianPhone: '', dob: '', notes: '', isMureed: false }

function Participants({ manage }) {
  const auth = useAuth()
  const toast = useToast()
  const { state } = useStore()
  const [search, setSearch] = useState('')
  const q = useMemo(() => `/halaqa/participants?pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}`, [search])
  const { data, error, load } = useLoad(q)
  const [form, setForm] = useState(null)
  const [open, setOpen] = useState(null)
  const [formError, setFormError] = useState('')
  const [dupe, setDupe] = useState(null)
  const [busy, setBusy] = useState(false)
  const canMureed = auth.can('mureeds.manage')
  const save = async (confirmDuplicate = false) => {
    setBusy(true); setFormError('')
    const body = form.mode === 'student' ? { studentId: form.studentId, isMureed: form.isMureed || undefined } : { fullName: form.fullName.trim(), phone: blank(form.phone), email: blank(form.email), address: blank(form.address), guardianName: blank(form.guardianName), guardianPhone: blank(form.guardianPhone), dob: blank(form.dob), notes: blank(form.notes), ...(form.isMureed ? { isMureed: true } : {}), ...(confirmDuplicate ? { confirmDuplicate: true } : {}) }
    try { await post('/halaqa/participants', body); toast(t('Saved')); setForm(null); setDupe(null); load() } catch (e) { if (e.code === 'POSSIBLE_DUPLICATE') setDupe(e.details); else setFormError(Object.values(e.fieldErrors ?? {})[0] || e.message) } finally { setBusy(false) }
  }
  const students = state.students ?? []
  return (
    <>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <SearchInput className="min-w-[200px] flex-1" value={search} onChange={setSearch} placeholder={t('Search name, phone or email')} />
        {manage && <Button icon={UserPlus} onClick={() => { setForm(BLANK_PERSON); setFormError(''); setDupe(null) }}>{t('Add participant')}</Button>}
      </Card>
      {error && <Notice tone="red">{error}</Notice>}
      {data && !data.items.length && <EmptyState icon={Users} title={t('No participants')} />}
      {data?.items.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {data.items.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen(p.id)} className="flex min-h-[56px] w-full flex-wrap items-center gap-2 px-4 py-3 text-start hover:bg-ivory-50 sm:px-5">
                  <span className="min-w-[160px] flex-1"><span className="block text-[14px] font-bold text-forest">{p.fullName}</span><span className="block text-[12px] text-ink-muted">{p.halaqas.map((h) => h.name).join(', ') || t('In no Halaqa')}{p.phone ? ` · ${p.phone}` : ''}</span></span>
                  {p.studentId && <Badge tone="blue">{t('Student')}</Badge>}
                  {p.isMureed && <Badge tone="gold">{t('Mureed')}</Badge>}
                  {p.status === 'INACTIVE' && <Badge>{t('Inactive')}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={t('Add participant')} footer={<><Button variant="secondary" onClick={() => setForm(null)}>{t('Cancel')}</Button><Button onClick={() => save(false)} loading={busy}>{t('Save')}</Button></>}>
        {form && (
          <div className="space-y-3.5">
            <Segmented label={t('Who')} value={form.mode} onChange={(mode) => setForm({ ...form, mode })} options={[{ value: 'external', label: t('New person') }, { value: 'student', label: t('Existing student') }]} />
            {form.mode === 'student'
              ? <Select label={t('Student')} value={form.studentId} placeholder={t('Choose a student')} onChange={(e) => setForm({ ...form, studentId: e.target.value })} options={students.map((s) => ({ value: s.uuid, label: `${s.name} · ${s.id}` }))} />
              : <>
                <Input label={t('Full name')} value={form.fullName} maxLength={120} onChange={(e) => setForm({ ...form, fullName: e.target.value })} autoFocus />
                <Input label={t('Contact number')} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input label={t('Email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <Input label={t('Date of birth')} type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                <Textarea label={t('Address')} value={form.address} rows={2} maxLength={300} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                <Input label={t('Guardian name')} value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
                <Input label={t('Guardian contact')} type="tel" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} />
                <Textarea label={t('Notes')} value={form.notes} rows={2} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </>}
            {canMureed && <label className="flex min-h-[44px] items-center gap-2.5 text-[14px]"><input type="checkbox" checked={form.isMureed} onChange={(e) => setForm({ ...form, isMureed: e.target.checked })} />{t('This person is a Mureed')}</label>}
            {dupe && <Notice tone="gold">{t('Someone with this phone or email is already registered:')} <b>{dupe.fullName}</b>. <button type="button" className="font-semibold underline" onClick={() => save(true)}>{t('They are a different person, save anyway')}</button></Notice>}
            {formError && <Notice tone="red">{formError}</Notice>}
          </div>
        )}
      </Modal>
      <PersonDetail id={open} manage={manage} onClose={() => setOpen(null)} onChanged={load} />
    </>
  )
}

function PersonDetail({ id, manage, onClose, onChanged }) {
  const toast = useToast()
  const auth = useAuth()
  const { data: p, load } = useLoad(id ? `/halaqa/participants/${id}` : null)
  const [qr, setQr] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setQr(null); setPhoto(null); setError('')
    let url
    if (id && p?.id === id && p.hasPhoto) blobUrl(`/halaqa/participants/${id}/photo`).then((u) => { url = u; setPhoto(u) }, () => setPhoto(null))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [id, p?.id, p?.hasPhoto])
  if (!id || !p || p.id !== id) return null
  const flip = async (body, done) => { setError(''); try { await patch(`/halaqa/participants/${id}`, body); toast(done); load(); onChanged() } catch (e) { setError(e.message) } }
  const card = async (fresh) => { setError(''); try { setQr(fresh ? await post(`/halaqa/participants/${id}/qr`) : await get(`/halaqa/participants/${id}/qr`)) } catch (e) { setError(e.message) } }
  const choosePhoto = async (e) => { const f = e.target.files?.[0]; if (!f) return; setError(''); try { await upload(`/halaqa/participants/${id}/photo`, f); toast(t('Photograph saved')); load() } catch (err) { setError(err.message) } }
  return (
    <Modal open onClose={onClose} size="lg" title={p.fullName} subtitle={t(label(p.status))} footer={<Button variant="secondary" onClick={onClose}>{t('Close')}</Button>}>
      <div className="space-y-4 text-[14px]">
        {photo && <img src={photo} alt="" className="h-28 w-28 rounded-xl object-cover" />}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          {[['Contact number', p.phone], ['Email', p.email], ['Address', p.address], ['Guardian', p.guardianName], ['Guardian contact', p.guardianPhone], ['Date of birth', p.dob], ['Notes', p.notes], ...(p.isMureed ? [['Mureed since', p.mureedSince]] : [])].filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="text-ink-muted">{t(k)}</dt><dd className="break-words">{v}</dd></Fragment>)}
        </dl>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" onClick={() => flip({ status: p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }, t('Saved'))}>{t(p.status === 'ACTIVE' ? 'Deactivate' : 'Activate')}</Button>
            <Button size="sm" variant="soft" icon={QrCode} onClick={() => card(false)}>{t('Attendance card')}</Button>
            <label className="inline-flex min-h-[36px] cursor-pointer items-center rounded-lg bg-sage-100 px-3 text-[13px] font-semibold text-primary-800">{t('Photograph')}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={choosePhoto} /></label>
            {auth.can('mureeds.manage') && !p.isMureed && <Button size="sm" variant="ghost" onClick={() => flip({ isMureed: true }, t('Saved'))}>{t('Record as Mureed')}</Button>}
          </div>
        )}
        {qr && <div className="rounded-xl border border-line p-3 text-center"><img src={qr.qrDataUrl} alt={t('Attendance card')} className="mx-auto h-48 w-48" /><p className="font-semibold">{qr.fullName}</p><p className="mb-2 text-[12.5px] text-ink-muted">{t('Print this card. The teacher scans it during a session.')}</p><div className="flex justify-center gap-2 print:hidden"><Button size="sm" variant="secondary" onClick={() => window.print()}>{t('Print')}</Button><Button size="sm" variant="danger-soft" onClick={() => card(true)}>{t('Replace lost card')}</Button></div></div>}
        {error && <Notice tone="red">{error}</Notice>}
        <div><h3 className="mb-1 text-[13px] font-bold">{t('Halaqas')}</h3>{p.memberships.length ? <ul className="space-y-0.5">{p.memberships.map((m) => <li key={m.id}>{m.halaqa.name} · {m.joinedOn}{m.leftOn ? ` – ${m.leftOn}` : ''} · {t(label(m.status))}</li>)}</ul> : <p className="text-ink-muted">{t('In no Halaqa')}</p>}</div>
        <div><h3 className="mb-1 text-[13px] font-bold">{t('History')}</h3><ul className="space-y-0.5 text-[13px] text-ink-soft">{p.history.map((h) => <li key={h.id}>{new Date(h.at).toLocaleDateString('en-IN')} · {h.summary}{h.actorName ? ` · ${h.actorName}` : ''}</li>)}</ul></div>
      </div>
    </Modal>
  )
}

// ---------- Sessions: calendar and list ----------

function Sessions({ manage }) {
  const [view, setView] = useState('list')
  const [halaqaId, setHalaqaId] = useState('')
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const from = `${month}-01`
  const to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const { data, error, load } = useLoad(`/halaqa/sessions?from=${from}&to=${to}${halaqaId ? `&halaqaId=${halaqaId}` : ''}`)
  const halaqas = useLoad('/halaqa')
  const [open, setOpen] = useState(null)
  const [plan, setPlan] = useState(null)
  return (
    <>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Input label={t('Month')} type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <Select label={t('Halaqa')} value={halaqaId} placeholder={t('All Halaqas')} onChange={(e) => setHalaqaId(e.target.value)} options={(halaqas.data?.items ?? []).map((h) => ({ value: h.id, label: h.name }))} />
        <Segmented label={t('View')} value={view} onChange={setView} options={[{ value: 'list', label: t('List') }, { value: 'calendar', label: t('Calendar') }]} />
        {manage && <Button className="ms-auto" icon={Plus} disabled={!halaqas.data?.items.length} onClick={() => setPlan({ halaqaId: halaqaId || halaqas.data.items[0].id, kind: 'one', date: todayISO(), from: todayISO(), to: '', weekdays: [], dayOfMonth: '1', pattern: 'WEEKLY', topic: '', startTime: '', endTime: '' })}>{t('Schedule sessions')}</Button>}
      </Card>
      {error && <Notice tone="red">{error}</Notice>}
      {data && view === 'list' && (data.items.length ? (
        <Card><ul className="divide-y divide-line">{data.items.map((s) => (
          <li key={s.id}><button type="button" onClick={() => setOpen(s.id)} className="flex min-h-[56px] w-full flex-wrap items-center gap-2 px-4 py-3 text-start hover:bg-ivory-50 sm:px-5">
            <span className="min-w-[160px] flex-1"><span className="block text-[14px] font-bold text-forest">{s.date}{s.startTime ? ` · ${s.startTime}` : ''}</span><span className="block text-[12px] text-ink-muted">{s.halaqaName}{s.topic ? ` · ${s.topic}` : ''}{s.rescheduledFrom ? ` · ${t('moved from')} ${s.rescheduledFrom}` : ''}</span></span>
            <Badge tone={STATUS_TONE[s.status]}>{label(s.status)}</Badge>
          </button></li>
        ))}</ul></Card>
      ) : <EmptyState icon={CalendarDays} title={t('No sessions this month')} />)}
      {data && view === 'calendar' && <Calendar month={month} items={data.items} onOpen={setOpen} />}
      <PlanModal plan={plan} setPlan={setPlan} halaqas={halaqas.data?.items ?? []} onSaved={load} />
      <SessionDetail id={open} manage={manage} onClose={() => setOpen(null)} onChanged={load} />
    </>
  )
}

function Calendar({ month, items, onOpen }) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const today = todayISO()
  return (
    <Card className="overflow-x-auto p-2">
      <div className="grid min-w-[640px] grid-cols-7 gap-1">
        {DAYS.map((d) => <div key={d} className="py-1 text-center text-[12px] font-semibold text-ink-muted">{t(d)}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />
          const iso = `${month}-${String(d).padStart(2, '0')}`
          return (
            <div key={iso} className={`min-h-[84px] rounded-lg border p-1 ${iso === today ? 'border-primary-500' : 'border-line'}`}>
              <div className="text-[12px] text-ink-muted">{d}</div>
              {items.filter((s) => s.date === iso).map((s) => <button key={s.id} type="button" onClick={() => onOpen(s.id)} className={`mt-0.5 block w-full truncate rounded px-1 py-0.5 text-start text-[11.5px] font-semibold ${s.status === 'CANCELLED' ? 'bg-clay-50 text-clay-700 line-through' : s.status === 'COMPLETED' ? 'bg-primary-50 text-primary-700' : 'bg-slateblue-50 text-slateblue-600'}`}>{s.startTime ? `${s.startTime} ` : ''}{s.halaqaName}</button>)}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function PlanModal({ plan, setPlan, halaqas, onSaved }) {
  const toast = useToast()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!plan) return null
  const set = (k) => (e) => setPlan({ ...plan, [k]: e.target.value })
  const save = async () => {
    setBusy(true); setError('')
    try {
      if (plan.kind === 'one') { await post(`/halaqa/${plan.halaqaId}/sessions`, { date: plan.date, startTime: blank(plan.startTime), endTime: blank(plan.endTime), topic: blank(plan.topic) }); toast(t('Session created')) }
      else {
        const r = await post(`/halaqa/${plan.halaqaId}/sessions/recurring`, { pattern: plan.pattern, from: plan.from, to: plan.to, ...(plan.pattern === 'WEEKLY' ? { weekdays: plan.weekdays } : { dayOfMonth: Number(plan.dayOfMonth) }), ...(plan.startTime ? { startTime: plan.startTime } : {}), ...(plan.endTime ? { endTime: plan.endTime } : {}), ...(plan.topic ? { topic: plan.topic } : {}) })
        toast(t('{n} sessions created', { n: r.created }), r.skipped ? { description: t('{n} already existed', { n: r.skipped }) } : {})
      }
      setPlan(null); onSaved()
    } catch (e) { setError(Object.values(e.fieldErrors ?? {})[0] || e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={() => setPlan(null)} title={t('Schedule sessions')} footer={<><Button variant="secondary" onClick={() => setPlan(null)}>{t('Cancel')}</Button><Button onClick={save} loading={busy}>{t('Save')}</Button></>}>
      <div className="space-y-3.5">
        <Select label={t('Halaqa')} value={plan.halaqaId} onChange={set('halaqaId')} options={halaqas.map((h) => ({ value: h.id, label: h.name }))} />
        <Segmented label={t('Type')} value={plan.kind} onChange={(kind) => setPlan({ ...plan, kind })} options={[{ value: 'one', label: t('One session') }, { value: 'many', label: t('Recurring') }]} />
        {plan.kind === 'one' ? <Input label={t('Date')} type="date" value={plan.date} onChange={set('date')} /> : <>
          <Segmented label={t('Repeats')} value={plan.pattern} onChange={(pattern) => setPlan({ ...plan, pattern })} options={[{ value: 'WEEKLY', label: t('Weekly') }, { value: 'MONTHLY', label: t('Monthly') }]} />
          {plan.pattern === 'WEEKLY' ? <div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <Button key={d} size="sm" variant={plan.weekdays.includes(i) ? 'primary' : 'secondary'} onClick={() => setPlan({ ...plan, weekdays: plan.weekdays.includes(i) ? plan.weekdays.filter((x) => x !== i) : [...plan.weekdays, i] })}>{t(d)}</Button>)}</div> : <Input label={t('Day of the month')} inputMode="numeric" value={plan.dayOfMonth} onChange={set('dayOfMonth')} />}
          <Input label={t('From')} type="date" value={plan.from} onChange={set('from')} />
          <Input label={t('To')} type="date" value={plan.to} onChange={set('to')} />
        </>}
        <div className="grid grid-cols-2 gap-3"><Input label={t('Start time')} type="time" value={plan.startTime} onChange={set('startTime')} /><Input label={t('End time')} type="time" value={plan.endTime} onChange={set('endTime')} /></div>
        <Input label={t('Topic')} value={plan.topic} maxLength={200} onChange={set('topic')} />
        {error && <Notice tone="red">{error}</Notice>}
      </div>
    </Modal>
  )
}

function SessionDetail({ id, manage, onClose, onChanged }) {
  const toast = useToast()
  const { data: s, load } = useLoad(id ? `/halaqa/sessions/${id}` : null)
  const roster = useLoad(s && s.id === id ? `/halaqa/${s.halaqaId}/members` : null)
  const [notes, setNotes] = useState(null)
  const [marks, setMarks] = useState({})
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [correct, setCorrect] = useState(null)
  useEffect(() => { setNotes(null); setMarks({}); setError(''); setScanning(false); setCorrect(null) }, [id])
  if (!id || !s || s.id !== id) return null
  const n = notes ?? { date: s.date, topic: s.topic ?? '', description: s.description ?? '', discussionNotes: s.discussionNotes ?? '', followUp: s.followUp ?? '' }
  const done = new Map(s.attendance.map((a) => [a.participantId, a]))
  const run = async (fn, msg) => { setError(''); try { const r = await fn(); toast(msg); await load(); onChanged(); return r ?? true } catch (e) { setError(Object.values(e.fieldErrors ?? {})[0] || e.message); return false } }
  const unmarked = Object.entries(marks).filter(([pid]) => !done.has(pid)).map(([participantId, status]) => ({ participantId, status }))
  const download = async (m) => { try { const u = await blobUrl(`/halaqa/materials/${m.id}`); const a = document.createElement('a'); a.href = u; a.download = m.fileName; a.click(); setTimeout(() => URL.revokeObjectURL(u), 10000) } catch (e) { setError(e.message) } }
  return (
    <Modal open onClose={onClose} size="xl" title={`${s.halaqaName} · ${s.date}`} subtitle={t(label(s.status))} footer={<Button variant="secondary" onClick={onClose}>{t('Close')}</Button>}>
      <div className="space-y-5 text-[14px]">
        {error && <Notice tone="red">{error}</Notice>}
        <section>
          <h3 className="mb-2 font-bold">{t('Attendance')}</h3>
          {s.status !== 'CANCELLED' && <div className="mb-2 flex flex-wrap gap-2"><Button size="sm" variant="soft" icon={QrCode} onClick={() => setScanning(!scanning)}>{t(scanning ? 'Stop scanning' : 'Scan cards')}</Button>{Object.keys(marks).length > 0 && <Button size="sm" icon={CheckCircle2} onClick={async () => { if (await run(() => put(`/halaqa/sessions/${id}/attendance`, { marks: unmarked }), t('Attendance saved'))) setMarks({}) }}>{t('Save attendance')}</Button>}</div>}
          {scanning && <CardScanner sessionId={id} onScanned={load} />}
          {roster.data && !roster.data.items.length && <p className="text-ink-muted">{t('Nobody has joined yet.')}</p>}
          <ul className="divide-y divide-line">
            {roster.data?.items.map((m) => {
              const rec = done.get(m.id)
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-[140px] flex-1 font-semibold">{m.fullName}{rec?.source === 'QR' && <span className="ms-1 text-[11.5px] font-normal text-ink-muted">QR</span>}</span>
                  {rec ? <><Badge tone={STATUS_TONE[rec.status]}>{label(rec.status)}</Badge>{manage && <Button size="sm" variant="ghost" onClick={() => setCorrect({ id: rec.id, name: m.fullName, status: rec.status === 'PRESENT' ? 'ABSENT' : 'PRESENT', reason: '' })}>{t('Correct')}</Button>}</>
                    : s.status !== 'CANCELLED' && <Segmented size="sm" value={marks[m.id] ?? ''} onChange={(v) => setMarks({ ...marks, [m.id]: v })} options={[{ value: 'PRESENT', label: t('Present') }, { value: 'ABSENT', label: t('Absent') }, { value: 'EXCUSED', label: t('Excused') }]} />}
                  {rec?.corrections.length > 0 && <p className="w-full text-[12px] text-ink-muted">{rec.corrections.map((c) => `${label(c.fromStatus)} → ${label(c.toStatus)}: ${c.reason} (${c.correctedBy})`).join('; ')}</p>}
                </li>
              )
            })}
          </ul>
          {correct && <div className="mt-2 space-y-2 rounded-xl bg-sage-50 p-3"><p className="font-semibold">{t('Correct')}: {correct.name}</p><Select label={t('Status')} value={correct.status} onChange={(e) => setCorrect({ ...correct, status: e.target.value })} options={['PRESENT', 'ABSENT', 'EXCUSED'].map((v) => ({ value: v, label: t(label(v)) }))} /><Input label={t('Reason')} value={correct.reason} maxLength={300} onChange={(e) => setCorrect({ ...correct, reason: e.target.value })} /><Button size="sm" disabled={correct.reason.trim().length < 5} onClick={async () => { if (await run(() => post(`/halaqa/attendance/${correct.id}/correct`, { status: correct.status, reason: correct.reason.trim() }), t('Corrected'))) setCorrect(null) }}>{t('Save')}</Button></div>}
        </section>
        {manage && s.status !== 'CANCELLED' && (
          <section className="space-y-3">
            <h3 className="font-bold">{t('Session details')}</h3>
            {s.status === 'SCHEDULED' && <Input label={t('Date (change to reschedule)')} type="date" value={n.date} onChange={(e) => setNotes({ ...n, date: e.target.value })} />}
            <Input label={t('Topic')} value={n.topic} maxLength={200} onChange={(e) => setNotes({ ...n, topic: e.target.value })} />
            <Textarea label={t('Description')} rows={2} value={n.description} maxLength={2000} onChange={(e) => setNotes({ ...n, description: e.target.value })} />
            <Textarea label={t('Discussion notes')} rows={3} value={n.discussionNotes} maxLength={5000} onChange={(e) => setNotes({ ...n, discussionNotes: e.target.value })} />
            <Textarea label={t('Follow-up activities')} rows={2} value={n.followUp} maxLength={2000} onChange={(e) => setNotes({ ...n, followUp: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!notes} onClick={async () => { const { date, ...rest } = n; if (await run(() => patch(`/halaqa/sessions/${id}`, { ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, blank(v)])), ...(s.status === 'SCHEDULED' && date !== s.date ? { date } : {}) }), t('Saved'))) setNotes(null) }}>{t('Save details')}</Button>
              {s.status === 'SCHEDULED' && <Button size="sm" variant="soft" onClick={() => run(() => post(`/halaqa/sessions/${id}/status`, { status: 'COMPLETED' }), t('Marked completed'))}>{t('Mark completed')}</Button>}
              {s.status === 'SCHEDULED' && <Button size="sm" variant="danger-soft" onClick={() => run(() => post(`/halaqa/sessions/${id}/status`, { status: 'CANCELLED' }), t('Session cancelled'))}>{t('Cancel session')}</Button>}
            </div>
          </section>
        )}
        {!manage && (s.topic || s.description) && <p className="text-ink-soft">{s.topic} {s.description}</p>}
        <section>
          <h3 className="mb-1 font-bold">{t('Study materials')}</h3>
          {s.materials.length > 0 && <ul className="mb-2 space-y-1">{s.materials.map((m) => <li key={m.id}><button type="button" className="font-semibold text-primary-700 underline" onClick={() => download(m)}>{m.fileName}</button></li>)}</ul>}
          {manage && <label className="inline-flex min-h-[36px] cursor-pointer items-center rounded-lg bg-sage-100 px-3 text-[13px] font-semibold text-primary-800">{t('Upload PDF or image')}<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await run(() => upload(`/halaqa/sessions/${id}/materials`, f, { method: 'POST' }), t('Uploaded')); e.target.value = '' }} /></label>}
        </section>
      </div>
    </Modal>
  )
}

/** Reading the code proves nothing by itself: the server checks the signature and the session. */
function CardScanner({ sessionId, onScanned }) {
  const [last, setLast] = useState(null)
  const onCode = useCallback(async (token) => {
    try {
      const r = await post(`/halaqa/sessions/${sessionId}/scan`, { token })
      setLast({ ok: true, text: r.duplicate ? `${r.fullName}: ${t('already recorded')}` : `${r.fullName}: ${t('present')}` })
      onScanned()
    } catch (e) { setLast({ ok: false, text: e.message }) }
  }, [sessionId, onScanned])
  const { videoRef, canvasRef, camera } = useQrScanner({ active: true, onCode })
  return (
    <div className="mb-3 space-y-2">
      <video ref={videoRef} playsInline muted className="aspect-video w-full max-w-sm rounded-xl bg-black object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      {camera.status !== 'ready' && camera.status !== 'starting' && <Notice tone="red">{camera.message || t('Allow the camera in your browser to scan cards.')}</Notice>}
      {last && <Notice tone={last.ok ? 'green' : 'red'}>{last.text}</Notice>}
    </div>
  )
}

// ---------- Reports ----------

function Reports() {
  const today = todayISO()
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(today)
  const [halaqaId, setHalaqaId] = useState('')
  const [search, setSearch] = useState('')
  const halaqas = useLoad('/halaqa')
  const { data, error } = useLoad(from && to ? `/halaqa/reports/attendance?from=${from}&to=${to}${halaqaId ? `&halaqaId=${halaqaId}` : ''}` : null)
  const rows = (data?.items ?? []).filter((r) => !search || r.fullName.toLowerCase().includes(search.toLowerCase()))
  const exportCsv = () => downloadCSV(`halaqa-attendance-${from}-to-${to}`, rows.map((r) => ({ Month: r.month, Halaqa: r.halaqaName, Participant: r.fullName, Present: r.present, Absent: r.absent, Excused: r.excused, Total: r.total, 'Attendance %': r.percent ?? '' })))
  return (
    <>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Input label={t('From')} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <Input label={t('To')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select label={t('Halaqa')} value={halaqaId} placeholder={t('All Halaqas')} onChange={(e) => setHalaqaId(e.target.value)} options={(halaqas.data?.items ?? []).map((h) => ({ value: h.id, label: h.name }))} />
        <SearchInput className="min-w-[180px] flex-1" value={search} onChange={setSearch} placeholder={t('Search participant')} />
        <Button variant="secondary" icon={Download} disabled={!rows.length} onClick={exportCsv}>{t('CSV')}</Button>
      </Card>
      {error && <Notice tone="red">{error}</Notice>}
      {data && !rows.length && <EmptyState title={t('No attendance in this period')} />}
      {rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead><tr className="text-[12.5px] text-ink-muted">{['Month', 'Halaqa', 'Participant', 'Present', 'Absent', 'Excused', '%'].map((h) => <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold">{t(h)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line tabular">{rows.map((r) => <tr key={`${r.participantId}${r.halaqaId}${r.month}`}><td className="px-3 py-2">{r.month}</td><td className="px-3 py-2">{r.halaqaName}</td><td className="px-3 py-2 font-semibold text-forest">{r.fullName}</td><td className="px-3 py-2">{r.present}</td><td className="px-3 py-2">{r.absent}</td><td className="px-3 py-2">{r.excused}</td><td className="px-3 py-2">{r.percent ?? '—'}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </>
  )
}

// ---------- Messages ----------

const KINDS = [['ANNOUNCEMENT', 'Announcement'], ['UPDATE', 'Update'], ['SCHEDULE', 'Schedule'], ['RESOURCE', 'Learning resource'], ['REMINDER', 'Reminder'], ['CANCELLATION', 'Cancellation'], ['FOLLOW_UP', 'Follow-up']]

function Messages({ manage }) {
  const toast = useToast()
  const { data, error, load } = useLoad('/halaqa/messages')
  const halaqas = useLoad('/halaqa')
  const [form, setForm] = useState({ halaqaId: '', kind: 'ANNOUNCEMENT', subject: '', body: '' })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true); setFormError('')
    try {
      const r = await post('/halaqa/messages', { halaqaId: form.halaqaId, kind: form.kind, subject: form.subject.trim(), body: form.body.trim() })
      toast(t('Message sent'), { description: t('{a} by email, {b} in the app, {c} with no contact details', { a: r.emailQueued, b: r.inApp, c: r.noContact }) })
      setForm({ ...form, subject: '', body: '' }); load()
    } catch (e) { setFormError(Object.values(e.fieldErrors ?? {})[0] || e.message) } finally { setBusy(false) }
  }
  return (
    <>
      {manage && (
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t('Send to')} value={form.halaqaId} placeholder={t('Choose a Halaqa')} onChange={(e) => setForm({ ...form, halaqaId: e.target.value })} options={(halaqas.data?.items ?? []).map((h) => ({ value: h.id, label: h.name }))} />
            <Select label={t('Type')} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={KINDS.map(([value, l]) => ({ value, label: t(l) }))} />
          </div>
          <Input label={t('Subject')} value={form.subject} maxLength={150} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <Textarea label={t('Message')} rows={4} value={form.body} maxLength={4000} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          {formError && <Notice tone="red">{formError}</Notice>}
          <Button icon={Send} disabled={!form.halaqaId || form.subject.trim().length < 3 || form.body.trim().length < 3} loading={busy} onClick={send}>{t('Send')}</Button>
        </Card>
      )}
      {error && <Notice tone="red">{error}</Notice>}
      {data?.items.length > 0 && <Card><CardHeader title={t('Sent')} /><ul className="mt-1 divide-y divide-line">{data.items.map((m) => <li key={m.id} className="px-4 py-3 text-[14px] sm:px-5"><b className="text-forest">{m.subject}</b><span className="block text-[12.5px] text-ink-muted">{m.halaqa ?? t('Chosen people')} · {m.recipientCount} {t('people')} · {m.sentByName} · {new Date(m.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></li>)}</ul></Card>}
    </>
  )
}
