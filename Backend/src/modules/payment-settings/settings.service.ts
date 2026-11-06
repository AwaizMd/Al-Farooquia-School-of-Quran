import type { Request } from 'express'
import { randomUUID, createHash } from 'node:crypto'
import type { PaymentSettings } from '../../generated/prisma/client.js'
import { AppError, notFound } from '../../common/errors.js'
import { IMAGE_TYPES, checkUpload, safeFileName } from '../../common/fileTypes.js'
import { prisma, type Tx } from '../../database/prisma.js'
import { readStored, storage } from '../../integrations/storage/storage.js'
import { activeMadrasaId } from '../../tenancy/context.js'
import { audit } from '../audit-logs/audit.service.js'

// Each madrasa has its own bank account and UPI QR (CR-01 §5). Families pay the
// madrasa directly; there is no payment gateway. A payment counts once staff verify it.
const QR_MAX_BYTES = 2 * 1024 * 1024

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT_NUMBER = /^\d{9,18}$/
const UPI_ID = /^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/

/** The active madrasa's row, or an unsaved all-off default before anyone has configured payments. */
export async function loadSettings(db: Tx | typeof prisma = prisma): Promise<PaymentSettings> {
  const madrasaId = activeMadrasaId()
  const row = await db.paymentSettings.findUnique({ where: { madrasaId } })
  return row ?? {
    madrasaId, bankEnabled: false, bankAccountName: null, bankName: null, bankAccountNumber: null, bankIfsc: null, bankBranch: null,
    bankAccountType: null, bankInstructions: null, bankReferenceHint: null, bankProofRequired: false, upiEnabled: false, upiQrFileId: null, upiId: null, upiPayeeName: null, upiInstructions: null,
    upiProofRequired: false, updatedById: null, updatedAt: new Date(0),
  }
}

// ---------- Readiness ----------

export function readiness(s: PaymentSettings) {
  const bank: string[] = []
  if (!s.bankAccountName) bank.push('Enter the account holder name.')
  if (!s.bankName) bank.push('Enter the bank name.')
  if (!s.bankAccountNumber || !ACCOUNT_NUMBER.test(s.bankAccountNumber)) bank.push('Enter a 9–18 digit account number.')
  if (!s.bankIfsc || !IFSC.test(s.bankIfsc)) bank.push('Enter a valid IFSC code (e.g. SBIN0001234).')
  const upi: string[] = []
  if (!s.upiQrFileId) upi.push('Upload the madrasa’s UPI QR code.')
  if (s.upiId && !UPI_ID.test(s.upiId)) upi.push('The UPI ID does not look valid (name@bank).')
  return { bank: { ready: bank.length === 0, problems: bank }, upi: { ready: upi.length === 0, problems: upi } }
}

/** What families may use right now: enabled in the settings and fully configured. */
export async function availableMethods(s?: PaymentSettings) {
  const st = s ?? (await loadSettings())
  const r = readiness(st)
  return { bank: st.bankEnabled && r.bank.ready, upi: st.upiEnabled && r.upi.ready, settings: st }
}

/** Administrator view. */
export async function adminView() {
  const s = await loadSettings()
  const r = readiness(s)
  return {
    bank: { enabled: s.bankEnabled, accountName: s.bankAccountName, bankName: s.bankName, accountNumber: s.bankAccountNumber, ifsc: s.bankIfsc, branch: s.bankBranch, accountType: s.bankAccountType, instructions: s.bankInstructions, referenceHint: s.bankReferenceHint, proofRequired: s.bankProofRequired, ...r.bank },
    upi: { enabled: s.upiEnabled, hasQr: !!s.upiQrFileId, upiId: s.upiId, payeeName: s.upiPayeeName, instructions: s.upiInstructions, proofRequired: s.upiProofRequired, ...r.upi },
    updatedAt: s.updatedById ? s.updatedAt : null,
  }
}

export interface SettingsPatch {
  bank?: { enabled?: boolean | undefined; accountName?: string | null | undefined; bankName?: string | null | undefined; accountNumber?: string | null | undefined; ifsc?: string | null | undefined; branch?: string | null | undefined; accountType?: string | null | undefined; instructions?: string | null | undefined; referenceHint?: string | null | undefined; proofRequired?: boolean | undefined } | undefined
  upi?: { enabled?: boolean | undefined; upiId?: string | null | undefined; payeeName?: string | null | undefined; instructions?: string | null | undefined; proofRequired?: boolean | undefined } | undefined
}

const blank = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null)

export async function updateSettings(req: Request, patch: SettingsPatch) {
  const changed: string[] = []
  const madrasaId = activeMadrasaId()
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM madrasas WHERE id = ${madrasaId}::uuid FOR UPDATE`
    const cur = await loadSettings(tx)
    const next: PaymentSettings = { ...cur }
    const set = <K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K] | undefined, label: string = String(k)) => {
      if (v === undefined || v === cur[k]) return
      next[k] = v
      changed.push(label)
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
    if (next.bankAccountNumber && !ACCOUNT_NUMBER.test(next.bankAccountNumber)) errors.push({ path: 'bank.accountNumber', message: 'Enter a 9–18 digit account number.' })
    if (next.bankIfsc && !IFSC.test(next.bankIfsc)) errors.push({ path: 'bank.ifsc', message: 'Enter a valid IFSC code (e.g. SBIN0001234).' })
    if (next.upiId && !UPI_ID.test(next.upiId)) errors.push({ path: 'upi.upiId', message: 'The UPI ID does not look valid (name@bank).' })
    if (next.bankEnabled && !r.bank.ready) errors.push(...r.bank.problems.map((m) => ({ path: 'bank.enabled', message: m })))
    if (next.upiEnabled && !r.upi.ready) errors.push(...r.upi.problems.map((m) => ({ path: 'upi.enabled', message: m })))
    if (errors.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some payment settings are incomplete or invalid.', errors)
    if (!changed.length) return
    const { madrasaId: _m, updatedAt: _u, ...data } = next
    await tx.paymentSettings.upsert({ where: { madrasaId }, create: { ...data, updatedById: req.auth!.user.id }, update: { ...data, updatedById: req.auth!.user.id } })
    // Field names only: never account numbers.
    await audit({ action: 'payments.settings_changed', summary: `Payment settings changed: ${changed.join(', ')} · bank ${next.bankEnabled ? 'on' : 'off'}, UPI ${next.upiEnabled ? 'on' : 'off'}`, entityType: 'payment_settings', metadata: { changed } }, req, tx)
  })
  return adminView()
}

// ---------- UPI QR image ----------

export async function setUpiQr(req: Request, body: Buffer, declaredType: string, originalName: string) {
  const type = checkUpload(body, declaredType, IMAGE_TYPES, QR_MAX_BYTES, 'a PNG, JPEG or WebP image of the UPI QR code')
  const madrasaId = activeMadrasaId()
  const key = `payments/upi-qr/${randomUUID()}.${type.ext}`
  await storage().put(key, body, declaredType)
  let previous: { id: string; storageKey: string } | null = null
  try {
    await prisma.$transaction(async (tx) => {
      const cur = await tx.paymentSettings.findUnique({ where: { madrasaId }, include: { upiQr: true } })
      const file = await tx.storedFile.create({ data: { storageKey: key, originalName: safeFileName(originalName, type.ext), mimeType: declaredType, sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), uploadedById: req.auth!.user.id, purpose: 'UPI_QR' } })
      await tx.paymentSettings.upsert({ where: { madrasaId }, create: { upiQrFileId: file.id, updatedById: req.auth!.user.id }, update: { upiQrFileId: file.id, updatedById: req.auth!.user.id } })
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
  const madrasaId = activeMadrasaId()
  const removed = await prisma.$transaction(async (tx) => {
    const cur = await tx.paymentSettings.findUnique({ where: { madrasaId }, include: { upiQr: true } })
    if (!cur?.upiQr) throw notFound()
    // Without its QR code UPI cannot be offered, so it is switched off in the same step.
    await tx.paymentSettings.update({ where: { madrasaId }, data: { upiQrFileId: null, upiEnabled: false, updatedById: req.auth!.user.id } })
    await tx.storedFile.delete({ where: { id: cur.upiQr.id } })
    await audit({ action: 'payments.upi_qr_removed', summary: `UPI QR code removed${cur.upiEnabled ? '; UPI payments switched off' : ''}`, entityType: 'payment_settings' }, req, tx)
    return cur.upiQr.storageKey
  })
  await storage().remove(removed).catch(() => {})
  return adminView()
}

export async function upiQrImage() {
  const s = await prisma.paymentSettings.findUnique({ where: { madrasaId: activeMadrasaId() }, include: { upiQr: true } })
  if (!s?.upiQr) throw notFound()
  return { body: await readStored(s.upiQr.storageKey), mimeType: s.upiQr.mimeType }
}
