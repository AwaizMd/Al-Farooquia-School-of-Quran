import { t } from '../../i18n/I18nProvider'
import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Copy, KeyRound, Plus, Power, QrCode, RefreshCw, ScanLine, Settings2, ShieldOff, Smartphone, Wifi, WifiOff } from 'lucide-react'
import { get, patch, post, put } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Notice, PageHeader, Select, Stat, Tabs, Textarea } from '../../components/ui'
import { fmtDateTime, todayISO } from '../../utils/date'

// Registering, configuring and watching attendance kiosks. The server checks kiosks.manage on every call.
const OUTCOMES = {
  CHECK_IN: 'Check-in', CHECK_OUT: 'Check-out', QR_INVALID: 'Invalid QR code', QR_EXPIRED: 'QR code expired', QR_ALREADY_USED: 'QR code already used', QR_REVOKED: 'QR code cancelled', QR_NOT_ACCEPTED: 'QR code type not accepted',
  STAFF_NOT_ASSIGNED: 'Not assigned to this madrasa', STAFF_INACTIVE: 'Staff account inactive', ALREADY_RECORDED: 'Already recorded', ALREADY_CHECKED_IN: 'Already checked in', NOT_CHECKED_IN: 'Not checked in', OUTSIDE_ATTENDANCE_TIME: 'Outside attendance time',
  PIN_REQUIRED: 'PIN required', PIN_INVALID: 'Wrong PIN', PIN_NOT_SET: 'PIN not set', ACTION_REQUIRED: 'Check in or out not chosen',
}
const statusBadge = (k) => {
  if (k.status === 'REVOKED') return <Badge tone="red">{t('Revoked')}</Badge>
  if (k.status === 'DISABLED') return <Badge tone="neutral">{t('Deactivated')}</Badge>
  if (k.status === 'PENDING') return <Badge tone="gold">{t('Waiting for registration')}</Badge>
  return k.online ? <Badge tone="green" icon={Wifi}>{t('Online')}</Badge> : <Badge tone="amber" icon={WifiOff}>{t('Offline')}</Badge>
}
const when = (d) => (d ? fmtDateTime(d) : t('Never'))

export default function Kiosks() {
  const auth = useAuth()
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const [tab, setTab] = useState('devices')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState({ from: todayISO(), to: todayISO(), branch: '', kioskId: '' })
  const [form, setForm] = useState(null)
  const [code, setCode] = useState(null)
  const [activity, setActivity] = useState(null)

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v))
      setData(await get(`/kiosks?${q}`))
      setError('')
    } catch (e) { setError(e.message) }
  }, [filter])
  useEffect(() => { load() }, [load])

  const act = (fn, message) => run(fn).then((r) => { if (message) toast(t(message)); load(); return r }, (e) => { if (e.code !== 'CANCELLED') toast(e.message, { type: 'error' }); return null })
  const showCode = (r) => { if (r?.registrationCode) setCode({ ...r, name: r.kiosk.name }) }
  const save = async () => {
    const body = { name: form.name.trim(), branch: form.branch.trim() || null, location: form.location.trim() || null, allowedIps: form.allowedIps.split(/[\s,]+/).filter(Boolean) }
    try {
      if (form.id) { await patch(`/kiosks/${form.id}`, body); toast(t('Kiosk saved')); load() } else { const r = await run(() => post('/kiosks', body)); load(); showCode(r) }
      setForm(null)
    } catch (e) { if (e.code !== 'CANCELLED') setForm((f) => ({ ...f, errors: e.fieldErrors, error: e.code === 'VALIDATION_FAILED' ? '' : e.message })) }
  }
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const T = data?.totals

  return (
    <div className="space-y-4">
      <PageHeader title={t('Attendance Kiosks')} subtitle={t('Phones and tablets that scan staff attendance QR codes at the entrance')} actions={<Button icon={Plus} onClick={() => setForm({ name: '', branch: '', location: '', allowedIps: '' })}>{t('Add kiosk')}</Button>} />
      {error && <Notice tone="red">{t(error)}</Notice>}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'devices', label: 'Kiosks', icon: Smartphone }, { value: 'settings', label: 'Settings', icon: Settings2 }]} />

      {tab === 'devices' && (
        <>
          <section aria-label={t('Summary')} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Registered kiosks" value={T?.registered ?? '—'} icon={Smartphone} />
            <Stat label="Online" value={T?.active ?? '—'} icon={Wifi} sub={t('{n} offline', { n: T?.offline ?? 0 })} tone={T?.offline ? 'amber' : 'green'} />
            <Stat label="Deactivated" value={T?.deactivated ?? '—'} icon={ShieldOff} tone="gold" />
            <Stat label="Scans in this period" value={T?.scans ?? '—'} icon={ScanLine} sub={t('{ok} recorded, {bad} refused', { ok: T?.successful ?? 0, bad: T?.failed ?? 0 })} />
            <Stat label="Duplicate scans" value={T?.duplicates ?? '—'} icon={ScanLine} tone={T?.duplicates ? 'amber' : 'green'} />
          </section>
          <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input label={t('From')} type="date" value={filter.from} onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value }))} />
            <Input label={t('To')} type="date" value={filter.to} onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value }))} />
            <Select label={t('Branch')} value={filter.branch} onChange={(e) => setFilter((f) => ({ ...f, branch: e.target.value }))} options={[{ value: '', label: t('All branches') }, ...(data?.branches ?? []).map((b) => ({ value: b, label: b }))]} />
            <Select label={t('Kiosk')} value={filter.kioskId} onChange={(e) => setFilter((f) => ({ ...f, kioskId: e.target.value }))} options={[{ value: '', label: t('All kiosks') }, ...(data?.items ?? []).map((k) => ({ value: k.id, label: k.name }))]} />
          </Card>
          {data && !data.items.length && <EmptyState icon={Smartphone} title={t('No kiosks yet')}>{t('Add a kiosk, then open its registration code on an Android phone at the entrance.')}</EmptyState>}
          <div className="space-y-3">
            {data?.items.map((k) => (
              <Card key={k.id}>
                <CardHeader icon={Smartphone} title={k.name} subtitle={[k.branch, k.location].filter(Boolean).join(' · ') || t('No branch set')} action={statusBadge(k)} />
                <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-4">
                    <div><dt className="text-ink-muted">{t('Last active')}</dt><dd className="font-semibold">{when(k.lastSeenAt)}</dd></div>
                    <div><dt className="text-ink-muted">{t('Last attendance recorded')}</dt><dd className="font-semibold">{when(k.lastScanAt)}</dd></div>
                    <div><dt className="text-ink-muted">{t('Recorded in this period')}</dt><dd className="font-semibold tabular">{k.successful}</dd></div>
                    <div><dt className="text-ink-muted">{t('Refused in this period')}</dt><dd className="font-semibold tabular">{k.failed}</dd></div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" icon={Activity} onClick={() => setActivity(k)}>{t('Activity')}</Button>
                    <Button size="sm" variant="secondary" onClick={() => setForm({ id: k.id, name: k.name, branch: k.branch ?? '', location: k.location ?? '', allowedIps: k.allowedIps.join(', ') })}>{t('Edit')}</Button>
                    <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => act(() => post(`/kiosks/${k.id}/registration-code`)).then(showCode)}>{k.status === 'ACTIVE' ? t('Re-register device') : t('New registration code')}</Button>
                    {k.status === 'ACTIVE' && <Button size="sm" variant="secondary" icon={Power} onClick={() => act(() => post(`/kiosks/${k.id}/deactivate`), 'Kiosk deactivated')}>{t('Deactivate')}</Button>}
                    {k.status === 'DISABLED' && <Button size="sm" variant="secondary" icon={Power} onClick={() => act(() => post(`/kiosks/${k.id}/activate`), 'Kiosk activated')}>{t('Activate')}</Button>}
                    {k.status !== 'REVOKED' && <Button size="sm" variant="danger-soft" icon={ShieldOff} onClick={() => { if (window.confirm(t('Revoke this kiosk? Its device stops working at once and needs a new registration code.'))) act(() => post(`/kiosks/${k.id}/revoke`), 'Kiosk revoked') }}>{t('Revoke')}</Button>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      {tab === 'settings' && <KioskSettings canSetDefaults={auth.can('org.manage')} />}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? t('Edit kiosk') : t('Add kiosk')}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>{t('Cancel')}</Button><Button onClick={save}>{form?.id ? t('Save') : t('Create and show code')}</Button></>}>
        {form && (
          <div className="grid gap-3">
            <Input label={t('Kiosk name')} placeholder={t('e.g. Main Gate')} value={form.name} onChange={setF('name')} error={form.errors?.name} required />
            <Input label={t('Branch')} placeholder={t('e.g. Boys Wing')} value={form.branch} onChange={setF('branch')} error={form.errors?.branch} />
            <Input label={t('Entrance or location')} placeholder={t('e.g. Front entrance')} value={form.location} onChange={setF('location')} error={form.errors?.location} />
            <Textarea label={t('Allowed network addresses (optional)')} hint={t('Leave empty to allow any. A kiosk used from another address is refused. End with a dot for a range, e.g. 203.0.113.')} value={form.allowedIps} onChange={setF('allowedIps')} />
            {form.error && <p className="text-[13px] text-clay-600" role="alert">{form.error}</p>}
          </div>
        )}
      </Modal>
      <CodeDialog code={code} onClose={() => setCode(null)} />
      <ActivityDialog kiosk={activity} onClose={() => setActivity(null)} />
      {dialog}
    </div>
  )
}

function CodeDialog({ code, onClose }) {
  const toast = useToast()
  return (
    <Modal open={!!code} onClose={onClose} title={t('Register the kiosk')} subtitle={code?.name} footer={<Button onClick={onClose}>{t('Done')}</Button>}>
      {code && (
        <div className="space-y-3 text-center">
          <Notice tone="gold" icon={AlertTriangle}>{t('This code works once and is shown only now. It expires {when}.', { when: fmtDateTime(code.registrationExpiresAt) })}</Notice>
          <img src={code.registrationQr} alt={t('Registration QR code')} className="mx-auto h-56 w-56" />
          <p className="flex items-center justify-center gap-2 font-mono text-[26px] font-extrabold tracking-widest text-forest">{code.registrationCode}
            <button type="button" aria-label={t('Copy the code')} className="flex h-11 w-11 items-center justify-center rounded-lg text-primary-700 hover:bg-primary-50" onClick={() => navigator.clipboard?.writeText(code.registrationCode).then(() => toast(t('Copied')), () => {})}><Copy size={16} /></button>
          </p>
          <ol className="list-decimal space-y-1 ps-5 text-start text-[13.5px] text-ink-soft">
            <li>{t('On the Android phone, open Chrome and go to {url}', { url: `${window.location.origin}/kiosk.html` })}</li>
            <li>{t('Enter this code, or tap “Scan the code instead” and point the phone at this QR.')}</li>
            <li>{t('Allow the camera, then choose “Add to Home screen” from the Chrome menu.')}</li>
          </ol>
        </div>
      )}
    </Modal>
  )
}

function ActivityDialog({ kiosk, onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    setRows(null)
    if (kiosk) get(`/kiosks/${kiosk.id}/scans?pageSize=100`).then((r) => setRows(r.items), () => setRows([]))
  }, [kiosk])
  return (
    <Modal open={!!kiosk} onClose={onClose} title={t('Kiosk activity')} subtitle={kiosk ? `${kiosk.name} · ${t('last 7 days')}` : ''} size="lg" footer={<Button variant="secondary" onClick={onClose}>{t('Close')}</Button>}>
      {rows && !rows.length && <p className="text-[13.5px] text-ink-muted">{t('Nothing recorded in the last 7 days.')}</p>}
      <ul className="divide-y divide-line">
        {rows?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13.5px]">
            <span className="flex items-center gap-2">
              {r.ok ? <CheckCircle2 size={16} className="text-primary-600" aria-hidden /> : <AlertTriangle size={16} className="text-clay-600" aria-hidden />}
              <span className="font-semibold">{t(OUTCOMES[r.outcome] ?? r.outcome)}</span>
              {r.staff && <span className="text-ink-soft">· {r.staff.displayName} ({r.staff.code})</span>}
            </span>
            <span className="text-[12.5px] text-ink-muted">{fmtDateTime(r.at)}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

const MODES = [{ value: 'AUTO', label: 'Automatic: the record decides' }, { value: 'MANUAL', label: 'Manual: staff tap Check In or Check Out' }, { value: 'TIME_WINDOW', label: 'Time-based: the clock decides' }]
const pack = (f) => ({
  mode: f.mode, checkInWindow: f.inFrom && f.inTo ? { from: f.inFrom, to: f.inTo } : null, checkOutWindow: f.outFrom && f.outTo ? { from: f.outFrom, to: f.outTo } : null,
  multipleSessions: f.multipleSessions, duplicateWindowSeconds: Number(f.duplicateWindowSeconds), maxSessionHours: Number(f.maxSessionHours), pinRequired: f.pinRequired, highSecurity: f.highSecurity,
  qr: { dynamic: f.qrDynamic, static: f.qrStatic, refreshSeconds: Number(f.refreshSeconds), ttlSeconds: Number(f.ttlSeconds) },
  ui: { instructions: f.instructions, successSeconds: Number(f.successSeconds), errorSeconds: Number(f.errorSeconds), screenDimSeconds: Number(f.screenDimSeconds), fullScreen: f.fullScreen, cameraFacing: f.cameraFacing },
})
const unpack = (s) => ({
  mode: s.mode, inFrom: s.checkInWindow?.from ?? '', inTo: s.checkInWindow?.to ?? '', outFrom: s.checkOutWindow?.from ?? '', outTo: s.checkOutWindow?.to ?? '', multipleSessions: s.multipleSessions, duplicateWindowSeconds: s.duplicateWindowSeconds, maxSessionHours: s.maxSessionHours,
  pinRequired: s.pinRequired, highSecurity: s.highSecurity, qrDynamic: s.qr.dynamic, qrStatic: s.qr.static, refreshSeconds: s.qr.refreshSeconds, ttlSeconds: s.qr.ttlSeconds, instructions: s.ui.instructions, successSeconds: s.ui.successSeconds, errorSeconds: s.ui.errorSeconds, screenDimSeconds: s.ui.screenDimSeconds, fullScreen: s.ui.fullScreen, cameraFacing: s.ui.cameraFacing,
})

function Check({ label, checked, onChange, hint }) {
  return (
    <label className="flex min-h-[44px] items-start gap-2 text-[14px]">
      <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <span className="block text-[12.5px] text-ink-muted">{hint}</span>}</span>
    </label>
  )
}

function KioskSettings({ canSetDefaults }) {
  const toast = useToast()
  const [f, setF] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { get('/kiosk-settings').then((r) => setF(unpack(r.effective)), (e) => toast(e.message, { type: 'error' })) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return <p className="text-[13.5px] text-ink-muted">{t('Loading…')}</p>
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }))
  const save = async (path) => {
    setBusy(true)
    setErrors({})
    try {
      const r = await put(path, pack(f))
      setF(unpack(r.effective))
      toast(t(path.endsWith('organization') ? 'Saved as the default for all madrasas' : 'Kiosk settings saved'), { description: t('Kiosks pick this up within a minute.') })
    } catch (e) {
      setErrors(e.fieldErrors ?? {})
      toast(e.message, { type: 'error' })
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4 pb-20">
      <Card>
        <CardHeader icon={ScanLine} title={t('Attendance')} subtitle={t('How a scan becomes a check-in or a check-out')} />
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5">
          <Select className="sm:col-span-2" label={t('Mode')} value={f.mode} onChange={set('mode')} options={MODES} />
          <Input label={t('Check-in opens')} type="time" value={f.inFrom} onChange={set('inFrom')} error={errors.checkInWindow} />
          <Input label={t('Check-in closes')} type="time" value={f.inTo} onChange={set('inTo')} />
          <Input label={t('Check-out opens')} type="time" value={f.outFrom} onChange={set('outFrom')} />
          <Input label={t('Check-out closes')} type="time" value={f.outTo} onChange={set('outTo')} />
          <p className="text-[12.5px] text-ink-muted sm:col-span-2">{t('Leave the times empty to allow any time. Time-based mode needs all four.')}</p>
          <Input label={t('Ignore a repeat scan within (seconds)')} type="number" min={0} max={3600} value={f.duplicateWindowSeconds} onChange={set('duplicateWindowSeconds')} error={errors.duplicateWindowSeconds} />
          <Input label={t('Count as a missed check-out after (hours)')} type="number" min={1} max={36} value={f.maxSessionHours} onChange={set('maxSessionHours')} error={errors.maxSessionHours} />
          <Check label={t('Allow several check-ins in one day')} checked={f.multipleSessions} onChange={set('multipleSessions')} />
          <Check label={t('Ask for a PIN at the kiosk')} checked={f.pinRequired} onChange={set('pinRequired')} hint={t('Each person sets their PIN on their QR code page.')} />
          <Check label={t('High-security mode')} checked={f.highSecurity} onChange={set('highSecurity')} hint={t('Dynamic codes only, and a PIN every time.')} />
        </div>
      </Card>
      <Card>
        <CardHeader icon={QrCode} title={t('QR codes')} />
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5">
          <Check label={t('Dynamic codes')} checked={f.qrDynamic} onChange={set('qrDynamic')} hint={t('Change regularly and work once. Recommended.')} />
          <Check label={t('Static codes')} checked={f.qrStatic} onChange={set('qrStatic')} hint={t('Accepts a code that does not change. A photo of it would keep working until cancelled.')} />
          <Input label={t('New code every (seconds)')} type="number" min={15} max={300} value={f.refreshSeconds} onChange={set('refreshSeconds')} error={errors['qr.refreshSeconds']} />
          <Input label={t('Each code expires after (seconds)')} type="number" min={15} max={600} value={f.ttlSeconds} onChange={set('ttlSeconds')} error={errors['qr.ttlSeconds']} />
          {errors['qr.dynamic'] && <p className="text-[12.5px] text-clay-600 sm:col-span-2" role="alert">{errors['qr.dynamic']}</p>}
        </div>
      </Card>
      <Card>
        <CardHeader icon={Smartphone} title={t('Kiosk screen')} />
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5">
          <Input className="sm:col-span-2" label={t('Instructions shown on the kiosk')} value={f.instructions} onChange={set('instructions')} error={errors['ui.instructions']} />
          <Input label={t('Success screen stays for (seconds)')} type="number" min={1} max={30} value={f.successSeconds} onChange={set('successSeconds')} />
          <Input label={t('Error screen stays for (seconds)')} type="number" min={1} max={30} value={f.errorSeconds} onChange={set('errorSeconds')} />
          <Input label={t('Dim the screen when idle after (seconds, 0 = never)')} type="number" min={0} max={3600} value={f.screenDimSeconds} onChange={set('screenDimSeconds')} />
          <Select label={t('Camera')} value={f.cameraFacing} onChange={set('cameraFacing')} options={[{ value: 'environment', label: t('Rear camera') }, { value: 'user', label: t('Front camera') }]} />
          <Check label={t('Full screen')} checked={f.fullScreen} onChange={set('fullScreen')} />
        </div>
      </Card>
      <div className="flex flex-wrap justify-end gap-2">
        {canSetDefaults && <Button variant="secondary" icon={RefreshCw} loading={busy} onClick={() => save('/kiosk-settings/organization')}>{t('Save as default for all madrasas')}</Button>}
        <Button loading={busy} onClick={() => save('/kiosk-settings')}>{t('Save for this madrasa')}</Button>
      </div>
    </div>
  )
}
