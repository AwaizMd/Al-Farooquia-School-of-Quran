import type { Request } from 'express'
import { randomBytes } from 'node:crypto'
import { AppError, conflict, forbidden, notFound } from '../../common/errors.js'
import { institutionToday } from '../../common/clock.js'
import { logger } from '../../common/logger.js'
import { prisma } from '../../database/prisma.js'
import { availableMethods, devGateway, gateway, markWebhookVerified } from '../payment-settings/settings.service.js'
import type { ProviderEvent } from '../../integrations/payments/provider.js'
import { audit } from '../audit-logs/audit.service.js'
import { invoiceView, receive } from './fees.service.js'
import { notifyStudentFamily } from '../notifications/notify.service.js'

const ATTEMPT_TTL_MS = 30 * 60 * 1000
const SYSTEM = { userId: null, name: 'Payment gateway', role: 'system' }

const attemptView = (a: { id: string; reference: string; status: string; amountMinor: number; currency: string; provider: string; expiresAt: Date; failureReason: string | null; payment?: { receipt: { number: string } } | null }) => ({
  id: a.id, reference: a.reference, status: a.status, amountMinor: a.amountMinor, currency: a.currency, provider: a.provider, expiresAt: a.expiresAt, failureReason: a.failureReason, receiptNo: a.payment?.receipt.number ?? null,
})

/**
 * Start an online payment. The amount is the server's own balance of the chosen
 * invoices; nothing the browser sends can change it.
 */
export async function createAttempt(req: Request, input: { studentId: string; invoiceIds?: string[] | undefined }) {
  const methods = await availableMethods()
  const provider = methods.online ? await gateway(methods.settings) : null
  if (!provider) throw new AppError(503, 'PAYMENTS_DISABLED', 'Online payment is not offered by the Madarsa. Use another payment method or pay at the office.')
  const auth = req.auth!
  // Only a guardian linked to this student with permission to pay.
  const link = await prisma.studentGuardian.findFirst({ where: { studentId: input.studentId, canPay: true, guardian: { userId: auth.user.id } } })
  if (!link) {
    const canSee = await prisma.studentGuardian.count({ where: { studentId: input.studentId, guardian: { userId: auth.user.id } } })
    throw canSee ? forbidden('Your account is not set up to pay fees for this student.') : notFound()
  }
  const today = await institutionToday()
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM students WHERE id = ${input.studentId}::uuid FOR UPDATE`
    const rows = await tx.invoice.findMany({
      where: { studentId: input.studentId, status: 'ISSUED', ...(input.invoiceIds?.length ? { id: { in: input.invoiceIds } } : {}) },
      include: { plan: { select: { code: true, name: true } }, student: { select: { admissionNo: true, name: true } }, allocations: { select: { amountMinor: true, paymentId: true } }, adjustments: { select: { amountMinor: true, kind: true, reason: true, createdAt: true } }, refundParts: { select: { amountMinor: true } } },
    })
    if (input.invoiceIds?.length && rows.length !== input.invoiceIds.length) throw notFound()
    const open = rows.map((r) => invoiceView(r, today)).filter((v) => v.balanceMinor > 0)
    const amountMinor = open.reduce((a, v) => a + v.balanceMinor, 0)
    if (amountMinor <= 0) throw conflict('NOTHING_DUE', 'There is nothing to pay for these invoices.')
    // A new checkout replaces any unfinished one for this student.
    await tx.paymentAttempt.updateMany({ where: { studentId: input.studentId, status: { in: ['CREATED', 'PENDING'] } }, data: { status: 'EXPIRED', failureReason: 'replaced' } })
    return tx.paymentAttempt.create({
      data: { reference: `PA-${randomBytes(6).toString('hex').toUpperCase()}`, studentId: input.studentId, payerUserId: auth.user.id, invoiceIds: open.map((v) => v.id), amountMinor, currency: open[0]!.currency, provider: provider.name, expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS) },
    })
  })
  let order
  try {
    order = await provider.createOrder({ reference: attempt.reference, amountMinor: attempt.amountMinor, currency: attempt.currency, description: `Fees ${attempt.reference}` })
  } catch (err) {
    logger.error({ err, attempt: attempt.id }, 'Payment gateway order creation failed')
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: 'gateway_unavailable' } })
    throw new AppError(502, 'GATEWAY_UNAVAILABLE', 'The payment gateway is not responding. Please try again later.')
  }
  const updated = await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'PENDING', providerOrderId: order.providerOrderId } })
  await audit({ action: 'fees.online_payment_started', summary: `Checkout ${updated.reference} for ${(updated.amountMinor / 100).toFixed(2)} ${updated.currency}`, entityType: 'student', entityId: input.studentId, metadata: { attemptId: updated.id } }, req)
  return { ...attemptView(updated), checkout: order.checkout }
}

export async function getAttempt(req: Request, id: string) {
  const a = await prisma.paymentAttempt.findUnique({ where: { id }, include: { payment: { include: { receipt: true } } } })
  if (!a || (a.payerUserId !== req.auth!.user.id && !req.auth!.permissions.has('fees.read'))) throw notFound()
  if ((a.status === 'PENDING' || a.status === 'CREATED') && a.expiresAt < new Date()) {
    // Shown as expired; a late gateway confirmation is still honoured by the webhook.
    return { ...attemptView(a), status: 'EXPIRED' }
  }
  return attemptView(a)
}

/**
 * Provider callback. Only a verified signature counts, each event is processed
 * once (unique event id), and money is matched against the attempt amount.
 */
export async function handleWebhook(providerName: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
  // Webhooks are honoured even if online payment was switched off later: money may already be taken.
  const provider = await gateway()
  if (!provider || provider.name !== providerName) throw notFound()
  const event = provider.verifyWebhook(rawBody, headers)
  if (!event) {
    logger.warn({ provider: providerName }, 'Rejected payment webhook with an invalid signature')
    throw new AppError(400, 'INVALID_SIGNATURE', 'Signature verification failed.')
  }
  if (provider.name === 'razorpay') await markWebhookVerified()
  try {
    await prisma.webhookEvent.create({ data: { provider: providerName, eventId: event.eventId, type: event.type, signatureValid: true, payload: JSON.parse(JSON.stringify(event.stored)) } })
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err
    // Seen before. If it was processed, this is a replay. If processing failed (the
    // gateway then retries), process it again: processEvent is idempotent per attempt.
    const seen = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: providerName, eventId: event.eventId } } })
    if (seen?.processedAt) return { duplicate: true }
  }
  const result = await processEvent(event)
  await prisma.webhookEvent.update({ where: { provider_eventId: { provider: providerName, eventId: event.eventId } }, data: { processedAt: new Date(), result } })
  return { duplicate: false, result }
}

async function processEvent(event: ProviderEvent): Promise<string> {
  if (event.type !== 'payment.succeeded' && event.type !== 'payment.failed') return 'ignored'
  if (!event.providerOrderId) return 'no_order'
  const today = await institutionToday()
  return prisma.$transaction(async (tx) => {
    const found = await tx.paymentAttempt.findUnique({ where: { providerOrderId: event.providerOrderId } })
    if (!found) return 'unknown_order'
    await tx.$queryRaw`SELECT id FROM payment_attempts WHERE id = ${found.id}::uuid FOR UPDATE`
    const attempt = (await tx.paymentAttempt.findUnique({ where: { id: found.id } }))!
    if (attempt.status === 'SUCCEEDED') return 'already_succeeded' // a second "paid" event never credits twice
    if (event.type === 'payment.failed') {
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: 'declined', providerPaymentId: event.providerPaymentId ?? null } })
      return 'failed'
    }
    if (event.amountMinor !== attempt.amountMinor || (event.currency ?? '').toUpperCase() !== attempt.currency) {
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', failureReason: 'amount_mismatch', providerPaymentId: event.providerPaymentId ?? null } })
      await audit({ action: 'fees.payment_amount_mismatch', summary: `Gateway reported ${event.amountMinor} ${event.currency} for ${attempt.reference} (expected ${attempt.amountMinor} ${attempt.currency}); not credited`, entityType: 'student', entityId: attempt.studentId, actor: SYSTEM }, undefined, tx)
      return 'amount_mismatch'
    }
    // Money was taken: record it even if the balance changed meanwhile (excess is left for review).
    const payment = await receive(tx, { studentId: attempt.studentId, amountMinor: attempt.amountMinor, method: 'ONLINE', source: 'ONLINE', receivedOn: today, invoiceIds: attempt.invoiceIds, paymentAttemptId: attempt.id, allowUnallocated: true, recordedById: null, reference: event.providerPaymentId }, today)
    await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCEEDED', providerPaymentId: event.providerPaymentId ?? null } })
    await notifyStudentFamily(tx, attempt.studentId, { category: 'FEES', title: 'Online payment confirmed', body: `Receipt ${payment.receipt.number} · ${(payment.amountMinor / 100).toFixed(2)} ${payment.currency}`, link: '/fees' }, { fees: true })
    await audit({ action: 'fees.online_payment_confirmed', summary: `Receipt ${payment.receipt.number} · ${(payment.amountMinor / 100).toFixed(2)} ${payment.currency} confirmed by the gateway${payment.unallocatedMinor ? ` (${(payment.unallocatedMinor / 100).toFixed(2)} unallocated — review)` : ''}`, entityType: 'student', entityId: attempt.studentId, actor: SYSTEM, metadata: { attemptId: attempt.id, paymentId: payment.id } }, undefined, tx)
    return payment.unallocatedMinor ? 'succeeded_with_unallocated' : 'succeeded'
  })
}

/** Development only: play the gateway and send the signed event the real one would. */
export async function devComplete(req: Request, attemptId: string, outcome: 'success' | 'failure') {
  const gateway = devGateway()
  if (!gateway) throw notFound()
  const a = await prisma.paymentAttempt.findUnique({ where: { id: attemptId } })
  if (!a || a.payerUserId !== req.auth!.user.id || !a.providerOrderId) throw notFound()
  const { raw, headers } = gateway.signedEvent({
    id: `evt_${randomBytes(8).toString('hex')}`, type: outcome === 'success' ? 'payment.succeeded' : 'payment.failed',
    orderId: a.providerOrderId, paymentId: `dev_pay_${randomBytes(6).toString('hex')}`, amountMinor: a.amountMinor, currency: a.currency,
  })
  await handleWebhook('dev', raw, headers)
  return getAttempt(req, attemptId)
}

/**
 * Razorpay checkout callback. The browser only hands over ids and a signature:
 * the signature is checked, then the payment is fetched from Razorpay itself, and
 * only a captured payment for this order (with the right amount, checked in
 * processEvent) is credited. Anything else waits for the signed webhook.
 */
export async function verifyCheckout(req: Request, attemptId: string, input: { orderId: string; paymentId: string; signature: string }) {
  const a = await prisma.paymentAttempt.findUnique({ where: { id: attemptId } })
  if (!a || a.payerUserId !== req.auth!.user.id || !a.providerOrderId) throw notFound()
  const provider = await gateway()
  if (!provider || provider.name !== a.provider || !provider.verifyCheckout || !provider.fetchPayment) throw conflict('VERIFY_UNAVAILABLE', 'This payment is confirmed by the gateway’s notification.')
  if (input.orderId !== a.providerOrderId || !provider.verifyCheckout(a.providerOrderId, input.paymentId, input.signature)) {
    await audit({ action: 'fees.checkout_signature_invalid', summary: `Checkout for ${a.reference} returned an invalid signature`, entityType: 'student', entityId: a.studentId, metadata: { attemptId } }, req)
    throw new AppError(400, 'INVALID_SIGNATURE', 'The payment could not be verified.')
  }
  let p
  try {
    p = await provider.fetchPayment(input.paymentId)
  } catch (err) {
    logger.warn({ err, attempt: a.id }, 'Could not fetch the payment from the gateway')
    return { ...(await getAttempt(req, attemptId)), note: 'The gateway could not be reached; the payment will be confirmed when its notification arrives.' }
  }
  if (p.orderId !== a.providerOrderId) throw new AppError(400, 'INVALID_SIGNATURE', 'The payment could not be verified.')
  const type = p.status === 'captured' ? 'payment.succeeded' : p.status === 'failed' ? 'payment.failed' : null
  if (type) await processEvent({ eventId: `checkout:${p.id}`, type, providerOrderId: p.orderId, providerPaymentId: p.id, amountMinor: p.amountMinor, currency: p.currency, stored: {} })
  return getAttempt(req, attemptId)
}
