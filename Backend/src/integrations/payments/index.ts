import { env } from '../../config/env.js'
import { devProvider } from './dev.js'
import type { PaymentProvider } from './provider.js'
import { razorpayProvider } from './razorpay.js'

let cached: PaymentProvider | null | undefined

/** The configured gateway, or null when online payment is switched off. */
export function paymentProvider(): PaymentProvider | null {
  if (cached !== undefined) return cached
  if (env.PAYMENT_PROVIDER === 'dev') cached = devProvider(env.DEV_PAYMENT_WEBHOOK_SECRET)
  else if (env.PAYMENT_PROVIDER === 'razorpay') cached = razorpayProvider({ keyId: env.RAZORPAY_KEY_ID!, keySecret: env.RAZORPAY_KEY_SECRET!, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET! })
  else cached = null
  return cached
}

export const devGateway = () => {
  const p = paymentProvider()
  return p?.name === 'dev' ? (p as ReturnType<typeof devProvider>) : null
}
