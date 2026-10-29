import type { Request } from 'express'
import { createHash, randomUUID } from 'node:crypto'
import type { Prisma } from '../../generated/prisma/client.js'
import type { ManualPaymentMethod, ManualPaymentStatus } from '../../generated/prisma/enums.js'
import { AppError, conflict, forbidden, notFound } from '../../common/errors.js'
import { institutionToday } from '../../common/clock.js'
import { IMAGE_TYPES, PDF_TYPE, checkUpload, safeFileName } from '../../common/fileTypes.js'
import { consume } from '../../common/rateLimit.js'
import { prisma } from '../../database/prisma.js'
import { storage } from '../../integrations/storage/storage.js'
import { rolesWith } from '../auth/permissions.js'
import { audit } from '../audit-logs/audit.service.js'
import { money, notifyStudentFamily, notifyUsers } from '../notifications/notify.service.js'
import { availableMethods } from '../payment-settings/settings.service.js'
import { isoDate, toDate } from '../students/students.service.js'
import { feeScope, invoiceView, paymentView, receive } from './fees.service.js'

/**
 * Bank transfer / UPI payments reported by families. A submission is a claim, not
 * money: no balance changes until authorised staff check their bank statement and
 * approve it, which records an ordinary Payment (with receipt) in the one ledger.
 */

const PROOF_MAX_BYTES = 5 * 1024 * 1024
const PROOF_TYPES = { ...PDF_TYPE, ...IMAGE_TYPES }
export const PROOF_UPLOAD_TYPES = Object.keys(PROOF_TYPES)
const LIMIT_SUBMIT = { name: 'manual:submit', max: 10, windowSec: 60 * 60 }
const LIMIT_PROOF = { name: 'manual:proof', max: 20, windowSec: 60 * 60 }
const ACTIVE: ManualPaymentStatus[] = ['PENDING_VERIFICATION', 'NEEDS_INFO']
const METHOD_LABEL: Record<ManualPaymentMethod, string> = { BANK_TRANSFER: 'bank transfer', UPI: 'UPI' }

/** UTRs and bank references are compared without spaces, dashes or case. */
export const referenceKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const code = (id: string) => `MP-${id.slice(0, 8).toUpperCase()}`

type Tx = Prisma.TransactionClient

/** A guardian linked to the student with payment rights (the approved "who can submit" rule). */
async function payerLink(req: Request, studentId: string) {
  const link = await prisma.studentGuardian.findFirst({ where: { studentId, canPay: true, guardian: { userId: req.auth!.user.id } } })
  if (link) return link
  const canSee = await prisma.studentGuardian.count({ where: { studentId, guardian: { userId: req.auth!.user.id } } })
  throw canSee ? forbidden('Your account is not set up to pay fees for this student.') : notFound()
}

// ---------- Proof of payment ----------

/** Store a proof file privately before the submission that uses it. Only its uploader can attach it. */
export async function uploadProof(req: Request, body: Buffer, declaredType: string, originalName: string) {
  const isPayer = await prisma.studentGuardian.count({ where: { canPay: true, guardian: { userId: req.auth!.user.id } } })
  if (!isPayer) throw forbidden('Only a guardian who pays fees can upload proof of payment.')
  await consume(LIMIT_PROOF, req.auth!.user.id)
  const type = checkUpload(body, declaredType, PROOF_TYPES, PROOF_MAX_BYTES, 'a PDF or an image (PNG, JPEG or WebP) of the payment confirmation')
  const key = `payments/proofs/${randomUUID()}.${type.ext}`
  await storage().put(key, body, declaredType)
  try {
    const f = await prisma.storedFile.create({ data: { storageKey: key, originalName: safeFileName(originalName, type.ext), mimeType: declaredType, sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), uploadedById: req.auth!.user.id, purpose: 'PAYMENT_PROOF' } })
    return { id: f.id, name: f.originalName, mimeType: f.mimeType, sizeBytes: f.sizeBytes }
  } catch (err) {
    await storage().remove(key).catch(() => {})
    throw err
  }
}

// ---------- Submitting ----------

export interface SubmitInput {
  studentId: string
  method: ManualPaymentMethod
  invoiceIds?: string[] | undefined
  amountMinor: number
  paidOn: string
  reference: string
  note?: string | undefined
  proofFileId?: string | undefined
}

/** Refuse a reference already claimed (pending or approved) or already applied to the ledger. */
async function assertReferenceFree(db: Tx | typeof prisma, key: string, exceptId?: string) {
  const live = await db.manualPaymentSubmission.findFirst({ where: { referenceKey: key, status: { in: [...ACTIVE, 'APPROVED'] }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } })
  const used = await db.payment.findFirst({ where: { reference: key }, select: { id: true } })
  if (live || used) throw conflict('DUPLICATE_REFERENCE', 'This transaction reference has already been submitted. If you think this is a mistake, contact the office.')
}

async function attachableProof(db: Tx | typeof prisma, req: Request, fileId: string) {
  const f = await db.storedFile.findUnique({ where: { id: fileId }, include: { proofFor: true } })
  if (!f || f.purpose !== 'PAYMENT_PROOF' || f.uploadedById !== req.auth!.user.id || f.proofFor) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'proofFileId', message: 'Upload the proof of payment again.' }])
  return f
}

async function openBalance(tx: Tx, studentId: string, invoiceIds: string[] | undefined, today: string) {
  const rows = await tx.invoice.findMany({
    where: { studentId, status: 'ISSUED', ...(invoiceIds?.length ? { id: { in: invoiceIds } } : {}) },
    include: { plan: { select: { code: true, name: true } }, student: { select: { admissionNo: true, name: true } }, allocations: { select: { amountMinor: true, paymentId: true } }, adjustments: { select: { amountMinor: true, kind: true, reason: true, createdAt: true } }, refundParts: { select: { amountMinor: true } } },
  })
  if (invoiceIds?.length && rows.length !== invoiceIds.length) throw notFound()
  const views = rows.map((r) => invoiceView(r, today))
  return { balance: views.reduce((a, v) => a + v.balanceMinor, 0), currency: views[0]?.currency ?? 'INR' }
}

export async function submit(req: Request, input: SubmitInput) {
  await payerLink(req, input.studentId)
  await consume(LIMIT_SUBMIT, req.auth!.user.id)
  const methods = await availableMethods()
  const s = methods.settings
  const offered = input.method === 'BANK_TRANSFER' ? methods.bank : methods.upi
  if (!offered) throw new AppError(422, 'METHOD_UNAVAILABLE', `The Madarsa does not accept ${METHOD_LABEL[input.method]} payments at the moment.`)
  const proofRequired = input.method === 'BANK_TRANSFER' ? s.bankProofRequired : s.upiProofRequired
  if (proofRequired && !input.proofFileId) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'proofFileId', message: 'Attach the payment confirmation (screenshot or PDF).' }])
  const today = await institutionToday()
  if (input.paidOn > today) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'paidOn', message: 'The payment date cannot be in the future.' }])
  const key = referenceKey(input.reference)
  if (!/^[A-Z0-9]{6,35}$/.test(key)) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'reference', message: 'Enter the UTR or transaction reference (6–35 letters and digits).' }])

  const created = await prisma.$transaction(async (tx) => {
    // Same lock as every other change to this student's money.
    await tx.$queryRaw`SELECT id FROM students WHERE id = ${input.studentId}::uuid FOR UPDATE`
    await assertReferenceFree(tx, key)
    if (input.proofFileId) await attachableProof(tx, req, input.proofFileId)
    const { balance, currency } = await openBalance(tx, input.studentId, input.invoiceIds, today)
    // Claims already waiting for verification count against what is still owed.
    const pending = (await tx.manualPaymentSubmission.aggregate({ where: { studentId: input.studentId, status: { in: ACTIVE } }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0
    if (balance <= 0) throw conflict('NOTHING_DUE', 'There is nothing to pay for these invoices.')
    if (input.amountMinor > balance - pending) {
      throw new AppError(422, 'AMOUNT_EXCEEDS_BALANCE', pending ? `The amount is more than what is still owed after payments waiting for verification (${money(Math.max(0, balance - pending), currency)}).` : `The amount is more than the outstanding balance (${money(balance, currency)}).`, { balanceMinor: balance, pendingMinor: pending })
    }
    let sub
    try {
      sub = await tx.manualPaymentSubmission.create({
        data: { studentId: input.studentId, submittedById: req.auth!.user.id, method: input.method, invoiceIds: input.invoiceIds ?? [], amountMinor: input.amountMinor, currency, paidOn: toDate(input.paidOn), reference: input.reference.trim(), referenceKey: key, note: input.note?.trim() || null, proofFileId: input.proofFileId ?? null },
        include: { student: { select: { name: true } } },
      })
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw conflict('DUPLICATE_REFERENCE', 'This transaction reference has already been submitted. If you think this is a mistake, contact the office.')
      throw err
    }
    await audit({ action: 'fees.manual_payment_submitted', summary: `${code(sub.id)}: ${METHOD_LABEL[sub.method]} of ${money(sub.amountMinor, currency)} reported (ref ${key}); awaiting verification`, entityType: 'manual_payment', entityId: sub.id, metadata: { studentId: sub.studentId } }, req, tx)
    // Worded as a claim under review, never as a successful payment.
    await notifyStudentFamily(tx, sub.studentId, { category: 'FEES', title: 'Payment submitted for verification', body: `${METHOD_LABEL[sub.method]} of ${money(sub.amountMinor, currency)} (ref ${sub.reference}). The fee stays outstanding until the office confirms it.`, link: '/fees' }, { fees: true })
    const staff = await tx.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { in: rolesWith('fees.verify') } } } }, select: { id: true } })
    await notifyUsers(tx, staff.map((u) => u.id), { category: 'FEES', title: 'Payment to verify', body: `${sub.student.name}: ${METHOD_LABEL[sub.method]} of ${money(sub.amountMinor, currency)}, ref ${sub.reference}`, link: '/payment-verification' })
    return sub
  })
  return getSubmission(req, created.id)
}

// ---------- Reading ----------

const INCLUDE = {
  student: { select: { id: true, admissionNo: true, name: true, group: { select: { id: true, code: true, name: true } } } },
  proof: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
  payment: { include: { receipt: true, allocations: { include: { invoice: { select: { number: true, period: true } } } }, refunds: { include: { allocations: true } } } },
} satisfies Prisma.ManualPaymentSubmissionInclude
type Row = Prisma.ManualPaymentSubmissionGetPayload<{ include: typeof INCLUDE }>

async function names(ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))]
  return new Map((await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]))
}

const view = (r: Row, who: Map<string, string>, staff: boolean) => ({
  id: r.id, code: code(r.id), student: { id: r.student.id, admissionNo: r.student.admissionNo, name: r.student.name, ...(staff ? { group: r.student.group } : {}) },
  method: r.method, invoiceIds: r.invoiceIds, amountMinor: r.amountMinor, currency: r.currency, paidOn: isoDate(r.paidOn), reference: r.reference, note: r.note,
  proof: r.proof ? { name: r.proof.originalName, mimeType: r.proof.mimeType, sizeBytes: r.proof.sizeBytes } : null,
  status: r.status, reviewNote: r.reviewNote, reviewedAt: r.reviewedAt, reviewedBy: staff && r.reviewedById ? who.get(r.reviewedById) ?? 'Staff' : r.reviewedById ? 'Madarsa office' : null,
  submittedBy: who.get(r.submittedById) ?? 'Guardian', submittedById: staff ? r.submittedById : undefined, createdAt: r.createdAt,
  approvedAmountMinor: r.approvedAmountMinor, payment: r.payment ? paymentView(r.payment) : null,
})

/** Staff with fee access see every submission; families see their own children's. */
function scopeWhere(req: Request): Prisma.ManualPaymentSubmissionWhereInput | null {
  if (req.auth!.permissions.has('fees.read')) return {}
  const scope = feeScope(req.auth!)
  return scope ? { student: scope } : null
}

export interface ListQuery { status?: ManualPaymentStatus | undefined; method?: ManualPaymentMethod | undefined; studentId?: string | undefined; groupId?: string | undefined; reference?: string | undefined; search?: string | undefined; from?: string | undefined; to?: string | undefined; page: number; pageSize: number }

export async function listSubmissions(req: Request, q: ListQuery) {
  const scope = scopeWhere(req)
  if (!scope) return { total: 0, page: q.page, pageSize: q.pageSize, items: [] }
  const where: Prisma.ManualPaymentSubmissionWhereInput = {
    AND: [
      scope,
      q.status ? { status: q.status } : {},
      q.method ? { method: q.method } : {},
      q.studentId ? { studentId: q.studentId } : {},
      q.groupId ? { student: { groupId: q.groupId } } : {},
      q.reference ? { referenceKey: { contains: referenceKey(q.reference) } } : {},
      q.search ? { student: { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { admissionNo: { contains: q.search, mode: 'insensitive' } }] } } : {},
      q.from ? { createdAt: { gte: toDate(q.from) } } : {},
      q.to ? { createdAt: { lt: new Date(toDate(q.to).getTime() + 86_400_000) } } : {},
    ],
  }
  const [total, rows] = await Promise.all([
    prisma.manualPaymentSubmission.count({ where }),
    prisma.manualPaymentSubmission.findMany({ where, include: INCLUDE, orderBy: [{ createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ])
  const who = await names(rows.flatMap((r) => [r.submittedById, r.reviewedById]))
  const staff = req.auth!.permissions.has('fees.read')
  return { total, page: q.page, pageSize: q.pageSize, items: rows.map((r) => view(r, who, staff)) }
}

async function findVisible(req: Request, id: string) {
  const scope = scopeWhere(req)
  const r = scope && (await prisma.manualPaymentSubmission.findFirst({ where: { AND: [scope, { id }] }, include: INCLUDE }))
  if (!r) throw notFound()
  return r
}

export async function getSubmission(req: Request, id: string) {
  const r = await findVisible(req, id)
  const staff = req.auth!.permissions.has('fees.read')
  const who = await names([r.submittedById, r.reviewedById])
  const out = view(r, who, staff)
  if (!staff) return out
  // Same reference seen before (e.g. rejected earlier): shown so staff can investigate.
  const others = await prisma.manualPaymentSubmission.findMany({ where: { referenceKey: r.referenceKey, id: { not: r.id } }, select: { id: true, status: true, studentId: true, createdAt: true } })
  const history = await prisma.auditLog.findMany({ where: { entityType: 'manual_payment', entityId: r.id }, orderBy: { at: 'asc' }, select: { at: true, action: true, summary: true, actorName: true } })
  return { ...out, sameReference: others.map((o) => ({ code: code(o.id), status: o.status, otherStudent: o.studentId !== r.studentId, createdAt: o.createdAt })), history }
}

export async function proofFile(req: Request, id: string) {
  const r = await findVisible(req, id)
  if (!r.proofFileId) throw notFound()
  const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: r.proofFileId } })
  return { body: await storage().get(f.storageKey), name: f.originalName, mimeType: f.mimeType }
}

// ---------- Reviewing ----------

/** Lock the submission and check it can still be reviewed by this person. */
async function lockForReview(tx: Tx, req: Request, id: string) {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM manual_payment_submissions WHERE id = ${id}::uuid FOR UPDATE`
  if (!row) throw notFound()
  const s = await tx.manualPaymentSubmission.findUniqueOrThrow({ where: { id }, include: { student: { select: { name: true } } } })
  if (!ACTIVE.includes(s.status)) throw conflict('ALREADY_REVIEWED', `This payment was already ${s.status === 'APPROVED' ? 'approved' : 'rejected'}.`)
  // Separation of duties: nobody approves or rejects a payment they reported themselves.
  if (s.submittedById === req.auth!.user.id) throw forbidden('You cannot review a payment you submitted. Ask another member of staff.')
  return s
}

export async function approve(req: Request, id: string, input: { amountMinor?: number | undefined; note?: string | undefined }) {
  const today = await institutionToday()
  const result = await prisma.$transaction(async (tx) => {
    const s = await lockForReview(tx, req, id)
    const amount = input.amountMinor ?? s.amountMinor
    if (amount !== s.amountMinor && !(input.note && input.note.trim().length >= 5)) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'note', message: 'Explain why the amount received differs from the amount reported.' }])
    await assertReferenceFree(tx, s.referenceKey, s.id)
    // The same ledger path as office payments (student lock, oldest invoice first). Money that
    // exceeds the balance at this moment was still received: it is kept unallocated for review.
    let payment
    try {
      payment = await receive(tx, {
        studentId: s.studentId, amountMinor: amount, method: s.method, source: 'VERIFIED', receivedOn: isoDate(s.paidOn)!,
        invoiceIds: s.invoiceIds.length ? s.invoiceIds : undefined, recordedById: req.auth!.user.id, allowUnallocated: true, reference: s.referenceKey,
        note: `${s.method === 'UPI' ? 'UPI' : 'Bank transfer'} ref ${s.reference} · ${code(s.id)}${input.note ? ` · ${input.note.trim()}` : ''}`,
      }, today)
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw conflict('DUPLICATE_REFERENCE', 'A payment with this reference is already in the ledger.')
      throw err
    }
    await tx.manualPaymentSubmission.update({ where: { id }, data: { status: 'APPROVED', reviewedById: req.auth!.user.id, reviewedAt: new Date(), reviewNote: input.note?.trim() || null, approvedAmountMinor: amount, paymentId: payment.id } })
    await audit({ action: 'fees.manual_payment_approved', summary: `${code(id)} approved: ${money(amount, s.currency)} · receipt ${payment.receipt.number}${amount !== s.amountMinor ? ` (reported ${money(s.amountMinor, s.currency)})` : ''}${payment.unallocatedMinor ? ` · ${money(payment.unallocatedMinor, s.currency)} unallocated — review` : ''}`, entityType: 'manual_payment', entityId: id, metadata: { paymentId: payment.id, studentId: s.studentId } }, req, tx)
    await audit({ action: 'fees.payment_recorded', summary: `Receipt ${payment.receipt.number} · ${s.method} · ${money(amount, s.currency)} (verified ${code(id)})`, entityType: 'student', entityId: s.studentId, metadata: { paymentId: payment.id } }, req, tx)
    await notifyStudentFamily(tx, s.studentId, { category: 'FEES', title: 'Payment approved', body: `Your ${METHOD_LABEL[s.method]} of ${money(amount, s.currency)} (ref ${s.reference}) was confirmed. Receipt ${payment.receipt.number}.`, link: '/fees' }, { fees: true })
    return id
  })
  return getSubmission(req, result)
}

export async function reject(req: Request, id: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const s = await lockForReview(tx, req, id)
    await tx.manualPaymentSubmission.update({ where: { id }, data: { status: 'REJECTED', reviewedById: req.auth!.user.id, reviewedAt: new Date(), reviewNote: reason.trim() } })
    await audit({ action: 'fees.manual_payment_rejected', summary: `${code(id)} rejected: ${reason.trim()}`, entityType: 'manual_payment', entityId: id, metadata: { studentId: s.studentId } }, req, tx)
    await notifyStudentFamily(tx, s.studentId, { category: 'FEES', title: 'Payment could not be verified', body: `${METHOD_LABEL[s.method]} of ${money(s.amountMinor, s.currency)} (ref ${s.reference}): ${reason.trim()} The fee is still outstanding; you can submit the payment again.`, link: '/fees' }, { fees: true })
  })
  return getSubmission(req, id)
}

export async function requestInfo(req: Request, id: string, message: string) {
  await prisma.$transaction(async (tx) => {
    const s = await lockForReview(tx, req, id)
    await tx.manualPaymentSubmission.update({ where: { id }, data: { status: 'NEEDS_INFO', reviewedById: req.auth!.user.id, reviewedAt: new Date(), reviewNote: message.trim() } })
    await audit({ action: 'fees.manual_payment_info_requested', summary: `${code(id)}: more information requested — ${message.trim()}`, entityType: 'manual_payment', entityId: id, metadata: { studentId: s.studentId } }, req, tx)
    await notifyStudentFamily(tx, s.studentId, { category: 'FEES', title: 'More information needed for your payment', body: `Ref ${s.reference}: ${message.trim()}`, link: '/fees' }, { fees: true })
  })
  return getSubmission(req, id)
}

/** The payer answers a request for more information; the submission goes back for verification. */
export async function respond(req: Request, id: string, input: { note?: string | undefined; reference?: string | undefined; proofFileId?: string | undefined }) {
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM manual_payment_submissions WHERE id = ${id}::uuid FOR UPDATE`
    const s = row && (await tx.manualPaymentSubmission.findUnique({ where: { id } }))
    if (!s) throw notFound()
    await payerLink(req, s.studentId)
    if (s.status !== 'NEEDS_INFO') throw conflict('NOT_AWAITING_INFO', 'This payment is not waiting for more information.')
    const data: Prisma.ManualPaymentSubmissionUpdateInput = { status: 'PENDING_VERIFICATION' }
    if (input.reference) {
      const key = referenceKey(input.reference)
      if (!/^[A-Z0-9]{6,35}$/.test(key)) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'reference', message: 'Enter the UTR or transaction reference (6–35 letters and digits).' }])
      await assertReferenceFree(tx, key, s.id)
      data.reference = input.reference.trim()
      data.referenceKey = key
    }
    if (input.note) data.note = [s.note, `Reply: ${input.note.trim()}`].filter(Boolean).join('\n')
    if (input.proofFileId) {
      if (s.proofFileId) throw conflict('PROOF_EXISTS', 'A proof is already attached. Add a note instead.')
      await attachableProof(tx, req, input.proofFileId)
      data.proof = { connect: { id: input.proofFileId } }
    }
    await tx.manualPaymentSubmission.update({ where: { id }, data })
    await audit({ action: 'fees.manual_payment_info_provided', summary: `${code(id)}: guardian replied${input.reference ? ' (reference changed)' : ''}${input.proofFileId ? ' (proof added)' : ''}`, entityType: 'manual_payment', entityId: id, metadata: { studentId: s.studentId } }, req, tx)
  })
  return getSubmission(req, id)
}
