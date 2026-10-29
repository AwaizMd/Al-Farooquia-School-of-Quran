import type { Request } from 'express'
import { randomUUID, createHash } from 'node:crypto'
import type { Prisma, PaymentSettings } from '../../generated/prisma/client.js'
import type { RazorpayMode } from '../../generated/prisma/enums.js'
import { AppError, conflict, notFound } from '../../common/errors.js'
import { canSealSettings, sealSetting, unsealSetting } from '../../common/crypto.js'
import { IMAGE_TYPES, checkUpload, safeFileName } from '../../common/fileTypes.js'
import { env, isProd } from '../../config/env.js'
import { prisma } from '../../database/prisma.js'
import { devProvider } from '../../integrations/payments/dev.js'
import type { PaymentProvider } from '../../integrations/payments/provider.js'
import { razorpayProvider } from '../../integrations/payments/razorpay.js'
import { storage } from '../../integrations/storage/storage.js'
import { audit } from '../audit-logs/audit.service.js'

// One Madarsa per deployment (approved): settings belong to institution 1.
const INSTITUTION = 1
const QR_MAX_BYTES = 2 * 1024 * 1024

const aad = (field: string) => `payment_settings:${INSTITUTION}:${field}`
const KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]{8,30}$/
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT_NUMBER = /^\d{9,18}$/
const UPI_ID = /^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/

/** The stored row, or an unsaved all-off default before anyone has configured payments. */
export async function loadSettings(db: Prisma.TransactionClient | typeof prisma = prisma): Promise<PaymentSettings> {
  const row = await db.paymentSettings.findUnique({ where: { institutionId: INSTITUTION } })
  return row ?? {
    institutionId: INSTITUTION, razorpayEnabled: false, razorpayMode: 'TEST', razorpayKeyId: null, razorpaySecret: null, razorpayWebhookSecret: null, razorpayValidatedAt: null,
    razorpayWebhookVerifiedKeyId: null, razorpayWebhookVerifiedAt: null, bankEnabled: false, bankAccountName: null, bankName: null, bankAccountNumber: null, bankIfsc: null, bankBranch: null,
    bankAccountType: null, bankInstructions: null, bankReferenceHint: null, bankProofRequired: false, upiEnabled: false, upiQrFileId: null, upiId: null, upiPayeeName: null, upiInstructions: null,
    upiProofRequired: false, updatedById: null, updatedAt: new Date(0),
  }
}

// ---------- Where the gateway credentials come from ----------

type Source = 'development' | 'environment' | 'settings'
const sourceOf = (): Source => (env.PAYMENT_PROVIDER === 'dev' && !isProd ? 'development' : env.PAYMENT_PROVIDER === 'razorpay' ? 'environment' : 'settings')

let devCached: ReturnType<typeof devProvider> | undefined
export const devGateway = () => (sourceOf() === 'development' ? (devCached ??= devProvider(env.DEV_PAYMENT_WEBHOOK_SECRET)) : null)

/** Credentials in effect, decrypted only here and only for server-to-server use. */
function credentials(s: PaymentSettings) {
  if (sourceOf() === 'environment') return { keyId: env.RAZORPAY_KEY_ID!, keySecret: env.RAZORPAY_KEY_SECRET!, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET! }
  if (!s.razorpayKeyId || !s.razorpaySecret || !s.razorpayWebhookSecret) return null
  return { keyId: s.razorpayKeyId, keySecret: unsealSetting(s.razorpaySecret, aad('razorpaySecret')), webhookSecret: unsealSetting(s.razorpayWebhookSecret, aad('razorpayWebhookSecret')) }
}

/**
 * The gateway for this institution, whether or not new payments are currently
 * offered: webhooks and refunds for earlier payments must keep working.
 */
export async function gateway(s?: PaymentSettings): Promise<PaymentProvider | null> {
  const dev = devGateway()
  if (dev) return dev
  const c = credentials(s ?? (await loadSettings()))
  return c ? razorpayProvider({ ...c, apiBase: env.RAZORPAY_API_BASE }) : null
}

// ---------- Readiness ----------

export function readiness(s: PaymentSettings) {
  const source = sourceOf()
  const rp: string[] = []
  const keyId = source === 'environment' ? env.RAZORPAY_KEY_ID ?? null : s.razorpayKeyId
  const mode: RazorpayMode = keyId?.startsWith('rzp_live_') ? 'LIVE' : source === 'settings' ? s.razorpayMode : 'TEST'
  if (source !== 'development') {
    if (!keyId) rp.push('Enter the Razorpay Key ID.')
    else if (!KEY_ID.test(keyId)) rp.push('The Key ID does not look like a Razorpay key (rzp_test_… or rzp_live_…).')
    else if (source === 'settings' && !keyId.startsWith(mode === 'LIVE' ? 'rzp_live_' : 'rzp_test_')) rp.push(`A ${mode === 'LIVE' ? 'live' : 'test'} mode Key ID is needed (rzp_${mode.toLowerCase()}_…).`)
    if (source === 'settings' && !s.razorpaySecret) rp.push('Enter the Razorpay Key Secret.')
    if (source === 'settings' && !s.razorpayWebhookSecret) rp.push('Enter the webhook secret.')
    if (source === 'settings' && !s.razorpayValidatedAt) rp.push('Validate the keys with Razorpay.')
    if (mode === 'LIVE' && s.razorpayWebhookVerifiedKeyId !== keyId) rp.push('Live mode needs one correctly signed webhook from Razorpay (send a test webhook from the Razorpay dashboard).')
  }
  const bank: string[] = []
  if (!s.bankAccountName) bank.push('Enter the account holder name.')
  if (!s.bankName) bank.push('Enter the bank name.')
  if (!s.bankAccountNumber || !ACCOUNT_NUMBER.test(s.bankAccountNumber)) bank.push('Enter a 9–18 digit account number.')
  if (!s.bankIfsc || !IFSC.test(s.bankIfsc)) bank.push('Enter a valid IFSC code (e.g. SBIN0001234).')
  const upi: string[] = []
  if (!s.upiQrFileId) upi.push('Upload the Madarsa’s UPI QR code.')
  if (s.upiId && !UPI_ID.test(s.upiId)) upi.push('The UPI ID does not look valid (name@bank).')
  return {
    razorpay: { source, mode, ready: rp.length === 0, problems: rp },
    bank: { ready: bank.length === 0, problems: bank },
    upi: { ready: upi.length === 0, problems: upi },
  }
}

/** What new payments may use right now: enabled in the settings and fully configured. */
export async function availableMethods(s?: PaymentSettings) {
  const st = s ?? (await loadSettings())
  const r = readiness(st)
  return { online: st.razorpayEnabled && r.razorpay.ready, bank: st.bankEnabled && r.bank.ready, upi: st.upiEnabled && r.upi.ready, settings: st }
}

const mask = (v: string | null, keep = 4) => (v ? `${'•'.repeat(Math.max(4, v.length - keep))}${v.slice(-keep)}` : null)

/** Administrator view: secrets are never returned, only whether they are set. */
export async function adminView() {
  const s = await loadSettings()
  const r = readiness(s)
  const source = r.razorpay.source
  const keyId = source === 'environment' ? env.RAZORPAY_KEY_ID ?? null : s.razorpayKeyId
  return {
    razorpay: {
      enabled: s.razorpayEnabled,
      keyId: keyId ? `${keyId.slice(0, 9)}${mask(keyId.slice(9))}` : null,
      keySecretSet: source === 'environment' ? !!env.RAZORPAY_KEY_SECRET : !!s.razorpaySecret,
      webhookSecretSet: source === 'environment' ? !!env.RAZORPAY_WEBHOOK_SECRET : !!s.razorpayWebhookSecret,
      validatedAt: s.razorpayValidatedAt, webhookVerifiedAt: s.razorpayWebhookVerifiedKeyId && s.razorpayWebhookVerifiedKeyId === keyId ? s.razorpayWebhookVerifiedAt : null,
      webhookUrl: `${env.APP_BASE_URL.replace(/\/$/, '')}/api/v1/payments/webhooks/razorpay`,
      canStoreSecrets: canSealSettings(), ...r.razorpay,
    },
    bank: { enabled: s.bankEnabled, accountName: s.bankAccountName, bankName: s.bankName, accountNumber: s.bankAccountNumber, ifsc: s.bankIfsc, branch: s.bankBranch, accountType: s.bankAccountType, instructions: s.bankInstructions, referenceHint: s.bankReferenceHint, proofRequired: s.bankProofRequired, ...r.bank },
    upi: { enabled: s.upiEnabled, hasQr: !!s.upiQrFileId, upiId: s.upiId, payeeName: s.upiPayeeName, instructions: s.upiInstructions, proofRequired: s.upiProofRequired, ...r.upi },
    updatedAt: s.updatedById ? s.updatedAt : null,
  }
}

export interface SettingsPatch {
  razorpay?: { enabled?: boolean | undefined; mode?: RazorpayMode | undefined; keyId?: string | undefined; keySecret?: string | undefined; webhookSecret?: string | undefined } | undefined
  bank?: { enabled?: boolean | undefined; accountName?: string | null | undefined; bankName?: string | null | undefined; accountNumber?: string | null | undefined; ifsc?: string | null | undefined; branch?: string | null | undefined; accountType?: string | null | undefined; instructions?: string | null | undefined; referenceHint?: string | null | undefined; proofRequired?: boolean | undefined } | undefined
  upi?: { enabled?: boolean | undefined; upiId?: string | null | undefined; payeeName?: string | null | undefined; instructions?: string | null | undefined; proofRequired?: boolean | undefined } | undefined
}

const blank = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null)

async function ensureInstitution(db: Prisma.TransactionClient) {
  if (!(await db.institutionSettings.findUnique({ where: { id: INSTITUTION } }))) throw conflict('NO_INSTITUTION', 'Save the Madarsa details in Settings first.')
}

export async function updateSettings(req: Request, patch: SettingsPatch) {
  const changed: string[] = []
  await prisma.$transaction(async (tx) => {
    await ensureInstitution(tx)
    await tx.$queryRaw`SELECT 1 FROM institution_settings WHERE id = ${INSTITUTION} FOR UPDATE`
    const cur = await loadSettings(tx)
    const next: PaymentSettings = { ...cur }
    const set = <K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K] | undefined, label: string = String(k)) => {
      if (v === undefined) return
      const same = v instanceof Uint8Array || cur[k] instanceof Uint8Array ? false : v === cur[k]
      if (!same) { next[k] = v; changed.push(label) }
    }
    const rp = patch.razorpay
    if (rp) {
      const envManaged = sourceOf() !== 'settings'
      if (envManaged && (rp.keyId || rp.keySecret || rp.webhookSecret || rp.mode)) throw conflict('ENV_MANAGED', 'Razorpay credentials are managed by the server’s environment settings.')
      set('razorpayEnabled', rp.enabled, 'razorpay.enabled')
      set('razorpayMode', rp.mode, 'razorpay.mode')
      set('razorpayKeyId', blank(rp.keyId) ?? undefined, 'razorpay.keyId')
      if (rp.keySecret || rp.webhookSecret) {
        if (!canSealSettings()) throw new AppError(503, 'SECRET_STORAGE_UNAVAILABLE', 'The server cannot store payment secrets yet (SETTINGS_ENCRYPTION_KEYS is not set).')
        if (rp.keySecret) { next.razorpaySecret = sealSetting(rp.keySecret, aad('razorpaySecret')); changed.push('razorpay.keySecret') }
        if (rp.webhookSecret) { next.razorpayWebhookSecret = sealSetting(rp.webhookSecret, aad('razorpayWebhookSecret')); changed.push('razorpay.webhookSecret') }
      }
      // New keys or mode must be validated again; a new key or webhook secret needs a fresh signed webhook.
      if (changed.some((c) => ['razorpay.mode', 'razorpay.keyId', 'razorpay.keySecret'].includes(c))) next.razorpayValidatedAt = null
      if (changed.some((c) => ['razorpay.keyId', 'razorpay.webhookSecret'].includes(c))) { next.razorpayWebhookVerifiedKeyId = null; next.razorpayWebhookVerifiedAt = null }
    }
    const b = patch.bank
    if (b) {
      set('bankEnabled', b.enabled, 'bank.enabled')
      set('bankAccountName', blank(b.accountName), 'bank.accountName')
      set('bankName', blank(b.bankName), 'bank.bankName')
      set('bankAccountNumber', blank(b.accountNumber)?.replace(/\s/g, '') ?? blank(b.accountNumber), 'bank.accountNumber')
      set('bankIfsc', blank(b.ifsc)?.toUpperCase() ?? blank(b.ifsc), 'bank.ifsc')
      set('bankBranch', blank(b.branch), 'bank.branch')
      set('bankAccountType', blank(b.accountType), 'bank.accountType')
      set('bankInstructions', blank(b.instructions), 'bank.instructions')
      set('bankReferenceHint', blank(b.referenceHint), 'bank.referenceHint')
      set('bankProofRequired', b.proofRequired, 'bank.proofRequired')
    }
    const u = patch.upi
    if (u) {
      set('upiEnabled', u.enabled, 'upi.enabled')
      set('upiId', blank(u.upiId), 'upi.upiId')
      set('upiPayeeName', blank(u.payeeName), 'upi.payeeName')
      set('upiInstructions', blank(u.instructions), 'upi.instructions')
      set('upiProofRequired', u.proofRequired, 'upi.proofRequired')
    }
    // Field-level checks always; "ready" only matters for methods being switched on.
    const r = readiness(next)
    const errors: { path: string; message: string }[] = []
    if (next.razorpayKeyId && !KEY_ID.test(next.razorpayKeyId)) errors.push({ path: 'razorpay.keyId', message: 'The Key ID does not look like a Razorpay key (rzp_test_… or rzp_live_…).' })
    if (next.bankAccountNumber && !ACCOUNT_NUMBER.test(next.bankAccountNumber)) errors.push({ path: 'bank.accountNumber', message: 'Enter a 9–18 digit account number.' })
    if (next.bankIfsc && !IFSC.test(next.bankIfsc)) errors.push({ path: 'bank.ifsc', message: 'Enter a valid IFSC code (e.g. SBIN0001234).' })
    if (next.upiId && !UPI_ID.test(next.upiId)) errors.push({ path: 'upi.upiId', message: 'The UPI ID does not look valid (name@bank).' })
    if (next.razorpayEnabled && !r.razorpay.ready) errors.push(...r.razorpay.problems.map((m) => ({ path: 'razorpay.enabled', message: m })))
    if (next.bankEnabled && !r.bank.ready) errors.push(...r.bank.problems.map((m) => ({ path: 'bank.enabled', message: m })))
    if (next.upiEnabled && !r.upi.ready) errors.push(...r.upi.problems.map((m) => ({ path: 'upi.enabled', message: m })))
    if (errors.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some payment settings are incomplete or invalid.', errors)
    if (!changed.length) return
    const { institutionId: _i, updatedAt: _u, ...data } = next
    await tx.paymentSettings.upsert({ where: { institutionId: INSTITUTION }, create: { ...data, institutionId: INSTITUTION, updatedById: req.auth!.user.id }, update: { ...data, updatedById: req.auth!.user.id } })
    // Field names only: never the values of secrets or account numbers.
    await audit({ action: 'payments.settings_changed', summary: `Payment settings changed: ${changed.join(', ')} · online ${next.razorpayEnabled ? 'on' : 'off'}, bank ${next.bankEnabled ? 'on' : 'off'}, UPI ${next.upiEnabled ? 'on' : 'off'}`, entityType: 'payment_settings', metadata: { changed } }, req, tx)
  })
  return adminView()
}

/** Check the stored keys against Razorpay's API; records success so the method can be enabled. */
export async function validateRazorpay(req: Request) {
  const s = await loadSettings()
  if (sourceOf() === 'development') return { ok: true, message: 'The development gateway needs no keys.' }
  const p = await gateway(s)
  if (!p?.validate) throw conflict('NOT_CONFIGURED', 'Enter the Key ID, Key Secret and webhook secret first.')
  try {
    await p.validate()
  } catch (err) {
    await audit({ action: 'payments.razorpay_validation_failed', summary: 'Razorpay rejected the keys or could not be reached', entityType: 'payment_settings' }, req)
    const status = (err as { status?: number }).status
    throw new AppError(422, 'RAZORPAY_REJECTED', status === 401 ? 'Razorpay rejected these keys. Check the Key ID and Key Secret.' : 'Could not reach Razorpay. Try again in a moment.')
  }
  if (sourceOf() === 'settings') await prisma.paymentSettings.update({ where: { institutionId: INSTITUTION }, data: { razorpayValidatedAt: new Date() } })
  await audit({ action: 'payments.razorpay_validated', summary: 'Razorpay keys validated', entityType: 'payment_settings' }, req)
  return { ok: true, message: 'Razorpay accepted the keys.' }
}

/** Called for every correctly signed Razorpay webhook: proves the webhook is set up for these keys. */
export async function markWebhookVerified() {
  const s = await loadSettings()
  const keyId = sourceOf() === 'environment' ? env.RAZORPAY_KEY_ID : s.razorpayKeyId
  if (!keyId || s.razorpayWebhookVerifiedKeyId === keyId) return
  await prisma.paymentSettings.upsert({ where: { institutionId: INSTITUTION }, update: { razorpayWebhookVerifiedKeyId: keyId, razorpayWebhookVerifiedAt: new Date() }, create: { institutionId: INSTITUTION, razorpayWebhookVerifiedKeyId: keyId, razorpayWebhookVerifiedAt: new Date() } }).catch(() => {})
}

// ---------- UPI QR image ----------

export async function setUpiQr(req: Request, body: Buffer, declaredType: string, originalName: string) {
  const type = checkUpload(body, declaredType, IMAGE_TYPES, QR_MAX_BYTES, 'a PNG, JPEG or WebP image of the UPI QR code')
  const key = `payments/upi-qr/${randomUUID()}.${type.ext}`
  await storage().put(key, body, declaredType)
  let previous: { id: string; storageKey: string } | null = null
  try {
    await prisma.$transaction(async (tx) => {
      await ensureInstitution(tx)
      const cur = await tx.paymentSettings.findUnique({ where: { institutionId: INSTITUTION }, include: { upiQr: true } })
      const file = await tx.storedFile.create({ data: { storageKey: key, originalName: safeFileName(originalName, type.ext), mimeType: declaredType, sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), uploadedById: req.auth!.user.id, purpose: 'UPI_QR' } })
      await tx.paymentSettings.upsert({ where: { institutionId: INSTITUTION }, create: { institutionId: INSTITUTION, upiQrFileId: file.id, updatedById: req.auth!.user.id }, update: { upiQrFileId: file.id, updatedById: req.auth!.user.id } })
      if (cur?.upiQr) {
        previous = cur.upiQr
        await tx.storedFile.delete({ where: { id: cur.upiQr.id } })
      }
      await audit({ action: cur?.upiQr ? 'payments.upi_qr_replaced' : 'payments.upi_qr_added', summary: `UPI QR code ${cur?.upiQr ? 'replaced' : 'uploaded'} (${Math.ceil(body.length / 1024)} KB)`, entityType: 'payment_settings' }, req, tx)
    })
  } catch (err) {
    await storage().remove(key).catch(() => {})
    throw err
  }
  if (previous) await storage().remove((previous as { storageKey: string }).storageKey).catch(() => {})
  return adminView()
}

export async function removeUpiQr(req: Request) {
  const removed = await prisma.$transaction(async (tx) => {
    const cur = await tx.paymentSettings.findUnique({ where: { institutionId: INSTITUTION }, include: { upiQr: true } })
    if (!cur?.upiQr) throw notFound()
    // Without its QR code UPI cannot be offered, so it is switched off in the same step.
    await tx.paymentSettings.update({ where: { institutionId: INSTITUTION }, data: { upiQrFileId: null, upiEnabled: false, updatedById: req.auth!.user.id } })
    await tx.storedFile.delete({ where: { id: cur.upiQr.id } })
    await audit({ action: 'payments.upi_qr_removed', summary: `UPI QR code removed${cur.upiEnabled ? '; UPI payments switched off' : ''}`, entityType: 'payment_settings' }, req, tx)
    return cur.upiQr.storageKey
  })
  await storage().remove(removed).catch(() => {})
  return adminView()
}

export async function upiQrImage() {
  const s = await prisma.paymentSettings.findUnique({ where: { institutionId: INSTITUTION }, include: { upiQr: true } })
  if (!s?.upiQr) throw notFound()
  return { body: await storage().get(s.upiQr.storageKey), mimeType: s.upiQr.mimeType }
}
