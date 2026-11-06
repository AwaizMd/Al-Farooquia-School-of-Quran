// The kiosk's only link to the server. Its credential is an httpOnly cookie the
// browser sends by itself: nothing secret is ever held in this code or in storage.
const BASE = `${(import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')}/kiosk/device`

export class KioskError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function call(path, body) {
  let res
  try {
    res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new KioskError('NETWORK', 'No internet connection. Attendance cannot be recorded right now.', 0)
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new KioskError(data?.error?.code || `HTTP_${res.status}`, data?.error?.message || 'Something went wrong. Please try again.', res.status)
  return data
}

export const getStatus = () => call('/status')
export const registerDevice = (code) => call('/register', { code })
export const resetDevice = () => call('/reset', {})

const newRequestId = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)))

/**
 * Submit one scan. A dropped connection is retried with the same request id, so the
 * server records it at most once however many attempts arrive. If it still fails the
 * caller is told: a kiosk never reports attendance the server has not confirmed.
 */
export async function submitScan(token, { action, pin } = {}) {
  const requestId = newRequestId()
  const body = { token, requestId, ...(action ? { action } : {}), ...(pin ? { pin } : {}) }
  for (let attempt = 0; ; attempt++) {
    try {
      return await call('/scan', body)
    } catch (err) {
      if (err.code !== 'NETWORK' || attempt >= 2) throw err
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
}
