import { t } from "../../i18n/I18nProvider"
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, UserPlus, Users, BedDouble, Wallet } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useAuth } from '../../context/AuthContext'
import { patch as apiPatch, post } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import { PageHeader, Card, CardHeader, Input, Select, Textarea, Button, Segmented, Notice, ConfirmDialog } from '../../components/ui'
import { NotFound } from '../shared/Fallbacks'
import { todayISO } from '../../utils/date'
import { money } from '../../utils/format'

const CONCESSIONS = {
  none: null,
  sibling: { type: 'Sibling concession', percent: 10 },
  need: { type: 'Need-based concession', percent: 50 },
  full: { type: 'Full sponsorship (Yateem fund)', percent: 100 },
}
const concessionKey = (c) => (!c ? 'none' : c.percent >= 100 ? 'full' : c.percent >= 50 ? 'need' : 'sibling')
const CONCESSION_KIND = { none: null, sibling: 'SIBLING', need: 'NEED_BASED', full: 'FULL_SPONSORSHIP' }
// Server field paths -> form fields, so API validation messages land on the right input.
const FIELD = { name: 'name', dob: 'dob', admissionDate: 'admissionDate', groupId: 'groupId', phone: 'phone', feePlanId: 'feePlanId', 'guardian.name': 'gName', 'guardian.phone': 'gPhone', 'guardian.email': 'gEmail', 'guardian.existingId': 'guardianId', 'primaryGuardian.name': 'gName', 'primaryGuardian.phone': 'gPhone', 'primaryGuardian.email': 'gEmail' }

export default function StudentForm() {
  const { id } = useParams()
  const { state, idx } = useStore()
  const { refreshPeople } = useAuth()
  const [saving, setSaving] = useState(false)
  const [duplicates, setDuplicates] = useState(null)
  const toast = useToast()
  const navigate = useNavigate()
  const existing = id ? idx.students[id] : null
  const guardian = existing ? idx.parents[existing.guardianId] : null
  const [confirmLeave, setConfirmLeave] = useState(false)

  const [f, setF] = useState(() => existing ? {
    name: existing.name, gender: existing.gender, dob: existing.dob, groupId: existing.groupId, admissionDate: existing.admissionDate,
    phone: existing.phone, address: existing.address, hostel: existing.hostel, feePlanId: existing.feePlanId, concession: concessionKey(existing.concession),
    status: existing.status, medical: existing.medical || '', guardianMode: 'existing', guardianId: existing.guardianId,
    gName: guardian?.name || '', gRelation: guardian?.relation || '', gPhone: guardian?.phone || '', gEmail: guardian?.email || '', gOccupation: guardian?.occupation || '',
  } : {
    name: '', gender: 'M', dob: '', groupId: '', admissionDate: todayISO(), phone: '', address: '', hostel: false, feePlanId: '', concession: 'none',
    status: 'active', medical: '', guardianMode: 'new', guardianId: '', gName: '', gRelation: 'Father', gPhone: '', gEmail: '', gOccupation: '',
  })
  const [errors, setErrors] = useState({})
  const [dirty, setDirty] = useState(false)
  if (id && !existing) return <NotFound />

  const set = (k) => (e) => { setDirty(true); setF((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e })) }

  const validate = () => {
    const e = {}
    if (f.name.trim().length < 3) e.name = 'Enter the full name (at least 3 characters).'
    if (!f.dob) e.dob = 'Date of birth is required.'
    else if (f.dob >= todayISO()) e.dob = 'Date of birth must be in the past.'
    if (!f.groupId) e.groupId = 'Choose a halqa.'
    if (!f.feePlanId) e.feePlanId = 'Choose a fee plan.'
    if (!f.admissionDate) e.admissionDate = 'Admission date is required.'
    if (!/^[+\d][\d\s-]{6,}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number.'
    if (f.guardianMode === 'existing' && !f.guardianId) e.guardianId = 'Choose a guardian.'
    if (f.guardianMode === 'new' || existing) {
      if (f.guardianMode === 'new' && f.gName.trim().length < 3) e.gName = "Enter the guardian's name."
      if (f.guardianMode === 'new' && !/^[+\d][\d\s-]{6,}$/.test(f.gPhone.trim())) e.gPhone = 'Enter a valid phone number.'
      if (f.gEmail && !/^\S+@\S+\.\S+$/.test(f.gEmail)) e.gEmail = 'Enter a valid email or leave blank.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev, confirmDuplicate = false) => {
    ev?.preventDefault()
    if (!validate()) { toast('Please check the highlighted fields', { type: 'error' }); return }
    const base = {
      name: f.name.trim(), gender: f.gender === 'F' ? 'FEMALE' : 'MALE', dob: f.dob, admissionDate: f.admissionDate, groupId: idx.groups[f.groupId]?.uuid,
      phone: f.phone.trim(), address: f.address.trim(), hostelResident: f.hostel, feePlanId: state.feePlans.find((p) => p.id === f.feePlanId)?.uuid,
      concession: CONCESSION_KIND[f.concession], medicalNotes: f.medical.trim(),
    }
    const guardian = { name: f.gName.trim(), relation: f.gRelation, phone: f.gPhone.trim(), email: f.gEmail.trim(), occupation: f.gOccupation.trim() }
    setSaving(true)
    try {
      const saved = existing
        ? await apiPatch(`/students/${existing.uuid}`, { ...base, status: f.status === 'active' ? 'ACTIVE' : 'INACTIVE', primaryGuardian: guardian })
        : await post('/students', { ...base, guardian: f.guardianMode === 'existing' ? { existingId: state.parents.find((p) => p.id === f.guardianId)?.uuid } : guardian, ...(confirmDuplicate ? { confirmDuplicate: true } : {}) })
      await refreshPeople()
      toast(existing ? 'Student record updated' : 'Student added', { description: `${saved.name} · ${saved.admissionNo}` })
      setDirty(false)
      navigate(`/students/${saved.admissionNo}`)
    } catch (err) {
      if (err.code === 'POSSIBLE_DUPLICATE') return setDuplicates(err.details || [])
      const fe = Object.fromEntries(Object.entries(err.fieldErrors || {}).map(([k, v]) => [FIELD[k] || k, v]))
      if (Object.keys(fe).length) setErrors(fe)
      toast(err.code === 'VALIDATION_FAILED' ? 'Please check the highlighted fields' : err.message, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const plan = state.feePlans.find((p) => p.id === f.feePlanId)
  const pctOff = CONCESSIONS[f.concession]?.percent || 0
  const cancel = () => (dirty ? setConfirmLeave(true) : navigate(-1))

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        crumbs={[{ label: 'Students', to: '/students' }, ...(existing ? [{ label: existing.name, to: `/students/${existing.id}` }] : []), { label: existing ? 'Edit' : 'Add student' }]}
        title={existing ? `Edit ${existing.name}` : 'Add a new student'}
        subtitle={existing ? existing.id : 'Admission details, guardian and fee plan'}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={t("Student details")} icon={UserPlus} />
            <div className="grid gap-3.5 p-4 sm:grid-cols-2 sm:p-5">
              <Input className="sm:col-span-2" label={t("Full name")} required value={f.name} onChange={set('name')} error={errors.name} autoComplete="off" placeholder="e.g. Abdullah Khan" />
              <div>
                <span className="label">{t("Gender")}</span>
                <Segmented value={f.gender} onChange={set('gender')} label={t("Gender")} options={[{ value: 'M', label: 'Boy' }, { value: 'F', label: 'Girl' }]} />
              </div>
              <Input label={t("Date of birth")} type="date" required value={f.dob} onChange={set('dob')} error={errors.dob} max={todayISO()} />
              <Select label={t("Halqa (class)")} required value={f.groupId} onChange={set('groupId')} error={errors.groupId} placeholder={t("Select halqa")}
                options={state.groups.map((g) => ({ value: g.id, label: `${g.name} · ${idx.mentors[g.mentorId]?.name || 'No mentor'}` }))} />
              <Input label={t("Admission date")} type="date" required value={f.admissionDate} onChange={set('admissionDate')} error={errors.admissionDate} />
              <Input label={t("Contact phone")} type="tel" inputMode="tel" required value={f.phone} onChange={set('phone')} error={errors.phone} placeholder="+00 90000 00000" />
              <Input label={t("Address")} value={f.address} onChange={set('address')} placeholder={t("House, area, city")} />
              <Textarea className="sm:col-span-2" label={t("Medical notes")} value={f.medical} onChange={set('medical')} placeholder={t("Allergies, conditions the hostel or mentor should know")} />
              {existing && (
                <Select label={t("Enrolment status")} value={f.status} onChange={set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive (left / on leave)' }]} />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t("Guardian")} icon={Users} />
            <div className="grid gap-3.5 p-4 sm:grid-cols-2 sm:p-5">
              {!existing && (
                <div className="sm:col-span-2">
                  <Segmented value={f.guardianMode} onChange={set('guardianMode')} label={t("Guardian type")} options={[{ value: 'new', label: 'New guardian' }, { value: 'existing', label: 'Sibling of existing student' }]} />
                </div>
              )}
              {f.guardianMode === 'existing' && !existing ? (
                <Select className="sm:col-span-2" label={t("Existing guardian")} value={f.guardianId} onChange={set('guardianId')} error={errors.guardianId} placeholder={t("Select guardian")}
                  options={state.parents.map((p) => ({ value: p.id, label: `${p.name} · ${p.children.map((c) => idx.students[c]?.name.split(' ')[0]).join(', ')}` }))} />
              ) : (
                <>
                  <Input label={t("Guardian name")} required value={f.gName} onChange={set('gName')} error={errors.gName} />
                  <Select label={t("Relation")} value={f.gRelation} onChange={set('gRelation')} options={['Father', 'Mother', 'Guardian (Uncle)', 'Guardian (Aunt)', 'Grandparent', 'Other']} />
                  <Input label={t("Guardian phone")} type="tel" inputMode="tel" required value={f.gPhone} onChange={set('gPhone')} error={errors.gPhone} />
                  <Input label={t("Guardian email")} type="email" inputMode="email" value={f.gEmail} onChange={set('gEmail')} error={errors.gEmail} placeholder="optional" />
                  <Input className="sm:col-span-2" label={t("Occupation")} value={f.gOccupation} onChange={set('gOccupation')} />
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("Hostel & fees")} icon={Wallet} />
            <div className="space-y-3.5 p-4 sm:p-5">
              <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-3.5">
                <span className="flex items-center gap-2 text-[14px] font-semibold text-forest"><BedDouble size={17} className="text-slateblue-500" /> {t("Hostel resident")}</span>
                <input type="checkbox" checked={f.hostel} onChange={set('hostel')} className="h-5 w-5 accent-primary-700" />
              </label>
              <Select label={t("Fee plan")} required value={f.feePlanId} onChange={set('feePlanId')} error={errors.feePlanId} placeholder={t("Select fee plan")}
                options={state.feePlans.map((p) => ({ value: p.id, label: `${p.name} · ${money(p.amount, state.settings.currency)}` }))} />
              <Select label={t("Concession")} value={f.concession} onChange={set('concession')} options={[
                { value: 'none', label: 'None' }, { value: 'sibling', label: 'Sibling · 10%' }, { value: 'need', label: 'Need-based · 50%' }, { value: 'full', label: 'Full sponsorship · 100%' },
              ]} />
              {plan && (
                <div className="rounded-xl bg-sage-50 p-3 text-[13px]">
                  <div className="flex justify-between"><span className="text-ink-muted">{t("Monthly fee")}</span><span className="font-semibold">{money(plan.amount, state.settings.currency)}</span></div>
                  {pctOff > 0 && <div className="flex justify-between"><span className="text-ink-muted">{t("Concession")}</span><span className="font-semibold text-primary-700">−{pctOff}%</span></div>}
                  <div className="mt-1 flex justify-between border-t border-line pt-1"><span className="font-semibold">{t("Payable")}</span><span className="font-bold text-forest">{money(plan.amount - Math.round((plan.amount * pctOff) / 100 / 10) * 10, state.settings.currency)}</span></div>
                </div>
              )}
              {f.hostel && !existing?.hostel && <Notice tone="blue">{t("Assign a room and bed from the Hostel page after saving.")}</Notice>}
              {existing && f.feePlanId !== existing.feePlanId && <Notice tone="gold">{t("Plan changes apply to future invoices. Existing invoices are not altered.")}</Notice>}
            </div>
          </Card>
          <div className="sticky bottom-[76px] z-10 flex gap-2 rounded-2xl border border-line bg-white/95 p-2 shadow-lift backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <Button variant="secondary" className="flex-1" onClick={cancel}>{t("Cancel")}</Button>
            <Button type="submit" className="flex-[2]" icon={Save} loading={saving}>{existing ? 'Save changes' : 'Add student'}</Button>
          </div>
        </div>
      </div>
      <ConfirmDialog open={!!duplicates} onClose={() => setDuplicates(null)} title={t("Possible duplicate admission")} confirmLabel={t("Admit anyway")} onConfirm={() => submit(null, true)}>
        {t("A student with the same name and date of birth already exists:")} {duplicates?.map((d) => `${d.name} (${d.admissionNo})`).join(', ')}. {t("Admit this student anyway?")}
      </ConfirmDialog>
      <ConfirmDialog open={confirmLeave} onClose={() => setConfirmLeave(false)} title={t("Discard changes?")} confirmLabel={t("Discard")} tone="danger" onConfirm={() => navigate(-1)}>
        {t("Your unsaved changes to this form will be lost.")}
      </ConfirmDialog>
    </form>
  )
}
