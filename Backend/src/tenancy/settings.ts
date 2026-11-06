import { z } from 'zod'
import type { Feature } from '../generated/prisma/enums.js'
import { AppError, notFound } from '../common/errors.js'
import { prisma } from '../database/prisma.js'
import { activeMadrasaId, asOrg } from './context.js'

/**
 * Per-madrasa configuration kept in madrasa_settings.config (CR-01 §1). Every key
 * has a default, so a madrasa works before anything is configured, and unknown
 * keys are rejected so typos cannot silently change behaviour.
 */
export const MadrasaConfig = z
  .object({
    mushafType: z.enum(['15_LINE', '13_LINE', '16_LINE']).default('15_LINE'),
    /** Attendance registers per day (e.g. morning and evening). */
    attendanceSessions: z.array(z.string().trim().min(1).max(40)).min(1).max(4).default(['Day']),
    gradingScheme: z.enum(['PERCENT_BANDS']).default('PERCENT_BANDS'),
    academicYear: z.object({ start: z.string().regex(/^\d{2}-\d{2}$/), end: z.string().regex(/^\d{2}-\d{2}$/) }).default({ start: '04-01', end: '03-31' }),
    /** 0 = Sunday … 6 = Saturday. Charts and "this week" summaries start on this day. */
    weekStart: z.number().int().min(0).max(6).default(1),
    lateness: z.object({ graceMinutes: z.number().int().min(0).max(120).default(10) }).default({ graceMinutes: 10 }),
    receipts: z.object({ prefix: z.string().trim().regex(/^[A-Z0-9-]{1,12}$/).default('NR') }).default({ prefix: 'NR' }),
    whatsapp: z.object({ sender: z.string().trim().max(30).nullable().default(null) }).default({ sender: null }),
    branding: z.object({ receiptFooter: z.string().trim().max(300).default(''), reportCardFooter: z.string().trim().max(300).default('') }).default({ receiptFooter: '', reportCardFooter: '' }),
    namaz: z
      .object({
        /** Parents may record today and this many previous days. */
        editWindowDays: z.number().int().min(0).max(14).default(2),
        /** HH:MM local time for the daily reminder during holidays; null = no reminder. */
        nudgeAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
        /** Mentors may also record namaz on madrasa days. */
        mentorRecording: z.boolean().default(false),
      })
      .default({ editWindowDays: 2, nudgeAt: null, mentorRecording: false }),
    /** This madrasa's kiosk setting overrides (checked by src/modules/kiosk/kiosk.settings.ts). */
    kiosk: z.record(z.string(), z.unknown()).default({}),
    /** Committee members may drill down to individual students (default: aggregates only). */
    committeeCanViewStudents: z.boolean().default(false),
  })
  .strict()
export type MadrasaConfig = z.infer<typeof MadrasaConfig>

export const FEATURES: readonly Feature[] = ['HOSTEL', 'FEES', 'ACCOUNTS', 'NAMAZ_TRACKING', 'STAFF_ATTENDANCE', 'ASSESSMENTS', 'SCHEDULED_REPORTS', 'BIOMETRIC']
/** A madrasa with no row for a feature gets this. */
export const FEATURE_DEFAULTS: Record<Feature, boolean> = {
  HOSTEL: true, FEES: true, ACCOUNTS: false, NAMAZ_TRACKING: false, STAFF_ATTENDANCE: false, ASSESSMENTS: true, SCHEDULED_REPORTS: true, BIOMETRIC: false,
}

export interface MadrasaProfile {
  id: string
  code: string
  name: string
  shortName: string
  currency: string
  timezone: string
  weeklyOff: number
  feeDueDay: number
  config: MadrasaConfig
  features: Record<Feature, boolean>
}

const cache = new Map<string, { at: number; value: MadrasaProfile }>()
const TTL_MS = 30_000
export const forgetMadrasa = (id: string) => cache.delete(id)

/** Settings, config and feature flags of one madrasa (briefly cached). */
export async function madrasaProfile(id: string = activeMadrasaId()): Promise<MadrasaProfile> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const m = await asOrg('load madrasa settings by id', () => prisma.madrasa.findUnique({ where: { id }, include: { settings: true, features: true } }))
  if (!m) throw notFound()
  const features = { ...FEATURE_DEFAULTS }
  for (const f of m.features) features[f.feature] = f.enabled
  const value: MadrasaProfile = {
    id: m.id, code: m.code, name: m.name, shortName: m.shortName,
    currency: m.settings?.currency ?? 'INR', timezone: m.settings?.timezone ?? 'Asia/Kolkata', weeklyOff: m.settings?.weeklyOff ?? 5, feeDueDay: m.settings?.feeDueDay ?? 10,
    config: MadrasaConfig.parse(m.settings?.config ?? {}), features,
  }
  cache.set(id, { at: Date.now(), value })
  return value
}

export async function assertFeature(feature: Feature, id: string = activeMadrasaId()) {
  if (!(await madrasaProfile(id)).features[feature]) throw new AppError(404, 'FEATURE_DISABLED', 'This module is not enabled for this madrasa.')
}
