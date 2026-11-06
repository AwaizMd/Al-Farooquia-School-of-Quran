import type { CookieOptions, Request, RequestHandler, Response } from 'express'
import { randomBytes } from 'node:crypto'
import { AppError, forbidden } from '../../common/errors.js'
import { hashToken, newToken } from '../../common/crypto.js'
import { dateIn } from '../../common/clock.js'
import { LIMITS, clear, consume } from '../../common/rateLimit.js'
import { env } from '../../config/env.js'
import { prisma } from '../../database/prisma.js'
import type { KioskDevice } from '../../generated/prisma/client.js'
import { asOrg, runInTenant } from '../../tenancy/context.js'
import { lockRow } from '../../tenancy/locks.js'
import { assertFeature, madrasaProfile } from '../../tenancy/settings.js'
import { audit } from '../audit-logs/audit.service.js'
import { verifyPassword } from '../auth/password.js'
import { recordEvent, type ScanAction } from '../staff-attendance/attendance.engine.js'
import { effectiveSettings } from './kiosk.settings.js'
import { verifyQr } from './qr-token.js'

// A kiosk is an untrusted device with its own identity. Its credential lives in an
// httpOnly cookie, so scripts cannot read it, and only its hash is stored here. Which
// madrasa it serves is always read from the device record, never taken from a request.
export const KIOSK_COOKIE = env.COOKIE_SECURE ? '__Host-mms_kiosk' : 'mms_kiosk'
const CREDENTIAL_DAYS = 30
const ROTATE_AFTER_MS = 24 * 3_600_000
const ROTATION_GRACE_MS = 10 * 60_000
const SEEN_EVERY_MS = 30_000
const CODE_TTL_MS = 15 * 60_000
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

const cookieOptions = (maxAgeMs?: number): CookieOptions => ({ httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict', path: '/', ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) })
const unauthorized = () => new AppError(401, 'DEVICE_UNAUTHORIZED', 'This device is not authorised. Ask the office to register it.')
export const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** A one-time code short enough to type on a phone: 8 characters, shown as XXXX-XXXX. */
export function newRegistrationCode() {
  const raw = [...randomBytes(8)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
  return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, hash: hashToken(raw), expiresAt: new Date(Date.now() + CODE_TTL_MS) }
}

function issueCredential(res: Response) {
  const token = newToken()
  res.cookie(KIOSK_COOKIE, token, cookieOptions(CREDENTIAL_DAYS * 86_400_000))
  return hashToken(token)
}

export const clearKioskCookie = (res: Response) => res.clearCookie(KIOSK_COOKIE, cookieOptions())

const addressAllowed = (allowed: string[], ip: string | undefined) => !allowed.length || (!!ip && allowed.some((a) => (a.endsWith('.') || a.endsWith(':') ? ip.replace(/^::ffff:/, '').startsWith(a) : ip.replace(/^::ffff:/, '') === a)))

/** These routes sit before the session middleware, so they make the same cross-site checks here. */
export const kioskRequestChecks: RequestHandler = (req, _res, next) => {
  if (req.method === 'GET') return next()
  const origin = req.get('origin')
  if (origin && !env.CORS_ORIGINS.includes(origin)) return next(forbidden('Cross-site request blocked.'))
  if (!req.is('application/json')) return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Requests must be sent as JSON.'))
  next()
}

/** Every kiosk call: the device must be active right now, so switching one off takes effect at once. */
export const requireKiosk: RequestHandler = async (req, _res, next) => {
  const raw = req.cookies?.[KIOSK_COOKIE]
  if (typeof raw !== 'string' || raw.length < 20 || raw.length > 100) throw unauthorized()
  const hash = hashToken(raw)
  const now = new Date()
  const device = await asOrg('find a kiosk by its credential', () => prisma.kioskDevice.findFirst({ where: { OR: [{ tokenHash: hash }, { previousTokenHash: hash, previousTokenUntil: { gt: now } }] }, include: { madrasa: { select: { active: true } } } }))
  if (!device || device.status !== 'ACTIVE' || !device.madrasa.active) throw unauthorized()
  if (!device.credentialIssuedAt || now.getTime() - device.credentialIssuedAt.getTime() > CREDENTIAL_DAYS * 86_400_000) throw unauthorized()
  if (!addressAllowed(device.allowedIps, req.ip)) throw new AppError(403, 'DEVICE_LOCATION_NOT_ALLOWED', 'This kiosk cannot be used from this network.')
  await assertFeature('STAFF_ATTENDANCE', device.madrasaId)
  const { madrasa: _m, ...kiosk } = device
  req.kiosk = kiosk
  runInTenant({ ids: [device.madrasaId], active: device.madrasaId }, next)
}

export async function register(req: Request, res: Response, code: string) {
  await consume(LIMITS.tokenPerIp, req.ip ?? 'unknown')
  const hash = hashToken(normaliseCode(code))
  const device = await asOrg('find a kiosk by its registration code', () => prisma.kioskDevice.findUnique({ where: { registrationCodeHash: hash } }))
  if (!device || !device.registrationExpiresAt || device.registrationExpiresAt < new Date() || device.status === 'DISABLED') {
    throw new AppError(422, 'REGISTRATION_CODE_INVALID', 'This code is not valid or has expired. Ask the office for a new one.')
  }
  const tokenHash = issueCredential(res)
  await asOrg('activate a kiosk from its one-time code', async () => {
    // Conditional: two devices racing with one code cannot both win.
    const won = await prisma.kioskDevice.updateMany({
      where: { id: device.id, registrationCodeHash: hash },
      data: { status: 'ACTIVE', tokenHash, previousTokenHash: null, previousTokenUntil: null, credentialIssuedAt: new Date(), registrationCodeHash: null, registrationExpiresAt: null, lastSeenAt: new Date(), userAgent: req.get('user-agent')?.slice(0, 300) ?? null },
    })
    if (won.count !== 1) {
      clearKioskCookie(res)
      throw new AppError(422, 'REGISTRATION_CODE_INVALID', 'This code is not valid or has expired. Ask the office for a new one.')
    }
    await audit({ action: 'kiosk.registered', summary: `Kiosk "${device.name}" registered on a device`, entityType: 'kiosk', entityId: device.id, madrasaId: device.madrasaId, actor: { userId: null, name: `Kiosk: ${device.name}`, role: 'kiosk' } }, req)
  })
  return { registered: true }
}

/** Configuration and heartbeat. Also where the credential is rotated. */
export async function status(req: Request, res: Response) {
  const k = req.kiosk as KioskDevice
  const now = new Date()
  const data: Parameters<typeof prisma.kioskDevice.update>[0]['data'] = {}
  if (!k.lastSeenAt || now.getTime() - k.lastSeenAt.getTime() > SEEN_EVERY_MS) data.lastSeenAt = now
  if (k.credentialIssuedAt && now.getTime() - k.credentialIssuedAt.getTime() > ROTATE_AFTER_MS) {
    data.tokenHash = issueCredential(res)
    data.previousTokenHash = k.tokenHash
    data.previousTokenUntil = new Date(now.getTime() + ROTATION_GRACE_MS)
    data.credentialIssuedAt = now
  }
  if (Object.keys(data).length) await prisma.kioskDevice.update({ where: { id: k.id }, data })
  const [settings, profile, org] = await Promise.all([effectiveSettings(k.madrasaId, k), madrasaProfile(k.madrasaId), asOrg('organization name for the kiosk screen', () => prisma.organization.findUnique({ where: { id: 1 }, select: { name: true } }))])
  return {
    device: { name: k.name, branch: k.branch, location: k.location },
    institution: org?.name ?? profile.name,
    madrasa: profile.name,
    timezone: profile.timezone,
    serverTime: now.toISOString(),
    attendance: { mode: settings.mode, pinRequired: settings.pinRequired || settings.highSecurity },
    ui: settings.ui,
  }
}

/** The kiosk signs itself out. It needs a new registration code to work again. */
export async function reset(req: Request, res: Response) {
  const k = req.kiosk as KioskDevice
  await prisma.kioskDevice.update({ where: { id: k.id }, data: { status: 'PENDING', tokenHash: null, previousTokenHash: null, previousTokenUntil: null, credentialIssuedAt: null } })
  await audit({ action: 'kiosk.reset', summary: `Kiosk "${k.name}" was reset on the device`, entityType: 'kiosk', entityId: k.id, madrasaId: k.madrasaId, actor: { userId: null, name: `Kiosk: ${k.name}`, role: 'kiosk' } }, req)
  clearKioskCookie(res)
}

const fail = (status: number, code: string, message: string) => new AppError(status, code, message)

export interface ScanInput { token: string; requestId: string; action?: ScanAction | undefined; pin?: string | undefined }

async function processScan(k: KioskDevice, input: ScanInput) {
  const claims = verifyQr(input.token)
  const settings = await effectiveSettings(k.madrasaId, k)
  if (claims.kind === 'static' && (!settings.qr.static || settings.highSecurity)) throw fail(422, 'QR_NOT_ACCEPTED', 'This kind of QR code is not accepted here. Please show the code from your attendance page.')
  if (claims.kind === 'dynamic' && !settings.qr.dynamic) throw fail(422, 'QR_NOT_ACCEPTED', 'This kind of QR code is not accepted here. Please show your personal code.')

  // Looked up inside this kiosk's madrasa: a person of another madrasa is simply not found.
  const staff = await prisma.staffProfile.findFirst({ where: { userId: claims.sub }, select: { id: true, displayName: true, code: true, title: true, status: true, attendanceExempt: true, qrRevokedAt: true, user: { select: { status: true, attendancePinHash: true } } } })
  if (!staff) throw fail(403, 'STAFF_NOT_ASSIGNED', 'This person is not assigned to this madrasa.')
  if (staff.status !== 'ACTIVE' || staff.user?.status !== 'ACTIVE') throw fail(403, 'STAFF_INACTIVE', 'This staff account is not active. Please see the office.')
  if (staff.qrRevokedAt && claims.iat * 1000 < staff.qrRevokedAt.getTime()) throw fail(422, 'QR_REVOKED', 'This QR code has been cancelled. Please open your attendance page again.')

  if (settings.pinRequired || settings.highSecurity) {
    if (!staff.user.attendancePinHash) throw fail(403, 'PIN_NOT_SET', 'Please set your attendance PIN in your account first.')
    if (!input.pin) throw fail(403, 'PIN_REQUIRED', 'Enter your attendance PIN.')
    await consume(LIMITS.attendancePin, claims.sub)
    if (!(await verifyPassword(staff.user.attendancePinHash, input.pin))) throw fail(403, 'PIN_INVALID', 'That PIN is not correct.')
    await clear(LIMITS.attendancePin, claims.sub)
  }

  const profile = await madrasaProfile(k.madrasaId)
  const at = new Date()
  const result = await prisma.$transaction(async (tx) => {
    if (!(await lockRow(tx, 'staff_profiles', staff.id))) throw fail(403, 'STAFF_NOT_ASSIGNED', 'This person is not assigned to this madrasa.')
    if (claims.kind === 'dynamic') {
      // The primary key decides: of any number of kiosks and retries, exactly one uses this code.
      const used = await tx.qrTokenUse.createMany({ data: [{ jti: claims.jti, userId: claims.sub, expiresAt: new Date(claims.exp! * 1000) }], skipDuplicates: true })
      if (used.count !== 1) throw fail(409, 'QR_ALREADY_USED', 'This QR code was already used. Please wait for the next code.')
    }
    const rules = { ...settings, duplicateWindowSeconds: claims.kind === 'static' ? Math.max(30, settings.duplicateWindowSeconds) : settings.duplicateWindowSeconds }
    const event = await recordEvent(tx, staff, { at, timezone: profile.timezone, rules, requested: input.action, kioskId: k.id })
    const body = {
      ok: true, action: event.action, status: event.status, at: at.toISOString(),
      time: new Intl.DateTimeFormat('en-IN', { timeZone: profile.timezone, hour: '2-digit', minute: '2-digit', hour12: true }).format(at),
      date: dateIn(profile.timezone, at), lateMinutes: event.lateMinutes, earlyMinutes: event.earlyMinutes, workedMinutes: event.workedMinutes,
      staff: { name: staff.displayName, employeeId: staff.code, designation: staff.title },
    }
    await tx.kioskScan.create({ data: { kioskId: k.id, requestId: input.requestId, outcome: event.action, ok: true, staffId: staff.id, at, result: body } })
    await tx.kioskDevice.update({ where: { id: k.id }, data: { lastScanAt: at } })
    return body
  })
  return result
}

/**
 * One scan from a kiosk. Decoding a QR proves nothing: every check is made here. A
 * repeat of an accepted requestId (a retry after a dropped connection) returns the
 * first answer and records nothing new.
 */
export async function scan(req: Request, input: ScanInput) {
  const k = req.kiosk as KioskDevice
  await consume(LIMITS.kioskScan, k.id)
  const earlier = () => prisma.kioskScan.findUnique({ where: { kioskId_requestId: { kioskId: k.id, requestId: input.requestId } } })
  const seen = await earlier()
  if (seen?.ok) return seen.result
  try {
    return await processScan(k, input)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      const first = await earlier()
      if (first?.ok) return first.result
    }
    const code = err instanceof AppError ? err.code : 'SCAN_FAILED'
    await prisma.kioskScan.create({ data: { kioskId: k.id, outcome: code, ok: false } }).catch(() => undefined)
    throw err
  }
}
