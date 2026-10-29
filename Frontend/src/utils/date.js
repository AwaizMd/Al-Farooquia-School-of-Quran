const pad = (n) => String(n).padStart(2, '0')

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromISO = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const todayISO = () => toISO(new Date())
export const addDays = (iso, n) => {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export const diffDays = (a, b) => Math.round((fromISO(a) - fromISO(b)) / 86400000)
export const weekday = (iso) => fromISO(iso).getDay()
export const monthKey = (iso) => iso.slice(0, 7)
export const addMonths = (key, n) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

// Locale and translator are set by the I18n provider so dates follow the chosen language.
let LOCALE = 'en-GB'
let tr = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k]) : s)
export const setDateLocale = (locale, translator) => { LOCALE = locale; tr = translator }
export const dateLocale = () => LOCALE

export const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? fromISO(iso).toLocaleDateString(LOCALE, opts) : '—'
export const fmtShort = (iso) => fmtDate(iso, { day: 'numeric', month: 'short' })
export const fmtDay = (iso) => fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })
export const fmtLong = (iso) => fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const fmtMonth = (key) => fromISO(`${key}-01`).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })
export const fmtMonthShort = (key) => fromISO(`${key}-01`).toLocaleDateString(LOCALE, { month: 'short' })
export const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const relativeDay = (iso, today = todayISO()) => {
  const d = diffDays(iso, today)
  if (d === 0) return tr('Today')
  if (d === -1) return tr('Yesterday')
  if (d === 1) return tr('Tomorrow')
  if (d < 0) return tr('{n} days ago', { n: -d })
  return tr('In {n} days', { n: d })
}

export const ageFrom = (dob, today = todayISO()) => {
  const a = fromISO(dob), t = fromISO(today)
  let age = t.getFullYear() - a.getFullYear()
  if (t.getMonth() < a.getMonth() || (t.getMonth() === a.getMonth() && t.getDate() < a.getDate())) age--
  return age
}
