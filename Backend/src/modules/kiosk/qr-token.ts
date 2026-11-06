import { createHmac, randomBytes } from 'node:crypto'
import { AppError } from '../../common/errors.js'
import { safeEqual } from '../../common/crypto.js'
import { env } from '../../config/env.js'

// A staff member's attendance QR holds only a signed reference to their account:
// no name, phone, salary or bank detail. The key is derived from TOKEN_HMAC_KEY for
// this one purpose, so these signatures are worth nothing anywhere else.
const PREFIX = 'MMS1'
const key = () => createHmac('sha256', env.TOKEN_HMAC_KEY).update('staff-attendance-qr-v1').digest()
const sign = (body: string) => createHmac('sha256', key()).update(`${PREFIX}.${body}`).digest('base64url')

export interface QrClaims {
  /** The staff member's user id. */
  sub: string
  /** Unique per code: what makes a dynamic code usable once. */
  jti: string
  iat: number
  /** Null only for a static code, which works until revoked. */
  exp: number | null
  kind: 'dynamic' | 'static'
}

export function issueQr(userId: string, kind: QrClaims['kind'], ttlSeconds: number, now = Date.now()) {
  const iat = Math.floor(now / 1000)
  const claims = { s: userId, j: randomBytes(9).toString('base64url'), i: iat, e: kind === 'dynamic' ? iat + ttlSeconds : null, k: kind === 'dynamic' ? 'd' : 's' }
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return { token: `${PREFIX}.${body}.${sign(body)}`, expiresAt: claims.e === null ? null : new Date(claims.e * 1000) }
}

const invalid = () => new AppError(422, 'QR_INVALID', 'This is not a valid attendance QR code.')

/** Verify the signature first: nothing inside an unsigned code is read. */
export function verifyQr(token: string, now = Date.now()): QrClaims {
  if (token.length > 400) throw invalid()
  const [prefix, body, signature, ...rest] = token.split('.')
  if (prefix !== PREFIX || !body || !signature || rest.length || !safeEqual(signature, sign(body))) throw invalid()
  let c: { s?: unknown; j?: unknown; i?: unknown; e?: unknown; k?: unknown }
  try {
    c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as typeof c
  } catch {
    throw invalid()
  }
  if (typeof c.s !== 'string' || typeof c.j !== 'string' || typeof c.i !== 'number' || (c.k !== 'd' && c.k !== 's')) throw invalid()
  if (c.k === 'd') {
    if (typeof c.e !== 'number') throw invalid()
    if (now >= c.e * 1000) throw new AppError(422, 'QR_EXPIRED', 'This QR code has expired. Please show the new code on your phone.')
  }
  return { sub: c.s, jti: c.j, iat: c.i, exp: typeof c.e === 'number' ? c.e : null, kind: c.k === 'd' ? 'dynamic' : 'static' }
}
