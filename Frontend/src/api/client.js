// The only place the frontend talks to the backend. Components call these
// helpers (or the hooks built on them) instead of using fetch directly.
// Same-origin /api/v1 by default (the session cookie and CSRF checks expect it). Set
// VITE_API_BASE_URL only when the API is served elsewhere; it holds no secrets.
export const BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
const CREDENTIALS = /^https?:\/\//.test(BASE) ? 'include' : 'same-origin'

/** Absolute URL of an API path, for links such as file downloads. */
export const apiUrl = (path) => BASE + path

let csrfToken = ''
export const setCsrfToken = (token) => { csrfToken = token || '' }

// The madrasa the app is working in (CR-01). Only a choice: the server checks it against
// the account's memberships on every request. Remembered per browser for convenience.
const MADRASA_KEY = 'mms.madrasa'
let madrasaId = (() => { try { return localStorage.getItem(MADRASA_KEY) || '' } catch { return '' } })()
export const currentMadrasaId = () => madrasaId
export function setMadrasaId(id) {
  madrasaId = id || ''
  try { if (madrasaId) localStorage.setItem(MADRASA_KEY, madrasaId); else localStorage.removeItem(MADRASA_KEY) } catch { /* private mode: keep it in memory */ }
}
const madrasaHeader = () => (madrasaId ? { 'X-Madrasa-Id': madrasaId } : {})

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
  /** Field errors from a 422 response, keyed by field path. */
  get fieldErrors() {
    if (this.code !== 'VALIDATION_FAILED' || !Array.isArray(this.details)) return {}
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]))
  }
}

const listeners = new Set()
/** Subscribe to "the server says this session is gone" (401 on an authenticated call). */
export const onSessionLost = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json', ...madrasaHeader() }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: CREDENTIALS, signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.')
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error || {}
    const error = new ApiError(res.status, e.code || 'HTTP_' + res.status, e.message || 'Something went wrong. Please try again.', e.details)
    // A mistyped password when confirming an action is not a lost session: the person stays signed in.
    if (res.status === 401 && error.code !== 'REAUTH_FAILED' && !path.startsWith('/auth/login') && !path.startsWith('/auth/session')) listeners.forEach((fn) => fn(error))
    throw error
  }
  const token = data?.csrfToken ?? data?.session?.csrfToken
  if (token) setCsrfToken(token)
  return data
}

export const get = (path, opts) => api(path, { ...opts, method: 'GET' })
export const post = (path, body) => api(path, { method: 'POST', body })
export const put = (path, body) => api(path, { method: 'PUT', body })
export const patch = (path, body) => api(path, { method: 'PATCH', body })
export const del = (path) => api(path, { method: 'DELETE' })

/** Send a file's raw bytes (the server checks its type by content). Returns the JSON reply. */
export async function upload(path, file, { method = 'PUT', type = file.type, name = file.name } = {}) {
  let res
  try {
    res = await fetch(BASE + path, { method, body: file, credentials: CREDENTIALS, headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name), 'X-CSRF-Token': csrfToken, ...madrasaHeader() } })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error?.code || 'HTTP_' + res.status, data?.error?.message || 'The upload failed.', data?.error?.details)
  return data
}

/** Read a one-time token from the URL and remove it so it is not kept in history or shared by accident. */
// Remembered for the page it came from, so a second call (React StrictMode runs state
// initialisers twice; a page can remount) still gets it after it left the address bar.
let takenToken = null
export function takeUrlToken() {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('token')
  if (token) {
    takenToken = { path: url.pathname, token }
    url.searchParams.delete('token')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    return token
  }
  return takenToken?.path === url.pathname ? takenToken.token : null
}

/** Fetch a private file (QR image, proof of payment) and return an object URL for <img> or a new tab. */
export async function blobUrl(path) {
  const res = await fetch(BASE + path, { credentials: CREDENTIALS, headers: madrasaHeader() })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error?.code || 'HTTP_' + res.status, data?.error?.message || 'Could not load the file.')
  }
  return URL.createObjectURL(await res.blob())
}
