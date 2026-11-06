import { z } from 'zod'
import { AppError } from '../../common/errors.js'
import { prisma } from '../../database/prisma.js'
import { asOrg } from '../../tenancy/context.js'
import { madrasaProfile } from '../../tenancy/settings.js'

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')
const Window = z.object({ from: Clock, to: Clock }).nullable()

const QrDefaults = { dynamic: true, static: false, refreshSeconds: 60, ttlSeconds: 75 }
const UiDefaults = { instructions: 'Show your attendance QR code to the camera.', successSeconds: 4, errorSeconds: 4, screenDimSeconds: 120, fullScreen: true, cameraFacing: 'environment' as const }

/**
 * What a kiosk does. Each value comes from the first place that sets it: the device,
 * then its madrasa, then the organization's defaults, then the defaults here.
 */
export const KioskSettings = z
  .object({
    /** AUTO: the record decides. MANUAL: staff tap Check In or Check Out. TIME_WINDOW: the clock decides. */
    mode: z.enum(['AUTO', 'MANUAL', 'TIME_WINDOW']).default('AUTO'),
    /** When set, scans outside these local times are refused in every mode. */
    checkInWindow: Window.default(null),
    checkOutWindow: Window.default(null),
    /** Allow several check-in/check-out pairs in one day. */
    multipleSessions: z.boolean().default(false),
    /** A second scan by the same person this soon is treated as a duplicate. */
    duplicateWindowSeconds: z.number().int().min(0).max(3600).default(60),
    /** A check-in with no check-out after this long is recorded as a missed check-out. */
    maxSessionHours: z.number().int().min(1).max(36).default(20),
    pinRequired: z.boolean().default(false),
    /** Dynamic codes only, and a PIN every time. */
    highSecurity: z.boolean().default(false),
    qr: z
      .object({
        dynamic: z.boolean().default(QrDefaults.dynamic),
        static: z.boolean().default(QrDefaults.static),
        refreshSeconds: z.number().int().min(15).max(300).default(QrDefaults.refreshSeconds),
        ttlSeconds: z.number().int().min(15).max(600).default(QrDefaults.ttlSeconds),
      })
      .default(QrDefaults),
    ui: z
      .object({
        instructions: z.string().trim().min(1).max(200).default(UiDefaults.instructions),
        successSeconds: z.number().int().min(1).max(30).default(UiDefaults.successSeconds),
        errorSeconds: z.number().int().min(1).max(30).default(UiDefaults.errorSeconds),
        screenDimSeconds: z.number().int().min(0).max(3600).default(UiDefaults.screenDimSeconds),
        fullScreen: z.boolean().default(UiDefaults.fullScreen),
        cameraFacing: z.enum(['environment', 'user']).default(UiDefaults.cameraFacing),
      })
      .default(UiDefaults),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.qr.ttlSeconds < s.qr.refreshSeconds) ctx.addIssue({ code: 'custom', path: ['qr', 'ttlSeconds'], message: 'A code must stay valid at least as long as it is shown.' })
    if (!s.qr.dynamic && !s.qr.static) ctx.addIssue({ code: 'custom', path: ['qr', 'dynamic'], message: 'Allow dynamic codes, static codes or both.' })
    if (s.highSecurity && !s.qr.dynamic) ctx.addIssue({ code: 'custom', path: ['qr', 'dynamic'], message: 'High-security mode needs dynamic codes.' })
    if (s.mode === 'TIME_WINDOW' && (!s.checkInWindow || !s.checkOutWindow)) ctx.addIssue({ code: 'custom', path: ['checkInWindow'], message: 'Time-based attendance needs a check-in and a check-out time window.' })
  })
export type KioskSettings = z.infer<typeof KioskSettings>

type Layer = Record<string, unknown>
const isObject = (v: unknown): v is Layer => !!v && typeof v === 'object' && !Array.isArray(v)

/** Later layers win; nested groups (qr, ui) merge key by key; a time window is one value. */
export function mergeLayers(...layers: Layer[]): Layer {
  const out: Layer = {}
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) out[k] = (k === 'qr' || k === 'ui') && isObject(v) ? { ...(isObject(out[k]) ? out[k] : {}), ...v } : v
  }
  return out
}

/** Check that a set of overrides produces valid settings, and name the fields that do not. */
export function validated(layer: Layer): KioskSettings {
  const r = KioskSettings.safeParse(layer)
  if (!r.success) throw new AppError(422, 'VALIDATION_FAILED', 'Some kiosk settings are invalid.', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  return r.data
}

export const organizationDefaults = async () => ((await asOrg('organization kiosk defaults', () => prisma.organization.findUnique({ where: { id: 1 }, select: { kioskDefaults: true } })))?.kioskDefaults ?? {}) as Layer

export const madrasaOverrides = async (madrasaId: string) => ((await madrasaProfile(madrasaId)).config.kiosk ?? {}) as Layer

/** The settings in force for a madrasa, and for one of its devices when given. */
export async function effectiveSettings(madrasaId: string, device?: { settings: unknown }): Promise<KioskSettings> {
  const [org, madrasa] = await Promise.all([organizationDefaults(), madrasaOverrides(madrasaId)])
  // An override that no longer combines (say, a window removed elsewhere) must not stop kiosks: fall back without the device layer.
  const full = KioskSettings.safeParse(mergeLayers(org, madrasa, (device?.settings ?? {}) as Layer))
  return full.success ? full.data : validated(mergeLayers(org, madrasa))
}
