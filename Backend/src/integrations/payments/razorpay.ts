import { createHmac } from 'node:crypto'
import { safeEqual } from '../../common/crypto.js'
import { header, type PaymentProvider } from './provider.js'

/**
 * Razorpay adapter (Orders API, Payments API, webhooks). Verified against a local
 * fake of Razorpay's API in the tests; NOT yet exercised against a live account.
 * Use Razorpay test mode first.
 * Docs: https://razorpay.com/docs/api/orders/, /payments/ and /webhooks/validate-test/
 */
export function razorpayProvider(cfg: { keyId: string; keySecret: string; webhookSecret: string; apiBase?: string | undefined }): PaymentProvider {
  const base = cfg.apiBase ?? 'https://api.razorpay.com/v1'
  const auth = `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`
  const call = async (method: 'GET' | 'POST', path: string, body?: object) => {
    const res = await fetch(`${base}${path}`, { method, headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    // Never include the response body or credentials in the error: it is logged.
    if (!res.ok) throw Object.assign(new Error(`Razorpay ${method} ${path.split('?')[0]} failed with HTTP ${res.status}`), { status: res.status })
    return data
  }
  return {
    name: 'razorpay',
    async createOrder(input) {
      const order = await call('POST', '/orders', { amount: input.amountMinor, currency: input.currency, receipt: input.reference, notes: { reference: input.reference } })
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
      const r = await call('POST', `/payments/${encodeURIComponent(providerPaymentId)}/refund`, { amount: amountMinor })
      return { status: r.status === 'processed' ? 'COMPLETED' : r.status === 'failed' ? 'FAILED' : 'PENDING', providerRef: String(r.id ?? '') }
    },
    // Checkout signature: HMAC-SHA256 of "<order_id>|<payment_id>" with the key secret.
    verifyCheckout(orderId, paymentId, signature) {
      const expected = createHmac('sha256', cfg.keySecret).update(`${orderId}|${paymentId}`).digest('hex')
      return safeEqual(signature, expected)
    },
    async fetchPayment(providerPaymentId) {
      const p = await call('GET', `/payments/${encodeURIComponent(providerPaymentId)}`)
      return { id: String(p.id), orderId: p.order_id as string | undefined, status: String(p.status), amountMinor: Number(p.amount), currency: String(p.currency) }
    },
    async validate() {
      await call('GET', '/orders?count=1')
    },
  }
}
