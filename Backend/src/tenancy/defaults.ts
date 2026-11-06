import type { Prisma } from '../generated/prisma/client.js'
import type { Tx } from '../database/prisma.js'
import { FEATURE_DEFAULTS, FEATURES, MadrasaConfig } from './settings.js'
import { withMadrasa } from './context.js'

export const DEFAULT_GRADE_BANDS = [
  { grade: 'Mumtaz', arabic: 'ممتاز', minPercent: 85, meaning: 'Excellent' },
  { grade: 'Jayyid Jiddan', arabic: 'جيد جدا', minPercent: 70, meaning: 'Very good' },
  { grade: 'Jayyid', arabic: 'جيد', minPercent: 55, meaning: 'Good' },
  { grade: 'Maqbool', arabic: 'مقبول', minPercent: 40, meaning: 'Pass' },
  { grade: 'Rasib', arabic: 'راسب', minPercent: 0, meaning: 'Re-test needed' },
]
export const DEFAULT_REMINDER_RULES = [
  { key: 'before', label: 'Before the due date', offsetDays: -3, position: 1 },
  { key: 'on', label: 'On the due date', offsetDays: 0, position: 2 },
  { key: 'after3', label: '3 days after the due date', offsetDays: 3, position: 3 },
  { key: 'after7', label: '7 days after the due date', offsetDays: 7, position: 4 },
]
export const DEFAULT_FEE_REMINDER = {
  key: 'fee_reminder',
  subject: 'Fee reminder for {student}',
  body: 'Assalamu Alaikum {guardian}. This is a gentle reminder from {madarsa} that the {period} fee for {student} is due on {dueDate}. Outstanding balance: {balance}. JazakAllahu khairan.',
}

export interface MadrasaBasics {
  currency: string
  timezone: string
  weeklyOff: number
  feeDueDay: number
  config?: Prisma.InputJsonValue
  features?: Partial<Record<(typeof FEATURES)[number], boolean>>
}

/**
 * Everything a new madrasa needs before its first use: settings, feature flags,
 * a grading scale, fee reminder rules and message, and the report schedule.
 * Runs inside the caller's transaction (and the new madrasa's context).
 */
export async function createMadrasaDefaults(tx: Tx, madrasaId: string, basics: MadrasaBasics) {
  const config = MadrasaConfig.parse(basics.config ?? {})
  await tx.madrasaSettings.create({ data: { madrasaId, currency: basics.currency, timezone: basics.timezone, weeklyOff: basics.weeklyOff, feeDueDay: basics.feeDueDay, config: config as unknown as Prisma.InputJsonValue } })
  await tx.madrasaFeature.createMany({ data: FEATURES.map((feature) => ({ madrasaId, feature, enabled: basics.features?.[feature] ?? FEATURE_DEFAULTS[feature] })) })
  await withMadrasa(madrasaId, async () => {
    await tx.gradingScale.create({ data: { version: 1, active: true, bands: { create: DEFAULT_GRADE_BANDS } } })
    await tx.reminderRule.createMany({ data: DEFAULT_REMINDER_RULES.map((r) => ({ ...r, enabled: true, channels: ['EMAIL', 'IN_APP'] })) })
    await tx.messageTemplate.create({ data: DEFAULT_FEE_REMINDER })
    await tx.scheduledReportConfig.create({ data: {} })
  })
}
