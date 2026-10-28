import { prisma } from '../database/prisma.js'

const DEFAULT_TZ = 'Asia/Kolkata'
let cached: { tz: string; at: number } | null = null

/** The institution's timezone (settings row), cached briefly. */
export async function institutionTimezone() {
  if (cached && Date.now() - cached.at < 60_000) return cached.tz
  const s = await prisma.institutionSettings.findUnique({ where: { id: 1 }, select: { timezone: true } })
  cached = { tz: s?.timezone ?? DEFAULT_TZ, at: Date.now() }
  return cached.tz
}

/** YYYY-MM-DD of `now` in the given timezone. */
export const dateIn = (tz: string, now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/** "Today" for the Madarsa, not for the server or the browser. */
export async function institutionToday() {
  return dateIn(await institutionTimezone())
}

export const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
