import type { Request } from 'express'
import QRCode from 'qrcode'
import type { KioskDevice, Prisma } from '../../generated/prisma/client.js'
import { conflict, notFound } from '../../common/errors.js'
import { addDaysIso, institutionToday, institutionTimezone } from '../../common/clock.js'
import { env } from '../../config/env.js'
import { prisma } from '../../database/prisma.js'
import { activeMadrasaId, asOrg } from '../../tenancy/context.js'
import { forgetMadrasa, madrasaProfile } from '../../tenancy/settings.js'
import { audit } from '../audit-logs/audit.service.js'
import { effectiveSettings, madrasaOverrides, mergeLayers, organizationDefaults, validated } from './kiosk.settings.js'
import { newRegistrationCode } from './device.service.js'

/** A kiosk is shown as online if it checked in within this long (it does so every minute). */
const ONLINE_WINDOW_MS = 3 * 60_000
const DUPLICATE_OUTCOMES = ['QR_ALREADY_USED', 'ALREADY_RECORDED', 'ALREADY_CHECKED_IN']

export function kioskView(k: KioskDevice) {
  const online = k.status === 'ACTIVE' && !!k.lastSeenAt && Date.now() - k.lastSeenAt.getTime() < ONLINE_WINDOW_MS
  return {
    id: k.id, name: k.name, branch: k.branch, location: k.location, status: k.status, online, allowedIps: k.allowedIps, settings: k.settings,
    lastSeenAt: k.lastSeenAt, lastScanAt: k.lastScanAt, userAgent: k.userAgent, createdAt: k.createdAt,
    registrationPending: !!k.registrationExpiresAt && k.registrationExpiresAt > new Date(), registrationExpiresAt: k.registrationExpiresAt,
  }
}

/** The one-time code, shown once, as text and as a QR the kiosk can scan. */
async function codeForDisplay(code: string, expiresAt: Date) {
  const url = `${env.APP_BASE_URL.replace(/\/$/, '')}/kiosk.html?code=${encodeURIComponent(code)}`
  return { registrationCode: code, registrationExpiresAt: expiresAt, registrationQr: await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 }) }
}

export interface KioskInput { name: string; branch?: string | null | undefined; location?: string | null | undefined; allowedIps?: string[] | undefined; settings?: Record<string, unknown> | undefined }

const assertOverrides = async (madrasaId: string, overrides: Record<string, unknown>) => validated(mergeLayers(await organizationDefaults(), await madrasaOverrides(madrasaId), overrides))

export async function createKiosk(req: Request, input: KioskInput) {
  const madrasaId = activeMadrasaId()
  if (input.settings) await assertOverrides(madrasaId, input.settings)
  const { code, hash, expiresAt } = newRegistrationCode()
  const k = await prisma.kioskDevice.create({
    data: { name: input.name, branch: input.branch ?? null, location: input.location ?? null, allowedIps: input.allowedIps ?? [], settings: (input.settings ?? {}) as Prisma.InputJsonValue, createdById: req.auth!.user.id, registrationCodeHash: hash, registrationExpiresAt: expiresAt },
  })
  await audit({ action: 'kiosk.created', summary: `Kiosk "${k.name}" created`, entityType: 'kiosk', entityId: k.id }, req)
  return { kiosk: kioskView(k), ...(await codeForDisplay(code, expiresAt)) }
}

const load = async (id: string) => {
  const k = await prisma.kioskDevice.findUnique({ where: { id } })
  if (!k) throw notFound()
  return k
}

export async function updateKiosk(req: Request, id: string, patch: Partial<KioskInput>) {
  const k = await load(id)
  if (patch.settings) await assertOverrides(k.madrasaId, patch.settings)
  const data: Prisma.KioskDeviceUpdateInput = {}
  if (patch.name !== undefined) data.name = patch.name
  if (patch.branch !== undefined) data.branch = patch.branch
  if (patch.location !== undefined) data.location = patch.location
  if (patch.allowedIps !== undefined) data.allowedIps = patch.allowedIps
  if (patch.settings !== undefined) data.settings = patch.settings as Prisma.InputJsonValue
  const u = await prisma.kioskDevice.update({ where: { id }, data })
  await audit({ action: 'kiosk.updated', summary: `Kiosk "${u.name}" changed: ${Object.keys(patch).join(', ')}`, entityType: 'kiosk', entityId: id }, req)
  return kioskView(u)
}

/** A fresh code for a new, replaced or reset device. Any previous credential stops working at once. */
export async function newCode(req: Request, id: string) {
  const k = await load(id)
  const { code, hash, expiresAt } = newRegistrationCode()
  const u = await prisma.kioskDevice.update({ where: { id }, data: { status: 'PENDING', tokenHash: null, previousTokenHash: null, previousTokenUntil: null, credentialIssuedAt: null, registrationCodeHash: hash, registrationExpiresAt: expiresAt } })
  await audit({ action: 'kiosk.code_issued', summary: `New registration code for kiosk "${k.name}"; any device using it was signed out`, entityType: 'kiosk', entityId: id }, req)
  return { kiosk: kioskView(u), ...(await codeForDisplay(code, expiresAt)) }
}

export async function setActive(req: Request, id: string, active: boolean) {
  const k = await load(id)
  if (active && k.status !== 'DISABLED') throw conflict('KIOSK_NOT_DISABLED', 'Only a deactivated kiosk can be activated. Otherwise issue a new registration code.')
  if (!active && k.status !== 'ACTIVE') throw conflict('KIOSK_NOT_ACTIVE', 'This kiosk is not active.')
  const u = await prisma.kioskDevice.update({ where: { id }, data: { status: active ? 'ACTIVE' : 'DISABLED' } })
  await audit({ action: active ? 'kiosk.activated' : 'kiosk.deactivated', summary: `Kiosk "${k.name}" ${active ? 'activated' : 'deactivated'}`, entityType: 'kiosk', entityId: id }, req)
  return kioskView(u)
}

export async function revoke(req: Request, id: string) {
  const k = await load(id)
  const u = await prisma.kioskDevice.update({ where: { id }, data: { status: 'REVOKED', tokenHash: null, previousTokenHash: null, previousTokenUntil: null, credentialIssuedAt: null, registrationCodeHash: null, registrationExpiresAt: null } })
  await audit({ action: 'kiosk.revoked', summary: `Kiosk "${k.name}" revoked; its device was signed out`, entityType: 'kiosk', entityId: id }, req)
  return kioskView(u)
}

// ---------- Monitoring ----------

/** Start of a local date as an instant, in the madrasa's timezone. */
function localDayStart(iso: string, tz: string) {
  const guess = new Date(`${iso}T00:00:00.000Z`)
  const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (asLocal.getTime() - asUtc.getTime()))
}

export async function dashboard(q: { from?: string | undefined; to?: string | undefined; branch?: string | undefined; kioskId?: string | undefined }) {
  const today = await institutionToday()
  const tz = await institutionTimezone()
  const from = q.from ?? today
  const to = q.to ?? today
  const range = { gte: localDayStart(from, tz), lt: localDayStart(addDaysIso(to, 1), tz) }
  const kiosks = await prisma.kioskDevice.findMany({ where: { ...(q.branch ? { branch: q.branch } : {}), ...(q.kioskId ? { id: q.kioskId } : {}) }, orderBy: { name: 'asc' } })
  const grouped = await prisma.kioskScan.groupBy({ by: ['kioskId', 'ok', 'outcome'], where: { at: range, kioskId: { in: kiosks.map((k) => k.id) } }, _count: true })
  const count = (id: string | null, pick: (g: (typeof grouped)[number]) => boolean) => grouped.filter((g) => (id === null || g.kioskId === id) && pick(g)).reduce((a, g) => a + g._count, 0)
  const views = kiosks.map(kioskView)
  const all = await prisma.kioskDevice.findMany({ select: { branch: true } })
  return {
    from, to,
    branches: [...new Set(all.map((k) => k.branch).filter((b): b is string => !!b))].sort(),
    totals: {
      registered: views.filter((k) => k.status === 'ACTIVE' || k.status === 'DISABLED').length,
      active: views.filter((k) => k.online).length,
      offline: views.filter((k) => k.status === 'ACTIVE' && !k.online).length,
      deactivated: views.filter((k) => k.status === 'DISABLED' || k.status === 'REVOKED').length,
      scans: count(null, () => true),
      successful: count(null, (g) => g.ok),
      failed: count(null, (g) => !g.ok),
      duplicates: count(null, (g) => DUPLICATE_OUTCOMES.includes(g.outcome)),
      lastSyncAt: kiosks.reduce<Date | null>((a, k) => (k.lastScanAt && (!a || k.lastScanAt > a) ? k.lastScanAt : a), null),
    },
    items: views.map((k) => ({ ...k, scans: count(k.id, () => true), successful: count(k.id, (g) => g.ok), failed: count(k.id, (g) => !g.ok), duplicates: count(k.id, (g) => DUPLICATE_OUTCOMES.includes(g.outcome)) })),
  }
}

export async function scansOf(id: string, q: { from?: string | undefined; to?: string | undefined; outcome?: string | undefined; page: number; pageSize: number }) {
  await load(id)
  const tz = await institutionTimezone()
  const today = await institutionToday()
  const where: Prisma.KioskScanWhereInput = { kioskId: id, at: { gte: localDayStart(q.from ?? addDaysIso(today, -6), tz), lt: localDayStart(addDaysIso(q.to ?? today, 1), tz) }, ...(q.outcome ? { outcome: q.outcome } : {}) }
  const [total, rows] = await Promise.all([prisma.kioskScan.count({ where }), prisma.kioskScan.findMany({ where, orderBy: { at: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize })])
  const staff = new Map((await prisma.staffProfile.findMany({ where: { id: { in: rows.map((r) => r.staffId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true, code: true } })).map((s) => [s.id, s]))
  return { total, page: q.page, pageSize: q.pageSize, items: rows.map((r) => ({ id: r.id, at: r.at, ok: r.ok, outcome: r.outcome, staff: r.staffId ? staff.get(r.staffId) ?? null : null })) }
}

// ---------- Settings: code defaults → organization → madrasa → device ----------

export async function settingsView() {
  const madrasaId = activeMadrasaId()
  const [organization, madrasa, effective] = await Promise.all([organizationDefaults(), madrasaOverrides(madrasaId), effectiveSettings(madrasaId)])
  return { organization, madrasa, effective }
}

export async function setMadrasaSettings(req: Request, overrides: Record<string, unknown>) {
  const madrasaId = activeMadrasaId()
  validated(mergeLayers(await organizationDefaults(), overrides))
  const profile = await madrasaProfile(madrasaId)
  await asOrg('save one madrasa’s kiosk settings', () => prisma.madrasaSettings.update({ where: { madrasaId }, data: { config: { ...profile.config, kiosk: overrides } as unknown as Prisma.InputJsonValue } }))
  forgetMadrasa(madrasaId)
  await audit({ action: 'kiosk.settings_changed', summary: 'Kiosk settings changed for this madrasa', entityType: 'madrasa', entityId: madrasaId, metadata: { keys: Object.keys(overrides) } }, req)
  return settingsView()
}

export async function setOrganizationDefaults(req: Request, defaults: Record<string, unknown>) {
  validated(defaults)
  await asOrg('save the organization’s kiosk defaults', () => prisma.organization.update({ where: { id: 1 }, data: { kioskDefaults: defaults as Prisma.InputJsonValue } }))
  await audit({ action: 'kiosk.defaults_changed', summary: 'Organization kiosk defaults changed', entityType: 'organization', metadata: { keys: Object.keys(defaults) } }, req)
  return settingsView()
}
