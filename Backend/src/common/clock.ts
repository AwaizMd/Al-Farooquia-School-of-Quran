import { tenant } from '../tenancy/context.js'
import { madrasaProfile } from '../tenancy/settings.js'

const DEFAULT_TZ = 'Asia/Kolkata'

/**
 * The timezone of a madrasa (CR-01: each madrasa has its own settings). Without one
 * given, the active madrasa's, else the first madrasa the caller reads from.
 */
export async function institutionTimezone(madrasaId?: string) {
  const t = tenant()
  const id = madrasaId ?? t?.active ?? t?.ids[0]
  if (!id) return DEFAULT_TZ
  return (await madrasaProfile(id)).timezone
}

/** YYYY-MM-DD of `now` in the given timezone. */
export const dateIn = (tz: string, now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/** "Today" for the madrasa, not for the server or the browser. */
export async function institutionToday(madrasaId?: string) {
  return dateIn(await institutionTimezone(madrasaId))
}

export const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
