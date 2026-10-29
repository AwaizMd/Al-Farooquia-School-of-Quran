import { t } from "../../i18n/I18nProvider"
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, Phone, Users, ArrowRightLeft } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useAuth } from '../../context/AuthContext'
import { post, put } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import { useQueryState } from '../../hooks/useQueryState'
import { PageHeader, Card, CardHeader, Button, Avatar, Badge, Modal, Input, Select, SearchInput, Stagger, staggerItem } from '../../components/ui'
import { attendanceCounts, mentorGroups, sabaqToday } from '../../services/selectors'
import { motion } from 'framer-motion'

export default function Mentors() {
  const { state, idx, today } = useStore()
  const canManage = state.session.persona === 'admin'
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useQueryState('new')
  const [assign, setAssign] = useState(false)
  const list = state.mentors.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <PageHeader title={t("Mentors")} subtitle={t('{a} active · {h} halqas', { a: state.mentors.filter((m) => m.status === 'active').length, h: state.groups.length })}
        actions={canManage && <><Button variant="secondary" icon={ArrowRightLeft} onClick={() => setAssign(true)}>{t("Assign halqa")}</Button><Button icon={UserPlus} onClick={() => setNewOpen('1')}>{t("Add mentor")}</Button></>} />
      <SearchInput value={q} onChange={setQ} placeholder={t("Search mentors")} className="mb-4" />
      <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => {
          const groups = mentorGroups(state, m.id)
          const students = state.students.filter((s) => groups.some((g) => g.id === s.groupId) && s.status === 'active')
          const att = attendanceCounts(state, today, students)
          const sb = sabaqToday(state, idx, students, today)
          return (
            <motion.div key={m.id} variants={staggerItem}>
              <Link to={`/mentors/${m.id}`} className="card block h-full p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start gap-3">
                  <Avatar name={m.name} size={46} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-forest">{m.name}</p>
                    <p className="truncate text-[12.5px] text-ink-muted">{t(m.role)}</p>
                  </div>
                  <Badge tone={m.status === 'active' ? 'green' : 'neutral'}>{m.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">{groups.length ? groups.map((g) => <Badge key={g.id} tone="gold">{t(g.name)}</Badge>) : <span className="text-[12.5px] text-ink-muted">{t("No halqa assigned")}</span>}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  <div><p className="text-[16px] font-extrabold text-forest">{students.length}</p><p className="text-[11px] text-ink-muted">{t("Students")}</p></div>
                  <div><p className="text-[16px] font-extrabold text-forest">{att.marked ? `${att.attending}/${att.total}` : '—'}</p><p className="text-[11px] text-ink-muted">{t("Present today")}</p></div>
                  <div><p className={`text-[16px] font-extrabold ${sb.pending.length ? 'text-gold-700' : 'text-forest'}`}>{sb.done.length}/{sb.present.length}</p><p className="text-[11px] text-ink-muted">{t("Sabaq today")}</p></div>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-muted"><Phone size={13} /> {m.phone}</p>
              </Link>
            </motion.div>
          )
        })}
      </Stagger>
      <AddMentor open={newOpen === '1'} onClose={() => setNewOpen('')} />
      <AssignMentor open={assign} onClose={() => setAssign(false)} />
    </div>
  )
}

function AddMentor({ open, onClose }) {
  const { refreshPeople } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({ name: '', role: 'Hifz Mentor', phone: '', email: '', qualification: '', specialisation: '' })
  const [e, setE] = useState({})
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })
  const submit = async () => {
    const err = {}
    if (f.name.trim().length < 3) err.name = 'Enter the full name.'
    if (!/^[+\d][\d\s-]{6,}$/.test(f.phone.trim())) err.phone = 'Enter a valid phone number.'
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) err.email = 'Enter a valid email.'
    setE(err)
    if (Object.keys(err).length) return
    setSaving(true)
    try {
      await post('/staff', { displayName: f.name.trim(), title: f.role, phone: f.phone.trim(), ...(f.email.trim() ? { email: f.email.trim() } : {}), joinedOn: new Date().toISOString().slice(0, 10), qualification: f.qualification, specialisation: f.specialisation })
      await refreshPeople()
      toast('Mentor added', { description: 'Assign a halqa to give them students. Create their sign-in from Users & Access.' })
      setF({ name: '', role: 'Hifz Mentor', phone: '', email: '', qualification: '', specialisation: '' })
      onClose()
    } catch (err2) {
      toast(err2.message, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("Add mentor")} footer={<><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button icon={UserPlus} onClick={submit} loading={saving}>{t("Add mentor")}</Button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Input className="sm:col-span-2" label={t("Full name")} required value={f.name} onChange={set('name')} error={e.name} placeholder="e.g. Hafiz Abdul Basit" />
        <Select label={t("Role")} value={f.role} onChange={set('role')} options={['Hifz Mentor', 'Nazira Mentor', 'Qaida Mentor', 'Alimiyyah Teacher', 'Hostel Warden']} />
        <Input label={t("Phone")} type="tel" required value={f.phone} onChange={set('phone')} error={e.phone} />
        <Input label={t("Email")} type="email" value={f.email} onChange={set('email')} error={e.email} />
        <Input label={t("Qualification")} value={f.qualification} onChange={set('qualification')} />
        <Input className="sm:col-span-2" label={t("Specialisation")} value={f.specialisation} onChange={set('specialisation')} />
      </div>
    </Modal>
  )
}

export function AssignMentor({ open, onClose, groupId: initialGroup }) {
  const { state, idx } = useStore()
  const { refreshPeople } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [groupId, setGroupId] = useState(initialGroup || state.groups[0].id)
  const [mentorId, setMentorId] = useState('')
  useEffect(() => { if (open) { const g = initialGroup || state.groups[0].id; setGroupId(g); setMentorId(idx.groups[g]?.mentorId || '') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const students = state.students.filter((s) => s.groupId === groupId && s.status === 'active')
  const current = idx.mentors[idx.groups[groupId]?.mentorId]
  const submit = async () => {
    if (!mentorId || mentorId === current?.id) return onClose()
    setSaving(true)
    try {
      await put(`/groups/${idx.groups[groupId].uuid}/mentor`, { staffId: idx.mentors[mentorId].uuid })
      await refreshPeople()
      toast('Mentor assigned', { description: `${idx.mentors[mentorId].name} → ${idx.groups[groupId].name} (${students.length} students)` })
      onClose()
    } catch (err) {
      toast(err.message, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("Assign mentor to halqa")} footer={<><Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button><Button onClick={submit} loading={saving}>{t("Assign")}</Button></>}>
      <div className="space-y-3.5">
        <Select label={t("Halqa")} value={groupId} onChange={(e) => { setGroupId(e.target.value); setMentorId(idx.groups[e.target.value]?.mentorId || '') }} options={state.groups.map((g) => ({ value: g.id, label: g.name }))} />
        <p className="text-[13px] text-ink-muted">{t("Current mentor:")} <b className="text-forest">{current?.name || 'None'}</b></p>
        <Select label={t("New mentor")} value={mentorId} onChange={(e) => setMentorId(e.target.value)} options={state.mentors.map((m) => ({ value: m.id, label: `${m.name}${m.status !== 'active' ? ' (inactive)' : ''}`, disabled: m.status !== 'active' }))} />
        <Card className="p-3">
          <CardHeader title={`${students.length} students will be assigned`} icon={Users} className="!p-0" />
          <p className="mt-2 text-[13px] text-ink-soft">{students.map((s) => s.name).join(', ')}</p>
        </Card>
      </div>
    </Modal>
  )
}
