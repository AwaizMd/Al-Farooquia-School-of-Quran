// The only place the frontend talks to the backend. Components call these
// helpers (or the hooks built on them) instead of using fetch directly.
const BASE = '/api/v1'

let csrfToken = ''
export const setCsrfToken = (token) => { csrfToken = token || '' }

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
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.')
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error || {}
    const error = new ApiError(res.status, e.code || 'HTTP_' + res.status, e.message || 'Something went wrong. Please try again.', e.details)
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/session')) listeners.forEach((fn) => fn(error))
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

/** Read a one-time token from the URL and remove it so it is not kept in history or shared by accident. */
export function takeUrlToken() {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('token')
  if (token) {
    url.searchParams.delete('token')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
  return token
}
