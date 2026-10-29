import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

/** 256-bit URL-safe random token for cookies and single-use links. */
export const newToken = () => randomBytes(32).toString('base64url')

/** Keyed hash for storing tokens and recovery codes; a database leak alone cannot forge or reverse them. */
export const hashToken = (token: string) => createHmac('sha256', env.TOKEN_HMAC_KEY).update(token).digest('base64url')

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export interface Sealed {
  ciphertext: Uint8Array<ArrayBuffer>
  iv: Uint8Array<ArrayBuffer>
  tag: Uint8Array<ArrayBuffer>
  keyVersion: number
}

// AES-256-GCM. The AAD binds a ciphertext to its row, so a secret copied onto
// another user's record fails to decrypt instead of granting access.
export function seal(plaintext: string, aad: string): Sealed {
  const keyVersion = env.MFA_ACTIVE_KEY_VERSION
  const key = env.MFA_ENCRYPTION_KEYS.get(keyVersion)!
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return { ciphertext: new Uint8Array(ciphertext), iv: new Uint8Array(iv), tag: new Uint8Array(cipher.getAuthTag()), keyVersion }
}

/** True when payment secrets can be stored (SETTINGS_ENCRYPTION_KEYS is configured). */
export const canSealSettings = () => !!(env.SETTINGS_ENCRYPTION_KEYS && env.SETTINGS_ACTIVE_KEY_VERSION)

/**
 * Seal a settings secret (e.g. a Razorpay key secret) into one value:
 * [key version (1 byte)][iv (12)][tag (16)][ciphertext]. The AAD names the field.
 */
export function sealSetting(plaintext: string, aad: string): Uint8Array<ArrayBuffer> {
  if (!canSealSettings()) throw new Error('SETTINGS_ENCRYPTION_KEYS is not configured')
  const version = env.SETTINGS_ACTIVE_KEY_VERSION!
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', env.SETTINGS_ENCRYPTION_KEYS!.get(version)!, iv)
  cipher.setAAD(Buffer.from(aad))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return new Uint8Array(Buffer.concat([Buffer.from([version]), iv, cipher.getAuthTag(), ciphertext]))
}

export function unsealSetting(sealed: Uint8Array, aad: string) {
  const b = Buffer.from(sealed)
  const key = env.SETTINGS_ENCRYPTION_KEYS?.get(b[0]!)
  if (!key) throw new Error(`Settings encryption key version ${b[0]} is not configured`)
  const decipher = createDecipheriv('aes-256-gcm', key, b.subarray(1, 13))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(b.subarray(13, 29))
  return Buffer.concat([decipher.update(b.subarray(29)), decipher.final()]).toString('utf8')
}

export function unseal(s: { ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array; keyVersion: number }, aad: string) {
  const key = env.MFA_ENCRYPTION_KEYS.get(s.keyVersion)
  if (!key) throw new Error(`MFA encryption key version ${s.keyVersion} is not configured`)
  const decipher = createDecipheriv('aes-256-gcm', key, s.iv)
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(s.tag)
  return Buffer.concat([decipher.update(s.ciphertext), decipher.final()]).toString('utf8')
}
