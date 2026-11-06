import { t } from '../../i18n/I18nProvider'
import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, KeyRound, QrCode } from 'lucide-react'
import { get, put } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import { useSensitiveAction } from '../../components/feedback/ReauthDialog'
import { Badge, Button, Card, CardHeader, Input, Notice, PageHeader } from '../../components/ui'

// A staff member's own attendance QR. The server issues each code; it holds a signed
// reference only, so showing it reveals nothing about the person.
const clock = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—')
const hours = (m) => (m == null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`)

export default function MyAttendanceQr() {
  const toast = useToast()
  const { run, dialog } = useSensitiveAction()
  const [qr, setQr] = useState(null)
  const [error, setError] = useState('')
  const [left, setLeft] = useState(0)
  const [history, setHistory] = useState(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const r = await get('/staff-attendance/me/qr')
      setQr(r)
      setLeft(r.refreshSeconds)
      setError('')
    } catch (e) {
      setQr(null)
      setError(e.message)
    }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  // Count down and fetch the next code. Nothing runs while the page is hidden.
  useEffect(() => {
    if (!qr || qr.kind !== 'dynamic') return undefined
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setLeft((n) => {
        if (n <= 1) { refresh(); return 0 }
        return n - 1
      })
    }, 1000)
    const onShow = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onShow)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow) }
  }, [qr?.kind, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { get('/staff-attendance/me').then((r) => setHistory(r.items), () => setHistory([])) }, [])

  const savePin = async (value) => {
    setPinError('')
    try {
      await run(() => put('/staff-attendance/me/pin', { pin: value }))
      setPin('')
      toast(t(value ? 'Attendance PIN saved' : 'Attendance PIN removed'))
      refresh()
    } catch (e) {
      if (e.code !== 'CANCELLED') setPinError(e.fieldErrors?.pin ?? e.message)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title={t('My Attendance QR')} subtitle={t('Show this to the kiosk at the entrance')} />
      {error && <Notice tone="red">{t(error)}</Notice>}
      {qr && (
        <Card className="flex flex-col items-center gap-2 p-5 text-center">
          <img src={qr.qrDataUrl} alt={t('Your attendance QR code')} className="aspect-square w-full max-w-[300px] rounded-xl bg-white" />
          <p className="text-[15px] font-bold text-forest">{qr.staff.displayName} · {qr.staff.code}</p>
          {qr.kind === 'dynamic' ? <p className="text-[13.5px] text-ink-muted tabular" aria-live="off">{t('New code in {n} seconds', { n: left })}</p> : <p className="text-[13.5px] text-ink-muted">{t('This code does not change. Do not share a photo of it.')}</p>}
        </Card>
      )}
      <Card>
        <CardHeader icon={KeyRound} title={t('Attendance PIN')} subtitle={qr?.pin.required ? t('The kiosk asks for this PIN after you scan') : t('Optional here: this madrasa does not ask for a PIN at the moment')} action={qr?.pin.set ? <Badge tone="green">{t('Set')}</Badge> : <Badge tone={qr?.pin.required ? 'red' : 'neutral'}>{t('Not set')}</Badge>} />
        <form className="flex flex-wrap items-start gap-2 px-4 pb-4 sm:px-5 sm:pb-5" onSubmit={(e) => { e.preventDefault(); savePin(pin) }}>
          <Input className="min-w-[160px] flex-1" label={t('New PIN (4 to 6 digits)')} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} error={pinError} />
          <Button type="submit" className="mt-6" disabled={pin.length < 4}>{t('Save PIN')}</Button>
          {qr?.pin.set && <Button type="button" variant="secondary" className="mt-6" onClick={() => savePin(null)}>{t('Remove')}</Button>}
        </form>
      </Card>
      <Card>
        <CardHeader icon={CalendarClock} title={t('My attendance this month')} />
        {history && !history.length && <p className="px-4 pb-4 text-[13.5px] text-ink-muted sm:px-5">{t('Nothing recorded yet this month.')}</p>}
        <ul className="divide-y divide-line">
          {history?.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px] sm:px-5">
              <span className="font-semibold text-forest">{r.date}</span>
              <span className="tabular text-ink-soft">{clock(r.checkInAt)} – {clock(r.checkOutAt)} · {hours(r.workedMinutes)}</span>
              {r.lateMinutes > 0 && <Badge tone="amber">{t('Late {n} min', { n: r.lateMinutes })}</Badge>}
              {r.status === 'MISSED_CHECKOUT' && <Badge tone="amber">{t('Missed check-out')}</Badge>}
            </li>
          ))}
        </ul>
      </Card>
      <QrCodeHint />
      {dialog}
    </div>
  )
}

function QrCodeHint() {
  return <p className="flex items-center justify-center gap-1.5 text-center text-[12.5px] text-ink-muted"><QrCode size={14} aria-hidden /> {t('Turn your screen brightness up if the kiosk has trouble reading the code.')}</p>
}
