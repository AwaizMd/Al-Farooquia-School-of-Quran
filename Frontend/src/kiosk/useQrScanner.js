import { useCallback, useEffect, useRef, useState } from 'react'

// Camera + QR decoding, tuned for old phones: a low camera resolution and a few
// decodes per second. Decoding only reads the code: the server decides what it means.
const SCAN_EVERY_MS = 220
const RETRY_CAMERA_MS = 3000
const CAMERA_KEY = 'mms.kiosk.camera'

const remembered = () => { try { return localStorage.getItem(CAMERA_KEY) || '' } catch { return '' } }
const remember = (id) => { try { if (id) localStorage.setItem(CAMERA_KEY, id); else localStorage.removeItem(CAMERA_KEY) } catch { /* private mode: not remembered */ } }

/** The phone's built-in detector when it has one, otherwise jsQR (loaded only then). */
async function makeDecoder(canvas) {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats()
      if (formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
      }
    } catch { /* fall through to jsQR */ }
  }
  const { default: jsQR } = await import('jsqr')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return async (video) => {
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight))
    const w = Math.round(video.videoWidth * scale)
    const h = Math.round(video.videoHeight * scale)
    if (!w || !h) return null
    canvas.width = w
    canvas.height = h
    ctx.drawImage(video, 0, 0, w, h)
    return jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}

const describeError = (err) => {
  if (!navigator.mediaDevices?.getUserMedia) return { status: 'unsupported', message: 'This browser cannot use the camera. Open the kiosk in Chrome over a secure (https) address.' }
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return { status: 'denied', message: 'Camera permission is blocked. Allow the camera for this site in the browser settings, then reopen the kiosk.' }
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return { status: 'unavailable', message: 'No camera was found on this device.' }
  return { status: 'interrupted', message: 'The camera is not available right now. Trying again…' }
}

export function useQrScanner({ active, facing = 'environment', onCode }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [camera, setCamera] = useState({ status: 'starting', message: '' })
  const [cameras, setCameras] = useState([])
  const [deviceId, setDeviceIdState] = useState(remembered)
  const [attempt, setAttempt] = useState(0)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const activeRef = useRef(active)
  activeRef.current = active

  const setDeviceId = useCallback((id) => { remember(id); setDeviceIdState(id) }, [])

  useEffect(() => {
    let stopped = false
    let stream = null
    let timer = null
    let lock = null

    const retryLater = () => { if (!stopped) timer = setTimeout(() => setAttempt((n) => n + 1), RETRY_CAMERA_MS) }
    const keepAwake = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen') } catch { /* not supported or refused: the screen may dim */ } }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      keepAwake()
      // Android can take the camera away while the app is in the background.
      if (!stream || stream.getVideoTracks().some((t) => t.readyState === 'ended')) setAttempt((n) => n + 1)
    }

    async function start() {
      setCamera({ status: 'starting', message: '' })
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
        const video = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...video, width: { ideal: 640 }, height: { ideal: 480 } } }).catch((err) => {
          // A remembered camera may be gone: fall back to any camera before giving up.
          if (deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) { setDeviceId(''); return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing } } }) }
          throw err
        })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        for (const t of stream.getVideoTracks()) t.addEventListener('ended', () => { if (!stopped) setAttempt((n) => n + 1) })
        const el = videoRef.current
        el.srcObject = stream
        await el.play().catch(() => {})
        navigator.mediaDevices.enumerateDevices?.().then((all) => setCameras(all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })))).catch(() => {})
        setCamera({ status: 'ready', message: '' })
        keepAwake()
        const decode = await makeDecoder(canvasRef.current)
        const loop = async () => {
          if (stopped) return
          if (activeRef.current && el.readyState >= 2) {
            try {
              const text = await decode(el)
              if (text && activeRef.current && !stopped) onCodeRef.current(text)
            } catch { /* one bad frame is not an error */ }
          }
          timer = setTimeout(loop, SCAN_EVERY_MS)
        }
        loop()
      } catch (err) {
        const d = describeError(err)
        setCamera(d)
        if (d.status === 'interrupted') retryLater()
      }
    }

    start()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      stream?.getTracks().forEach((t) => t.stop())
      lock?.release?.().catch(() => {})
    }
  }, [facing, deviceId, attempt, setDeviceId])

  return { videoRef, canvasRef, camera, cameras, deviceId, setDeviceId, retry: () => setAttempt((n) => n + 1) }
}
