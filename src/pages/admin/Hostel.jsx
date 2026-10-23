import { t } from "../../i18n/I18nProvider"
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BedDouble, DoorOpen, Users, AlertTriangle, UserPlus, LogOut, Save, CheckCheck } from 'lucide-react'
import { useStore } from '../../context/DemoStore'
import { useToast } from '../../context/ToastContext'
import { useQueryState } from '../../hooks/useQueryState'
import { PageHeader, Card, CardHeader, Tabs, Stat, Avatar, Button, Modal, Select, ConfirmDialog, EmptyState, Input, cx, ProgressBar, Notice, SearchInput } from '../../components/ui'
import { hostelSummary, hostelAlerts } from '../../services/selectors'
import { fmtDay } from '../../utils/date'
import { pct } from '../../utils/format'

export default function Hostel() {
  const { state, idx, today } = useStore()
  const [tab, setTab] = useQueryState('tab', 'overview')
  const sum = hostelSummary(state, idx)
  const alerts = hostelAlerts(state, idx, today)
  return (
    <div>
      <PageHeader title={t("Hostel")} subtitle={t('{r} residents · {rooms} rooms · {b} beds', { r: sum.residents.length, rooms: sum.rooms, b: sum.beds })} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'rooms', label: 'Rooms & beds' }, { value: 'residents', label: 'Residents' }, { value: 'attendance', label: 'Night roll call', count: alerts.length || undefined }]} />
      {tab === 'overview' && <Overview sum={sum} alerts={alerts} setTab={setTab} />}
      {tab === 'rooms' && <Rooms />}
      {tab === 'residents' && <Residents />}
      {tab === 'attendance' && <RollCall alerts={alerts} />}
    </div>
  )
}

function Overview({ sum, alerts, setTab }) {
  const { state } = useStore()
  const blocks = [...new Set(state.rooms.map((r) => r.block))]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label={t("Total rooms")} value={sum.rooms} icon={DoorOpen} />
        <Stat label={t("Occupied beds")} value={sum.occupied} sub={t('{pct}% occupancy', { pct: pct(sum.occupied, sum.beds) })} icon={BedDouble} tone="blue" />
        <Stat label={t("Available beds")} value={sum.available} icon={BedDouble} tone="green" />
        <Stat label={t("Awaiting a bed")} value={sum.unassigned.length} sub={sum.unassigned.map((s) => s.name.split(' ')[0]).join(', ') || 'None'} icon={UserPlus} tone="gold" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("Occupancy by block")} icon={BedDouble} />
          <div className="space-y-4 p-4 sm:p-5">
            {blocks.map((b) => {
              const beds = state.beds.filter((x) => state.rooms.find((r) => r.id === x.roomId).block === b)
              const occ = beds.filter((x) => x.studentId).length
              return <div key={b}><div className="mb-1 flex justify-between text-[13px]"><span className="font-semibold text-forest">{t(b)}</span><span className="tabular text-ink-muted">{occ}/{beds.length} {t("beds")}</span></div><ProgressBar value={pct(occ, beds.length)} tone="blue" label={`${b} occupancy`} /></div>
            })}
          </div>
        </Card>
        <Card>
          <CardHeader title={t("Absence alerts & discrepancies")} subtitle={t("Hostel roll call vs class attendance, last 3 nights")} icon={AlertTriangle} />
          {alerts.length ? (
            <ul className="mt-2 divide-y divide-line">
              {alerts.map((a, i) => (
                <li key={i}><Link to={`/students/${a.student.id}?tab=hostel`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory-50 sm:px-5"><Avatar name={a.student.name} size={34} /><span className="min-w-0"><span className="block text-[14px] font-bold text-forest">{a.student.name}</span><span className={`block text-[12px] ${a.type === 'absence' ? 'text-clay-600' : 'text-amber-700'}`}>{fmtDay(a.date)} · {a.text}</span></span></Link></li>
              ))}
            </ul>
          ) : <EmptyState title={t("No alerts")} />}
          <div className="border-t border-line p-3"><Button size="sm" variant="ghost" onClick={() => setTab('attendance')}>{t("Open roll call")}</Button></div>
        </Card>
      </div>
    </div>
  )
}

function Rooms() {
  const { state, idx, dispatch } = useStore()
  const toast = useToast()
  const [assign, setAssign] = useState(null)
  const [pick, setPick] = useState('')
  const [vacate, setVacate] = useState(null)
  const residents = state.students.filter((s) => s.hostel && s.status === 'active')
  const unassigned = residents.filter((s) => !idx.bedByStudent[s.id])

  const doAssign = () => {
    if (!pick) return
    const bed = state.beds.find((b) => b.id === assign.id)
    if (bed.studentId) { toast('This bed is already occupied', { type: 'error' }); setAssign(null); return }
    const moving = idx.bedByStudent[pick]
    dispatch({ type: 'ASSIGN_BED', bedId: assign.id, studentId: pick })
    toast(moving ? 'Student moved' : 'Bed assigned', { description: `${idx.students[pick].name} → ${bed.roomId} · ${bed.label}${moving ? ` (from ${moving.roomId})` : ''}` })
    setAssign(null); setPick('')
  }

  return (
    <div className="space-y-4">
      {unassigned.length > 0 && <Notice tone="gold" icon={UserPlus}>{unassigned.length} {t("resident")}{unassigned.length > 1 ? 's are' : ' is'} {t("awaiting a bed:")} {unassigned.map((s) => s.name).join(', ')}. Tap any available bed to assign.</Notice>}
      <div className="flex flex-wrap gap-3 text-[12px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-primary-400 bg-primary-50" />{t("Available")}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slateblue-500" />{t("Occupied")}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {state.rooms.map((r) => {
          const beds = state.beds.filter((b) => b.roomId === r.id)
          const occ = beds.filter((b) => b.studentId).length
          return (
            <Card key={r.id} className="p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <div><p className="text-[15px] font-extrabold text-forest">{r.id}</p><p className="text-[11.5px] text-ink-muted">{t(r.block)} · {t('{f} floor', { f: t(r.floor) })}</p></div>
                <span className={cx('chip', occ === beds.length ? 'bg-slateblue-50 text-slateblue-600' : 'bg-primary-50 text-primary-700')}>{occ === beds.length ? t('Full') : t('{n} free', { n: beds.length - occ })}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {beds.map((b) => {
                  const st = idx.students[b.studentId]
                  return st ? (
                    <button key={b.id} type="button" onClick={() => setVacate(b)} className="flex min-h-[64px] flex-col items-start justify-between rounded-xl bg-slateblue-500 p-2 text-start text-white transition hover:bg-slateblue-600" aria-label={`${b.label} occupied by ${st.name}`}>
                      <span className="text-[10.5px] font-bold uppercase opacity-80">{t(b.label)}</span>
                      <span className="line-clamp-2 text-[12.5px] font-bold leading-tight">{st.name}</span>
                    </button>
                  ) : (
                    <button key={b.id} type="button" onClick={() => { setAssign(b); setPick(unassigned[0]?.id || '') }} className="flex min-h-[64px] flex-col items-start justify-between rounded-xl border border-dashed border-primary-400 bg-primary-50/60 p-2 text-start text-primary-700 transition hover:bg-primary-50" aria-label={`${b.label} available, assign student`}>
                      <span className="text-[10.5px] font-bold uppercase">{t(b.label)}</span>
                      <span className="flex items-center gap-1 text-[12.5px] font-bold"><UserPlus size={13} /> {t("Assign")}</span>
                    </button>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>

      <Modal open={!!assign} onClose={() => setAssign(null)} title={`Assign ${assign?.roomId} · ${assign?.label}`} subtitle={t("Only hostel residents can be assigned. Choosing a resident who already has a bed moves them.")}
        footer={<><Button variant="secondary" onClick={() => setAssign(null)}>{t("Cancel")}</Button><Button onClick={doAssign} disabled={!pick}>{t("Assign bed")}</Button></>}>
        <Select label={t("Resident")} value={pick} onChange={(e) => setPick(e.target.value)} placeholder={t("Select resident")} options={[
          ...unassigned.map((s) => ({ value: s.id, label: `${s.name} — awaiting bed` })),
          ...residents.filter((s) => idx.bedByStudent[s.id]).map((s) => ({ value: s.id, label: `${s.name} — move from ${idx.bedByStudent[s.id].roomId} ${idx.bedByStudent[s.id].label}` })),
        ]} />
        {!residents.length && <p className="mt-2 text-[13px] text-ink-muted">{t("No hostel residents. Mark a student as a hostel resident on their profile first.")}</p>}
      </Modal>
      <ConfirmDialog open={!!vacate} onClose={() => setVacate(null)} title={t("Vacate this bed?")} confirmLabel={t("Vacate bed")} tone="danger"
        onConfirm={() => { dispatch({ type: 'VACATE_BED', bedId: vacate.id }); toast('Bed vacated', { description: `${vacate.roomId} · ${vacate.label}` }) }}>
        {vacate && <>{idx.students[vacate.studentId]?.name} {t("will be removed from")} {vacate.roomId} · {vacate.label} {t("and listed as awaiting a bed.")} <Link to={`/students/${vacate.studentId}?tab=hostel`} className="font-semibold text-primary-700 underline">{t("View profile")}</Link></>}
      </ConfirmDialog>
    </div>
  )
}

function Residents() {
  const { state, idx } = useStore()
  const [q, setQ] = useState('')
  const residents = state.students.filter((s) => s.hostel && s.status === 'active' && s.name.toLowerCase().includes(q.toLowerCase()))
  const lastNight = Object.keys(state.hostelAttendance).sort().pop()
  return (
    <Card>
      <div className="p-3 sm:p-4"><SearchInput value={q} onChange={setQ} placeholder={t("Search residents")} /></div>
      <ul className="divide-y divide-line border-t border-line">
        {residents.map((s) => {
          const bed = idx.bedByStudent[s.id]
          const roll = lastNight && state.hostelAttendance[lastNight][s.id]
          return (
            <li key={s.id}><Link to={`/students/${s.id}?tab=hostel`} className="flex items-center gap-3 px-4 py-3 hover:bg-ivory-50 sm:px-5">
              <Avatar name={s.name} size={36} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-bold text-forest">{s.name}</span><span className="block text-[12px] text-ink-muted">{t(idx.groups[s.groupId]?.short)} · {idx.parents[s.guardianId]?.phone}</span></span>
              <span className="text-end text-[12.5px]"><span className={`block font-bold ${bed ? 'text-forest' : 'text-gold-700'}`}>{bed ? `${bed.roomId} · ${bed.label}` : 'No bed'}</span><span className="block capitalize text-ink-muted">{roll ? `Last night: ${roll}` : '—'}</span></span>
            </Link></li>
          )
        })}
      </ul>
    </Card>
  )
}

function RollCall({ alerts }) {
  const { state, idx, dispatch, today } = useStore()
  const toast = useToast()
  const [date, setDate] = useState(today)
  const residents = state.beds.filter((b) => b.studentId).map((b) => idx.students[b.studentId]).filter(Boolean)
  const [draft, setDraft] = useState({})
  useEffect(() => setDraft(Object.fromEntries(residents.map((s) => [s.id, state.hostelAttendance[date]?.[s.id] || null]))), [date, state.hostelAttendance]) // eslint-disable-line react-hooks/exhaustive-deps
  const missing = residents.filter((s) => !draft[s.id]).length
  const save = () => {
    if (missing) return toast(`${missing} residents not marked`, { type: 'error' })
    dispatch({ type: 'SAVE_HOSTEL_ATTENDANCE', date, statuses: draft })
    toast('Roll call saved', { description: fmtDay(date) })
  }
  const OPTS = { present: 'border-primary-600 bg-primary-600 text-white', absent: 'border-clay-500 bg-clay-500 text-white', leave: 'border-slateblue-500 bg-slateblue-500 text-white' }
  return (
    <div className="space-y-4">
      {alerts.length > 0 && <Notice tone="red" icon={AlertTriangle}>{alerts.length} {t("discrepanc")}{alerts.length > 1 ? 'ies' : 'y'} {t("between class attendance and hostel roll call in the last 3 nights. See Overview for details.")}</Notice>}
      <Card className="flex flex-wrap items-end gap-3 p-3 sm:p-4">
        <Input label={t("Night of")} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="w-52" />
        <Button variant="soft" icon={CheckCheck} onClick={() => setDraft(Object.fromEntries(residents.map((s) => [s.id, draft[s.id] || 'present'])))}>{t("Mark rest present")}</Button>
        <div className="flex-1" />
        <Button icon={Save} onClick={save}>{t("Save roll call")}</Button>
      </Card>
      <Card>
        <ul className="divide-y divide-line">
          {residents.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
              <div className="flex flex-1 items-center gap-3"><Avatar name={s.name} size={34} /><span><span className="block text-[14px] font-bold text-forest">{s.name}</span><span className="text-[12px] text-ink-muted">{idx.bedByStudent[s.id]?.roomId} · class today: {state.attendance[date]?.[s.id] || 'not marked'}</span></span></div>
              <div role="radiogroup" aria-label={`Roll call for ${s.name}`} className="grid grid-cols-3 gap-1.5 sm:w-[260px]">
                {Object.keys(OPTS).map((k) => <button key={k} type="button" role="radio" aria-checked={draft[s.id] === k} onClick={() => setDraft((d) => ({ ...d, [s.id]: k }))} className={cx('min-h-[44px] rounded-xl border text-[12.5px] font-bold capitalize', draft[s.id] === k ? OPTS[k] : 'border-line-strong bg-white text-ink-soft')}>{k === 'leave' ? 'On leave' : k}</button>)}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
