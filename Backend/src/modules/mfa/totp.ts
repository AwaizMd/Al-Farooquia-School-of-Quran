import { Secret, TOTP } from 'otpauth'
import { env } from '../../config/env.js'

// RFC 6238 defaults, which Google and Microsoft Authenticator both expect.
const PERIOD = 30
const DIGITS = 6

const totpFor = (base32: string, label = 'account') =>
  new TOTP({ issuer: env.MFA_ISSUER, label, algorithm: 'SHA1', digits: DIGITS, period: PERIOD, secret: Secret.fromBase32(base32) })

export const generateSecret = () => new Secret({ size: 20 }).base32

export const otpauthUrl = (base32: string, label: string) => totpFor(base32, label).toString()

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / PERIOD)

/**
 * Returns the time step a code belongs to (allowing one step of clock drift),
 * or null if invalid. Callers must reject steps at or below the last used one.
 */
export function matchStep(base32: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const delta = totpFor(base32).validate({ token: code, timestamp: now, window: 1 })
  return delta === null ? null : currentStep(now) + delta
}

/** Test helper: the code for a given moment. */
export const codeAt = (base32: string, now = Date.now()) => totpFor(base32).generate({ timestamp: now })
