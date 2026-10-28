import { createHmac, randomBytes } from 'node:crypto'
import { safeEqual } from '../../common/crypto.js'
import { header, type PaymentProvider, type ProviderEvent } from './provider.js'

/**
 * Development/test gateway. Behaves like a real one: orders get an id, and
 * completion arrives only as an HMAC-signed webhook. Refused in production.
 */
export function devProvider(secret: string): PaymentProvider & { signedEvent(body: object): { raw: Buffer; headers: Record<string, string> } } {
  const sign = (raw: Buffer) => createHmac('sha256', secret).update(raw).digest('hex')
  return {
    name: 'dev',
    async createOrder(input) {
      const providerOrderId = `dev_order_${randomBytes(8).toString('hex')}`
      return { providerOrderId, checkout: { kind: 'dev', orderId: providerOrderId, amountMinor: input.amountMinor, currency: input.currency } }
    },
    verifyWebhook(rawBody, headers) {
      const sig = header(headers, 'x-dev-signature')
      if (!sig || !safeEqual(sig, sign(rawBody))) return null
      const body = JSON.parse(rawBody.toString('utf8')) as { id: string; type: string; orderId?: string; paymentId?: string; amountMinor?: number; currency?: string }
      const type: ProviderEvent['type'] = body.type === 'payment.succeeded' || body.type === 'payment.failed' || body.type === 'refund.completed' ? body.type : 'ignored'
      return { eventId: body.id, type, providerOrderId: body.orderId, providerPaymentId: body.paymentId, amountMinor: body.amountMinor, currency: body.currency, stored: body }
    },
    async refund(providerPaymentId) {
      return { status: 'COMPLETED', providerRef: `dev_refund_${providerPaymentId.slice(-8)}_${randomBytes(3).toString('hex')}` }
    },
    signedEvent(body) {
      const raw = Buffer.from(JSON.stringify(body))
      return { raw, headers: { 'x-dev-signature': sign(raw), 'content-type': 'application/json' } }
    },
  }
}
