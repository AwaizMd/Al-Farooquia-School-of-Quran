import type { Request } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import type { AdjustmentKind, PaymentMethod, PaymentSource } from '../../generated/prisma/enums.js'
import { AppError, conflict, forbidden, notFound } from '../../common/errors.js'
import { addDaysIso, institutionToday } from '../../common/clock.js'
import { prisma } from '../../database/prisma.js'
import type { AuthContext } from '../../types/express.js'
import { audit } from '../audit-logs/audit.service.js'
import { notifyStudentFamily } from '../notifications/notify.service.js'
import { isoDate, toDate } from '../students/students.service.js'

type Tx = Prisma.TransactionClient
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Students whose fees the caller may see: administration and the Principal (read),
 * guardians linked with fee access, and the student themself.
 */
export function feeScope(auth: AuthContext): Prisma.StudentWhereInput | null {
  if (auth.permissions.has('fees.read')) return {}
  const or: Prisma.StudentWhereInput[] = []
  if (auth.roles.includes('PARENT')) or.push({ guardians: { some: { canViewFees: true, guardian: { userId: auth.user.id } } } })
  if (auth.roles.includes('STUDENT')) or.push({ userId: auth.user.id })
  return or.length ? { OR: or } : null
}

// ---------- Balances (always computed from stored records) ----------

const BALANCE_INCLUDE = {
  plan: { select: { code: true, name: true } },
  student: { select: { admissionNo: true, name: true } },
  allocations: { select: { amountMinor: true, paymentId: true } },
  adjustments: { select: { amountMinor: true, kind: true, reason: true, createdAt: true } },
  refundParts: { select: { amountMinor: true } },
} satisfies Prisma.InvoiceInclude
type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof BALANCE_INCLUDE }>

const sum = (xs: { amountMinor: number }[]) => xs.reduce((a, x) => a + x.amountMinor, 0)

export function invoiceView(i: InvoiceRow, today: string) {
  const adjusted = sum(i.adjustments)
  const paid = sum(i.allocations) - sum(i.refundParts)
  const due = i.status === 'VOID' ? 0 : i.amountMinor - adjusted
  const balance = Math.max(0, due - paid)
  const dueDate = isoDate(i.dueDate)!
  return {
    id: i.id, number: i.number, studentId: i.studentId, admissionNo: i.student.admissionNo, period: i.period, plan: i.plan, currency: i.currency, status: i.status,
    grossMinor: i.grossMinor, discountMinor: i.discountMinor, amountMinor: i.amountMinor, adjustedMinor: adjusted, dueMinor: due, paidMinor: paid, balanceMinor: balance,
    issuedOn: isoDate(i.issuedOn), dueDate, overdue: balance > 0 && dueDate < today, adjustments: i.adjustments,
  }
}

/** Open (unpaid) invoices of a student, oldest due first — the order payments are applied in. */
async function openInvoices(tx: Tx, studentId: string, today: string, only?: string[]) {
  const rows = await tx.invoice.findMany({ where: { studentId, status: 'ISSUED', ...(only ? { id: { in: only } } : {}) }, include: BALANCE_INCLUDE, orderBy: [{ dueDate: 'asc' }, { period: 'asc' }] })
  return rows.map((r) => invoiceView(r, today)).filter((v) => v.balanceMinor > 0)
}

export async function studentFees(req: Request, ref: string) {
  const scope = feeScope(req.auth!)
  const s = scope && (await prisma.student.findFirst({ where: { AND: [scope, UUID.test(ref) ? { id: ref } : { admissionNo: ref }] }, select: { id: true, admissionNo: true, name: true } }))
  if (!s) throw notFound()
  const today = await institutionToday()
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { studentId: s.id }, include: BALANCE_INCLUDE, orderBy: { period: 'desc' } }),
    prisma.payment.findMany({ where: { studentId: s.id }, include: { receipt: true, allocations: { include: { invoice: { select: { number: true, period: true } } } }, refunds: { include: { allocations: true } } }, orderBy: { createdAt: 'desc' } }),
  ])
  const views = invoices.map((i) => invoiceView(i, today))
  return {
    student: s,
    currency: views[0]?.currency ?? (await prisma.institutionSettings.findUnique({ where: { id: 1 } }))?.currency ?? 'INR',
    totals: {
      dueMinor: views.reduce((a, v) => a + v.dueMinor, 0),
      paidMinor: views.reduce((a, v) => a + v.paidMinor, 0),
      balanceMinor: views.reduce((a, v) => a + v.balanceMinor, 0),
      overdueMinor: views.filter((v) => v.overdue).reduce((a, v) => a + v.balanceMinor, 0),
    },
    invoices: views,
    payments: payments.map(paymentView),
  }
}

type PaymentRow = Prisma.PaymentGetPayload<{ include: { receipt: true; allocations: { include: { invoice: { select: { number: true; period: true } } } }; refunds: { include: { allocations: true } } } }>
export const paymentView = (p: PaymentRow) => ({
  id: p.id, receiptNo: p.receipt.number, receivedOn: isoDate(p.receivedOn), method: p.method, source: p.source, amountMinor: p.amountMinor, unallocatedMinor: p.unallocatedMinor, currency: p.currency, note: p.note,
  allocations: p.allocations.map((a) => ({
    invoiceId: a.invoiceId, invoiceNumber: a.invoice.number, period: a.invoice.period, amountMinor: a.amountMinor,
    refundedMinor: p.refunds.filter((r) => r.status !== 'FAILED').flatMap((r) => r.allocations).filter((x) => x.invoiceId === a.invoiceId).reduce((t, x) => t + x.amountMinor, 0),
  })),
  refunds: p.refunds.map((r) => ({ id: r.id, amountMinor: r.amountMinor, reason: r.reason, status: r.status, createdAt: r.createdAt })),
})

/** All invoices and payments the caller may see (for the fee screens and reports). */
export async function listFees(req: Request) {
  const scope = feeScope(req.auth!)
  if (!scope) return { currency: 'INR', invoices: [], payments: [] }
  const today = await institutionToday()
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { student: scope }, include: BALANCE_INCLUDE, orderBy: { period: 'asc' } }),
    prisma.payment.findMany({ where: { student: scope }, include: { receipt: true, allocations: { include: { invoice: { select: { number: true, period: true } } } }, refunds: { include: { allocations: true } }, student: { select: { admissionNo: true } } }, orderBy: { createdAt: 'asc' } }),
  ])
  const recorders = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(payments.map((p) => p.recordedById).filter((x): x is string => !!x))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]))
  return {
    currency: invoices[0]?.currency ?? 'INR',
    invoices: invoices.map((i) => invoiceView(i, today)),
    payments: payments.map((p) => ({ ...paymentView(p), admissionNo: p.student.admissionNo, recordedBy: p.recordedById ? recorders.get(p.recordedById) ?? 'Office' : 'Online payment' })),
  }
}

// ---------- Receipts ----------

/** Financial year (April–March) a date falls in, named by its starting year. */
export const fiscalYearOf = (iso: string) => (Number(iso.slice(5, 7)) >= 4 ? Number(iso.slice(0, 4)) : Number(iso.slice(0, 4)) - 1)

/** Next receipt number. The counter row is updated inside the caller's transaction, so numbers are gapless. */
async function nextReceiptNumber(tx: Tx, today: string) {
  const fy = fiscalYearOf(today)
  const [row] = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO receipt_sequences ("fiscalYear", "last") VALUES (${fy}, 1)
    ON CONFLICT ("fiscalYear") DO UPDATE SET "last" = receipt_sequences."last" + 1
    RETURNING "last"`
  return `NR-${fy}-${String(row!.last).padStart(4, '0')}`
}

// ---------- Recording money ----------

export interface Receive {
  studentId: string
  amountMinor: number
  method: PaymentMethod
  source: PaymentSource
  receivedOn: string
  note?: string | null | undefined
  invoiceIds?: string[] | undefined
  recordedById?: string | null | undefined
  paymentAttemptId?: string | undefined
  /** Online money already taken: record it even if it exceeds the current balance (excess left unallocated for review). */
  allowUnallocated?: boolean | undefined
}

/**
 * Apply money to open invoices, oldest due first. Runs inside the caller's
 * transaction after the student row has been locked, so concurrent payments
 * for the same student can never allocate the same balance twice.
 */
export async function receive(tx: Tx, r: Receive, today: string) {
  await tx.$queryRaw`SELECT id FROM students WHERE id = ${r.studentId}::uuid FOR UPDATE`
  const open = await openInvoices(tx, r.studentId, today, r.invoiceIds)
  const balance = open.reduce((a, i) => a + i.balanceMinor, 0)
  if (r.amountMinor > balance && !r.allowUnallocated) {
    throw new AppError(409, 'OVERPAYMENT', `The amount is more than the outstanding balance (${(balance / 100).toFixed(2)}).`, { balanceMinor: balance })
  }
  const allocations: { invoiceId: string; amountMinor: number }[] = []
  let left = r.amountMinor
  for (const inv of open) {
    if (left <= 0) break
    const take = Math.min(left, inv.balanceMinor)
    allocations.push({ invoiceId: inv.id, amountMinor: take })
    left -= take
  }
  const receipt = await tx.receipt.create({ data: { number: await nextReceiptNumber(tx, today) } })
  const currency = open[0]?.currency ?? (await tx.invoice.findFirst({ where: { studentId: r.studentId }, select: { currency: true } }))?.currency ?? 'INR'
  const payment = await tx.payment.create({
    data: {
      studentId: r.studentId, receiptId: receipt.id, amountMinor: r.amountMinor, unallocatedMinor: left, currency, method: r.method, source: r.source,
      receivedOn: toDate(r.receivedOn), recordedById: r.recordedById ?? null, note: r.note?.trim() || null, paymentAttemptId: r.paymentAttemptId ?? null,
      allocations: { create: allocations },
    },
    include: { receipt: true, allocations: { include: { invoice: { select: { number: true, period: true } } } }, refunds: { include: { allocations: true } } },
  })
  return payment
}

export async function recordManualPayment(req: Request, input: { studentId: string; amountMinor: number; method: Exclude<PaymentMethod, 'ONLINE'>; receivedOn?: string | undefined; note?: string | undefined; invoiceIds?: string[] | undefined }) {
  const today = await institutionToday()
  const receivedOn = input.receivedOn ?? today
  if (receivedOn > today) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'receivedOn', message: 'The payment date cannot be in the future.' }])
  const student = await prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true, name: true } })
  if (!student) throw notFound()
  const payment = await prisma.$transaction(async (tx) => {
    const p = await receive(tx, { ...input, receivedOn, source: 'MANUAL', recordedById: req.auth!.user.id }, today)
    await notifyStudentFamily(tx, student.id, { category: 'FEES', title: `Payment received for ${student.name.split(' ')[0]}`, body: `Receipt ${p.receipt.number} · ${(p.amountMinor / 100).toFixed(2)} ${p.currency} · ${input.method.replace('_', ' ').toLowerCase()}`, link: '/fees' }, { fees: true })
    await audit({ action: 'fees.payment_recorded', summary: `Receipt ${p.receipt.number} · ${input.method} · ${(p.amountMinor / 100).toFixed(2)} ${p.currency}`, entityType: 'student', entityId: student.id, metadata: { paymentId: p.id, allocations: p.allocations.map((a) => ({ invoice: a.invoice.number, amountMinor: a.amountMinor })) } }, req, tx)
    return p
  })
  return paymentView(payment)
}

// ---------- Invoicing ----------

/** Concession discount, rounded to the nearest 10 rupees (the existing fee rule). */
export const discountFor = (grossMinor: number, percent: number) => (percent >= 100 ? grossMinor : Math.round((grossMinor * percent) / 100 / 1000) * 1000)

/**
 * Issue invoices for a period to every active student with a fee plan (idempotent:
 * a student never gets two invoices for the same period and plan).
 */
export async function issueInvoices(actor: Request | null, period: string, onlyStudentId?: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AppError(422, 'VALIDATION_FAILED', 'Use a period like 2026-10.')
  const today = await institutionToday()
  const settings = await prisma.institutionSettings.findUnique({ where: { id: 1 } })
  const dueDay = String(settings?.feeDueDay ?? 10).padStart(2, '0')
  // Anyone admitted by the last day of the period is billed for it (day 0 of the next month).
  const [y, m] = period.split('-').map(Number)
  const periodEnd = new Date(Date.UTC(y!, m!, 0))
  const students = await prisma.student.findMany({
    where: { status: 'ACTIVE', feePlanId: { not: null }, ...(onlyStudentId ? { id: onlyStudentId } : {}), admissionDate: { lte: periodEnd } },
    include: { feePlan: true, concessions: { where: { endedAt: null } } },
  })
  let created = 0
  for (const s of students) {
    const plan = s.feePlan!
    const pct = s.concessions[0]?.percent ?? 0
    if (pct >= 100) continue // fully sponsored: no invoice
    const exists = await prisma.invoice.findUnique({ where: { studentId_period_planId: { studentId: s.id, period, planId: plan.id } } })
    if (exists) continue
    const discount = discountFor(plan.amountMinor, pct)
    const issuedOn = today < `${period}-01` ? `${period}-01` : today
    const scheduled = `${period}-${dueDay}`
    // Issued after the usual due day (e.g. a mid-month admission): a week to pay.
    const dueDate = issuedOn > scheduled ? addDaysIso(issuedOn, 7) : scheduled
    const clash = await prisma.invoice.count({ where: { studentId: s.id, period } })
    try {
      await prisma.invoice.create({
        data: {
          number: `INV-${period.replace('-', '')}-${s.admissionNo}${clash ? `-${plan.code}` : ''}`, studentId: s.id, period, planId: plan.id, currency: plan.currency,
          grossMinor: plan.amountMinor, discountMinor: discount, amountMinor: plan.amountMinor - discount, issuedOn: toDate(issuedOn), dueDate: toDate(dueDate),
        },
      })
      created++
    } catch (err) {
      // A concurrent run issued it first: that is the desired outcome.
      if ((err as { code?: string }).code !== 'P2002') throw err
    }
  }
  if (created) await audit({ action: 'fees.invoices_issued', summary: `${created} invoice(s) issued for ${period}`, entityType: 'invoice', ...(actor ? {} : { actor: { userId: null, name: 'Scheduler', role: 'system' } }), metadata: { period, created } }, actor ?? undefined)
  return { period, created, considered: students.length }
}

export async function adjustInvoice(req: Request, invoiceId: string, input: { amountMinor: number; kind: AdjustmentKind; reason: string }) {
  const today = await institutionToday()
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { studentId: true, number: true } })
    if (!inv) throw notFound()
    await tx.$queryRaw`SELECT id FROM students WHERE id = ${inv.studentId}::uuid FOR UPDATE`
    const [view] = (await tx.invoice.findMany({ where: { id: invoiceId }, include: BALANCE_INCLUDE })).map((i) => invoiceView(i, today))
    if (view!.status === 'VOID') throw conflict('INVOICE_VOID', 'This invoice is void.')
    if (input.amountMinor > view!.balanceMinor) throw new AppError(409, 'ADJUSTMENT_TOO_LARGE', 'An adjustment cannot exceed the outstanding balance.', { balanceMinor: view!.balanceMinor })
    await tx.feeAdjustment.create({ data: { invoiceId, kind: input.kind, amountMinor: input.amountMinor, reason: input.reason, approvedById: req.auth!.user.id } })
    await audit({ action: 'fees.invoice_adjusted', summary: `${inv.number}: ${input.kind.toLowerCase()} of ${(input.amountMinor / 100).toFixed(2)} — ${input.reason}`, entityType: 'invoice', entityId: invoiceId }, req, tx)
    return invoiceView((await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: BALANCE_INCLUDE })), today)
  })
}

export async function voidInvoice(req: Request, invoiceId: string, reason: string) {
  const today = await institutionToday()
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: BALANCE_INCLUDE })
    if (!inv) throw notFound()
    if (inv.status === 'VOID') throw conflict('INVOICE_VOID', 'This invoice is already void.')
    if (inv.allocations.length || inv.adjustments.length) throw conflict('INVOICE_HAS_ACTIVITY', 'An invoice with payments or adjustments cannot be voided. Use an adjustment or refund.')
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'VOID', voidReason: reason } })
    await audit({ action: 'fees.invoice_voided', summary: `${inv.number} voided — ${reason}`, entityType: 'invoice', entityId: invoiceId }, req, tx)
    return invoiceView((await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: BALANCE_INCLUDE })), today)
  })
}

/**
 * Refund part or all of a payment. Unallocated money is refunded first, then the
 * most recent invoice allocations, whose balances become due again.
 */
export async function refundPayment(req: Request, paymentId: string, input: { amountMinor: number; reason: string }, providerRefund?: (providerPaymentId: string, amountMinor: number) => Promise<{ status: 'COMPLETED' | 'PENDING' | 'FAILED'; providerRef?: string | undefined }>) {
  const found = await prisma.payment.findUnique({ where: { id: paymentId }, include: { attempt: true } })
  if (!found) throw notFound()
  const online = found.source === 'ONLINE'
  const providerPaymentId = found.attempt?.providerPaymentId
  if (online && (!providerRefund || !providerPaymentId)) throw conflict('REFUND_UNAVAILABLE', 'This online payment cannot be refunded automatically. Refund it from the gateway dashboard and record it here.')

  // Check and reserve the refund under the student lock, re-reading the payment there,
  // so concurrent refunds can never add up to more than the payment.
  const refund = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM students WHERE id = ${found.studentId}::uuid FOR UPDATE`
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: { include: { invoice: { select: { dueDate: true } } } }, refunds: { include: { allocations: true } } } })
    const refunded = payment.refunds.filter((r) => r.status !== 'FAILED').reduce((a, r) => a + r.amountMinor, 0)
    if (input.amountMinor > payment.amountMinor - refunded) throw new AppError(409, 'REFUND_TOO_LARGE', 'The refund is more than what remains of this payment.', { refundableMinor: payment.amountMinor - refunded })
    // What is still allocated per invoice after earlier refunds.
    const refundedPerInvoice = new Map<string, number>()
    for (const r of payment.refunds) if (r.status !== 'FAILED') for (const a of r.allocations) refundedPerInvoice.set(a.invoiceId, (refundedPerInvoice.get(a.invoiceId) ?? 0) + a.amountMinor)
    const unallocatedLeft = payment.unallocatedMinor - payment.refunds.filter((r) => r.status !== 'FAILED').reduce((a, r) => a + r.amountMinor - r.allocations.reduce((x, y) => x + y.amountMinor, 0), 0)
    let left = input.amountMinor - Math.min(input.amountMinor, Math.max(0, unallocatedLeft))
    const parts: { invoiceId: string; amountMinor: number }[] = []
    for (const a of [...payment.allocations].sort((x, y) => y.invoice.dueDate.getTime() - x.invoice.dueDate.getTime())) {
      if (left <= 0) break
      const remaining = a.amountMinor - (refundedPerInvoice.get(a.invoiceId) ?? 0)
      const take = Math.min(left, remaining)
      if (take > 0) parts.push({ invoiceId: a.invoiceId, amountMinor: take })
      left -= take
    }
    // Online refunds stay PENDING (reserved) until the gateway answers.
    const r = await tx.refund.create({ data: { paymentId, amountMinor: input.amountMinor, reason: input.reason, status: online ? 'PENDING' : 'COMPLETED', createdById: req.auth!.user.id, allocations: { create: parts } } })
    if (!online) await audit({ action: 'fees.refund', summary: `Refund of ${(input.amountMinor / 100).toFixed(2)} (completed) — ${input.reason}`, entityType: 'student', entityId: payment.studentId, metadata: { paymentId, refundId: r.id } }, req, tx)
    return r
  })
  if (!online) return { id: refund.id, status: refund.status, amountMinor: refund.amountMinor }

  let status: 'COMPLETED' | 'PENDING' | 'FAILED'
  try {
    const r = await providerRefund!(providerPaymentId!, input.amountMinor)
    status = r.status
    if (status === 'FAILED') {
      // Release the reservation: the balance goes back to what it was.
      await prisma.$transaction([prisma.refundAllocation.deleteMany({ where: { refundId: refund.id } }), prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } })])
    } else {
      await prisma.refund.update({ where: { id: refund.id }, data: { status, providerRef: r.providerRef ?? null } })
    }
  } catch (err) {
    // Unknown outcome (e.g. the gateway timed out): keep it PENDING for the office to check.
    await audit({ action: 'fees.refund', summary: `Refund of ${(input.amountMinor / 100).toFixed(2)} sent to the gateway with no answer; check the gateway dashboard — ${input.reason}`, entityType: 'student', entityId: found.studentId, metadata: { paymentId, refundId: refund.id } }, req)
    throw err
  }
  await audit({ action: 'fees.refund', summary: `Refund of ${(input.amountMinor / 100).toFixed(2)} (${status.toLowerCase()}) — ${input.reason}`, entityType: 'student', entityId: found.studentId, metadata: { paymentId, refundId: refund.id } }, req)
  if (status === 'FAILED') throw new AppError(502, 'REFUND_FAILED', 'The payment gateway declined the refund. Nothing was changed.')
  return { id: refund.id, status, amountMinor: refund.amountMinor }
}

export function assertCanPay(auth: AuthContext) {
  if (!auth.roles.includes('PARENT')) throw forbidden('Only a linked guardian can pay online.')
}
