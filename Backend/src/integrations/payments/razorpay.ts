import { createHmac } from 'node:crypto'
import { safeEqual } from '../../common/crypto.js'
import { header, type PaymentProvider } from './provider.js'

/**
 * Razorpay adapter (Orders API + webhooks). Signature verification is covered by
 * tests; order creation and refunds call Razorpay's API and have NOT been
 * exercised against a live account yet. Verify in Razorpay test mode first.
 * Docs: https://razorpay.com/docs/api/orders/ and /webhooks/validate-test/
 */
export function razorpayProvider(cfg: { keyId: string; keySecret: string; webhookSecret: string; apiBase?: string }): PaymentProvider {
  const base = cfg.apiBase ?? 'https://api.razorpay.com/v1'
  const auth = `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`
  const call = async (path: string, body: object) => {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new Error(`Razorpay ${path} failed with HTTP ${res.status}`)
    return data
  }
  return {
    name: 'razorpay',
    async createOrder(input) {
      const order = await call('/orders', { amount: input.amountMinor, currency: input.currency, receipt: input.reference, notes: { reference: input.reference } })
      return { providerOrderId: String(order.id), checkout: { kind: 'razorpay', keyId: cfg.keyId, orderId: order.id, amount: input.amountMinor, currency: input.currency, description: input.description } }
    },
    verifyWebhook(rawBody, headers) {
      const sig = header(headers, 'x-razorpay-signature')
      const expected = createHmac('sha256', cfg.webhookSecret).update(rawBody).digest('hex')
      if (!sig || !safeEqual(sig, expected)) return null
      const body = JSON.parse(rawBody.toString('utf8')) as { event?: string; payload?: { payment?: { entity?: Record<string, unknown> }; refund?: { entity?: Record<string, unknown> } } }
      const p = body.payload?.payment?.entity ?? {}
      const eventId = header(headers, 'x-razorpay-event-id') ?? `${body.event}:${String(p.id ?? '')}`
      const type = body.event === 'payment.captured' || body.event === 'order.paid' ? 'payment.succeeded' : body.event === 'payment.failed' ? 'payment.failed' : body.event === 'refund.processed' ? 'refund.completed' : 'ignored'
      // Keep identifiers and amounts only; drop card, VPA, bank and contact details.
      const stored = { event: body.event, paymentId: p.id, orderId: p.order_id, amount: p.amount, currency: p.currency, status: p.status, method: p.method }
      return { eventId, type, providerOrderId: p.order_id as string | undefined, providerPaymentId: p.id as string | undefined, amountMinor: typeof p.amount === 'number' ? p.amount : undefined, currency: p.currency as string | undefined, stored }
    },
    async refund(providerPaymentId, amountMinor) {
      const r = await call(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, { amount: amountMinor })
      return { status: r.status === 'processed' ? 'COMPLETED' : r.status === 'failed' ? 'FAILED' : 'PENDING', providerRef: String(r.id ?? '') }
    },
  }
}
