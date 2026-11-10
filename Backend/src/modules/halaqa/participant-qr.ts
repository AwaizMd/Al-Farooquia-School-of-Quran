import { createHmac } from 'node:crypto'
import { safeEqual } from '../../common/crypto.js'
import { env } from '../../config/env.js'

// A participant's attendance card holds only a signed reference: no name, phone or Mureed
// standing. The key is derived for this one purpose, so these signatures work nowhere else.
const PREFIX = 'MMH1'
const key = () => createHmac('sha256', env.TOKEN_HMAC_KEY).update('halaqa-participant-qr-v1').digest()
const sign = (body: string) => createHmac('sha256', key()).update(`${PREFIX}.${body}`).digest('base64url')

export const issueParticipantQr = (participantId: string, version: number) => {
  const body = `${participantId}.${version}`
  return `${PREFIX}.${body}.${sign(body)}`
}

export function verifyParticipantQr(token: string) {
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) return null
  const body = `${parts[1]}.${parts[2]}`
  if (!safeEqual(parts[3]!, sign(body))) return null
  const version = Number(parts[2])
  if (!Number.isInteger(version) || !/^[0-9a-f-]{36}$/.test(parts[1]!)) return null
  return { participantId: parts[1]!, version }
}
