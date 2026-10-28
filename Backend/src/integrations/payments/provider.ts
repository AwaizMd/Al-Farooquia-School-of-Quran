// Payment gateway abstraction. The fee module talks only to this interface, so
// the chosen gateway can be swapped without touching business logic.

export interface CreateOrder {
  reference: string
  amountMinor: number
  currency: string
  description: string
}

export interface Order {
  providerOrderId: string
  /** Whatever the browser needs to open the gateway's checkout (never secrets). */
  checkout: Record<string, unknown>
}

export type ProviderEventType = 'payment.succeeded' | 'payment.failed' | 'refund.completed' | 'ignored'

export interface ProviderEvent {
  eventId: string
  type: ProviderEventType
  providerOrderId?: string | undefined
  providerPaymentId?: string | undefined
  amountMinor?: number | undefined
  currency?: string | undefined
  /** Payload safe to store (no card or bank details). */
  stored: Record<string, unknown>
}

export interface PaymentProvider {
  readonly name: string
  createOrder(input: CreateOrder): Promise<Order>
  /** Verify the signature over the exact raw body. Returns null when it does not verify. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderEvent | null
  refund(providerPaymentId: string, amountMinor: number): Promise<{ status: 'COMPLETED' | 'PENDING' | 'FAILED'; providerRef?: string | undefined }>
}

export const header = (h: Record<string, string | string[] | undefined>, name: string) => {
  const v = h[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}
