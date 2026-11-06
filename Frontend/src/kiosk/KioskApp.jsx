import { useCallback, useEffect, useRef, useState } from 'react'
import { getStatus, registerDevice, resetDevice, submitScan } from './kioskApi'
import { useQrScanner } from './useQrScanner'

const HEARTBEAT_MS = 60_000
const SAME_CODE_IGNORE_MS = 4000
const CHOICE_TIMEOUT_MS = 20_000
const PIN_TIMEOUT_MS = 30_000
const STATUS_TEXT = { ON_TIME: 'On time', LATE: 'Late', EARLY_DEPARTURE: 'Early departure', COMPLETED: 'Completed' }
const ACTION_TEXT = { CHECK_IN: 'Check-in', CHECK_OUT: 'Check-out' }

const fmtDuration = (m) => `${Math.floor(m / 60)}h ${m % 60}m`

/** Top-level: is this device registered? The server is the only one who knows. */
export default function KioskApp() {
  const [phase, setPhase] = useState('loading')
  const [config, setConfig] = useState(null)
  const [notice, setNotice] = useState('')

  const check = useCallback(async () => {
    try {
      setConfig(await getStatus())
      setPhase('ready')
    } catch (err) {
      if (err.code === 'NETWORK') { setPhase((p) => (p === 'ready' ? 'ready' : 'offline')); return }
      setConfig(null)
      setNotice(err.code === 'DEVICE_UNAUTHORIZED' ? '' : err.message)
      setPhase('register')
    }
  }, [])
  useEffect(() => { check() }, [check])

  if (phase === 'loading') return <main className="k-center"><p className="k-muted">Starting…</p></main>
  if (phase === 'offline') return <main className="k-center"><h1>No internet connection</h1><p>The kiosk needs internet to start and to record attendance.</p><button type="button" className="k-btn" onClick={check}>Try again</button></main>
  if (phase === 'register') return <Register notice={notice} onDone={() => { setNotice(''); check() }} />
  return <Scanner config={config} onConfig={setConfig} onLost={(message) => { setNotice(message || 'This device is no longer authorised. Enter a new registration code from the office.'); setConfig(null); setPhase('register') }} />
}

function codeFromUrl() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  if (code) {
    url.searchParams.delete('code')
    window.history.replaceState(null, '', url.pathname)
  }
  return code || ''
}

/** A scanned registration QR holds a link with ?code=, but a bare code also works. */
const codeFromScan = (text) => {
  try { return new URL(text).searchParams.get('code') || '' } catch { return /^[A-Za-z0-9-]{8,12}$/.test(text) ? text : '' }
}

function Register({ notice, onDone }) {
  const [code, setCode] = useState(codeFromUrl)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(notice)
  const [busy, setBusy] = useState(false)

  const submit = async (value) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await registerDevice(value)
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <main className="k-register">
      <h1>Register this kiosk</h1>
      <p className="k-muted">In the admin panel, open Attendance Kiosks and create or select a kiosk. Enter its one-time code here, or scan its QR code.</p>
      {error && <p className="k-alert" role="alert">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); submit(code) }}>
        <label htmlFor="k-code">Registration code</label>
        <input id="k-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="XXXX-XXXX" inputMode="text" />
        <button type="submit" className="k-btn" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 8}>{busy ? 'Checking…' : 'Register'}</button>
      </form>
      <button type="button" className="k-btn k-btn-quiet" onClick={() => setScanning((s) => !s)}>{scanning ? 'Stop scanning' : 'Scan the code instead'}</button>
      {scanning && <RegisterCamera onCode={(text) => { const c = codeFromScan(text); if (c) { setScanning(false); setCode(c.toUpperCase()); submit(c) } }} />}
    </main>
  )
}

function RegisterCamera({ onCode }) {
  const { videoRef, canvasRef, camera } = useQrScanner({ active: true, onCode })
  return (
    <div className="k-camera k-camera-small">
      <video ref={videoRef} playsInline muted aria-label="Camera view" />
      <canvas ref={canvasRef} hidden />
      {camera.status !== 'ready' && camera.status !== 'starting' && <p className="k-camera-msg" role="alert">{camera.message}</p>}
    </div>
  )
}

function useClock(config) {
  const offset = useRef(0)
  useEffect(() => { offset.current = new Date(config.serverTime).getTime() - Date.now() }, [config.serverTime])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date(Date.now() + offset.current)), 1000)
    return () => clearInterval(id)
  }, [])
  const tz = config.timezone
  return {
    date: new Intl.DateTimeFormat('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now),
    time: new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now),
  }
}

function Scanner({ config, onConfig, onLost }) {
  const [online, setOnline] = useState(navigator.onLine)
  // screen: scan | submitting | result | pin
  const [screen, setScreen] = useState('scan')
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(null)
  const [choice, setChoice] = useState(null)
  const [menu, setMenu] = useState(false)
  const [dimmed, setDimmed] = useState(false)
  const lastCode = useRef({ text: '', at: 0 })
  const lastActivity = useRef(Date.now())
  const tapCount = useRef({ n: 0, at: 0 })
  const manual = config.attendance.mode === 'MANUAL'
  const clock = useClock(config)

  const wake = () => { lastActivity.current = Date.now(); setDimmed(false) }

  // Heartbeat: picks up setting changes, and a deactivated kiosk stops within a minute even if nobody scans.
  useEffect(() => {
    const beat = () => getStatus().then((c) => { setOnline(true); onConfig(c) }, (err) => {
      if (err.code === 'NETWORK') setOnline(false)
      else if (err.status === 401 || err.status === 403 || err.status === 404) onLost(err.code === 'DEVICE_UNAUTHORIZED' ? '' : err.message)
    })
    const id = setInterval(beat, HEARTBEAT_MS)
    const up = () => { setOnline(true); beat() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { clearInterval(id); window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [onConfig, onLost])

  const finish = useCallback((next) => {
    // Nothing about the last person stays on screen or in memory after this.
    setResult(next)
    setPending(null)
    setChoice(null)
    setScreen('result')
    wake()
  }, [])

  const send = useCallback(async (token, extra = {}) => {
    setScreen('submitting')
    wake()
    try {
      finish({ ok: true, ...(await submitScan(token, extra)) })
    } catch (err) {
      if (err.code === 'NETWORK') setOnline(false)
      if (err.code === 'DEVICE_UNAUTHORIZED') return onLost('')
      if (err.code === 'PIN_REQUIRED' || (err.code === 'PIN_INVALID' && extra.pin)) {
        setPending({ token, action: extra.action, error: err.code === 'PIN_INVALID' ? err.message : '' })
        setScreen('pin')
        return undefined
      }
      finish({ ok: false, code: err.code, message: err.message })
    }
    return undefined
  }, [finish, onLost])

  const onCode = useCallback((text) => {
    const now = Date.now()
    if (text === lastCode.current.text && now - lastCode.current.at < SAME_CODE_IGNORE_MS) return
    lastCode.current = { text, at: now }
    send(text, choice ? { action: choice } : {})
  }, [send, choice])

  const scannerActive = online && screen === 'scan' && (!manual || !!choice)
  const { videoRef, canvasRef, camera, cameras, deviceId, setDeviceId, retry } = useQrScanner({ active: scannerActive, facing: config.ui.cameraFacing, onCode })

  // Clear the result on a timer and go back to scanning.
  useEffect(() => {
    if (screen !== 'result') return undefined
    const id = setTimeout(() => { setResult(null); setScreen('scan'); lastCode.current = result?.code === 'NETWORK' ? { text: '', at: 0 } : { text: lastCode.current.text, at: Date.now() } }, (result?.ok ? config.ui.successSeconds : config.ui.errorSeconds) * 1000)
    return () => clearTimeout(id)
  }, [screen, result, config.ui.successSeconds, config.ui.errorSeconds])

  useEffect(() => {
    if (!choice) return undefined
    const id = setTimeout(() => setChoice(null), CHOICE_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [choice])

  useEffect(() => {
    if (screen !== 'pin') return undefined
    const id = setTimeout(() => { setPending(null); setScreen('scan') }, PIN_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [screen])

  // Dim the screen when nobody has used the kiosk for a while; the camera keeps watching.
  useEffect(() => {
    const seconds = config.ui.screenDimSeconds
    if (!seconds) return undefined
    const id = setInterval(() => { if (Date.now() - lastActivity.current > seconds * 1000) setDimmed(true) }, 5000)
    return () => clearInterval(id)
  }, [config.ui.screenDimSeconds])

  const goFullScreen = () => {
    wake()
    if (config.ui.fullScreen && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {})
  }

  // Five quick taps on the device name open the device menu, out of the way of passers-by.
  const secretTap = () => {
    const now = Date.now()
    tapCount.current = now - tapCount.current.at < 1500 ? { n: tapCount.current.n + 1, at: now } : { n: 1, at: now }
    if (tapCount.current.n >= 5) { tapCount.current = { n: 0, at: 0 }; setMenu(true) }
  }

  const blocked = camera.status === 'denied' || camera.status === 'unavailable' || camera.status === 'unsupported'

  return (
    <div className={`k-app${dimmed ? ' k-dim' : ''}`} onPointerDown={goFullScreen}>
      <header className="k-head">
        <div>
          <p className="k-inst">{config.institution}</p>
          <h1>{config.madrasa}</h1>
          {(config.device.branch || config.device.location) && <p className="k-branch">{[config.device.branch, config.device.location].filter(Boolean).join(' · ')}</p>}
        </div>
        <div className="k-clock"><p className="k-time">{clock.time}</p><p>{clock.date}</p></div>
      </header>

      <div className="k-chips">
        <span className={`k-chip ${online ? 'k-good' : 'k-bad'}`}>{online ? 'Internet connected' : 'No internet'}</span>
        <span className={`k-chip ${camera.status === 'ready' ? 'k-good' : 'k-bad'}`}>{camera.status === 'ready' ? 'Camera on' : camera.status === 'starting' ? 'Starting camera' : 'Camera problem'}</span>
        <button type="button" className="k-chip k-device" onClick={secretTap}>{config.device.name}</button>
      </div>

      {!online && <p className="k-alert k-offline" role="alert">No internet connection. Attendance is not being recorded. Please try again when the connection returns, or see the office.</p>}

      <div className="k-camera">
        <video ref={videoRef} playsInline muted aria-label="Camera view" />
        <canvas ref={canvasRef} hidden />
        {camera.status === 'ready' && <div className="k-frame" aria-hidden="true" />}
        {camera.status !== 'ready' && camera.status !== 'starting' && (
          <div className="k-camera-msg" role="alert">
            <p>{camera.message}</p>
            {blocked && <button type="button" className="k-btn" onClick={retry}>Try again</button>}
          </div>
        )}
      </div>

      {manual && screen === 'scan' && (
        <div className="k-choice" role="group" aria-label="Choose check in or check out">
          <button type="button" className={`k-btn${choice === 'CHECK_IN' ? ' k-on' : ' k-btn-quiet'}`} aria-pressed={choice === 'CHECK_IN'} onClick={() => setChoice('CHECK_IN')}>Check In</button>
          <button type="button" className={`k-btn${choice === 'CHECK_OUT' ? ' k-on' : ' k-btn-quiet'}`} aria-pressed={choice === 'CHECK_OUT'} onClick={() => setChoice('CHECK_OUT')}>Check Out</button>
        </div>
      )}
      <p className="k-instructions">{manual && !choice ? 'Tap Check In or Check Out, then show your QR code.' : config.ui.instructions}</p>

      {screen === 'submitting' && <div className="k-overlay"><p className="k-big">Checking…</p></div>}
      {screen === 'result' && result && <Result result={result} />}
      {screen === 'pin' && pending && <PinPad error={pending.error} onCancel={() => { setPending(null); setScreen('scan') }} onSubmit={(pin) => send(pending.token, { action: pending.action, pin })} />}
      {menu && <DeviceMenu cameras={cameras} deviceId={deviceId} setDeviceId={setDeviceId} onClose={() => setMenu(false)} onReset={async () => { await resetDevice().catch(() => {}); onLost('This kiosk was reset. Enter a new registration code from the office.') }} />}
    </div>
  )
}

function Result({ result }) {
  if (!result.ok) {
    return (
      <div className="k-overlay k-error" role="alert">
        <p className="k-mark" aria-hidden="true">!</p>
        <p className="k-big">Not recorded</p>
        <p className="k-reason">{result.message}</p>
      </div>
    )
  }
  
  const checkingIn = result.action === 'CHECK_IN'
  return (
    <div className="k-overlay k-success" role="status">
      <p className="k-mark" aria-hidden="true">✓</p>
      <p className="k-big">Attendance marked successfully</p>
      <p className="k-welcome">{checkingIn ? 'Welcome' : 'Goodbye'}</p>
      <dl className="k-facts">
        <div><dt>Name</dt><dd>{result.staff.name}</dd></div>
        <div><dt>Employee ID</dt><dd>{result.staff.employeeId}</dd></div>
        <div><dt>Designation</dt><dd>{result.staff.designation}</dd></div>
        <div><dt>{ACTION_TEXT[result.action]}</dt><dd>{result.time}</dd></div>
        <div><dt>Status</dt><dd>{STATUS_TEXT[result.status]}{result.status === 'LATE' ? ` (${result.lateMinutes} min)` : result.status === 'EARLY_DEPARTURE' ? ` (${result.earlyMinutes} min)` : ''}</dd></div>
        {result.workedMinutes != null && <div><dt>Worked</dt><dd>{fmtDuration(result.workedMinutes)}</dd></div>}
      </dl>
    </div>
  )
}

function PinPad({ error, onSubmit, onCancel }) {
  const [pin, setPin] = useState('')
  const press = (d) => setPin((p) => (p.length < 6 ? p + d : p))
  return (
    <div className="k-overlay k-pin">
      <p className="k-big">Enter your attendance PIN</p>
      {error && <p className="k-alert" role="alert">{error}</p>}
      <p className="k-dots" aria-label={`${pin.length} digits entered`}>{'•'.repeat(pin.length) || ' '}</p>
      <div className="k-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button type="button" key={d} onClick={() => press(d)}>{d}</button>)}
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete the last digit">⌫</button>
        <button type="button" onClick={() => press('0')}>0</button>
        <button type="button" className="k-ok" disabled={pin.length < 4} onClick={() => onSubmit(pin)}>OK</button>
      </div>
      <button type="button" className="k-btn k-btn-quiet" onClick={onCancel}>Cancel</button>
    </div>
  )
}

function DeviceMenu({ cameras, deviceId, setDeviceId, onClose, onReset }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="k-overlay k-menu">
      <p className="k-big">Device</p>
      {cameras.length > 1 && (
        <div className="k-field">
          <label htmlFor="k-cam">Camera</label>
          <select id="k-cam" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Automatic</option>
            {cameras.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      )}
      {confirming ? (
        <>
          <p>This signs the kiosk out. It stops working until someone from the office enters a new registration code.</p>
          <button type="button" className="k-btn k-danger" onClick={onReset}>Reset this kiosk</button>
        </>
      ) : <button type="button" className="k-btn k-btn-quiet" onClick={() => setConfirming(true)}>Reset this kiosk…</button>}
      <button type="button" className="k-btn" onClick={onClose}>Close</button>
    </div>
  )
}
