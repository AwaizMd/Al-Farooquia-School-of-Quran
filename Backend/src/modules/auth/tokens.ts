import type { Prisma } from '../../generated/prisma/client.js'
import type { AuthTokenPurpose } from '../../generated/prisma/enums.js'
import { hashToken, newToken } from '../../common/crypto.js'
import { prisma } from '../../database/prisma.js'

type Db = Prisma.TransactionClient | typeof prisma

export const TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  INVITE: 72 * 60 * 60 * 1000,
  PASSWORD_RESET: 30 * 60 * 1000,
  MFA_RECOVERY: 30 * 60 * 1000,
}

/** Issue a single-use token; older unused tokens of the same purpose stop working. */
export async function issueToken(userId: string, purpose: AuthTokenPurpose, db: Db = prisma, ttlMs = TOKEN_TTL_MS[purpose]) {
  const raw = newToken()
  await db.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } })
  const row = await db.authToken.create({ data: { userId, purpose, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) } })
  return { raw, row }
}

/** Atomically mark a token used. Returns it only if it was valid, unexpired and unused. */
export async function consumeToken(raw: string, purpose: AuthTokenPurpose, db: Db = prisma) {
  const tokenHash = hashToken(raw)
  const r = await db.authToken.updateMany({ where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })
  if (r.count !== 1) return null
  return db.authToken.findUnique({ where: { tokenHash } })
}

/** Check a token without using it (to show the right screen before the user submits). */
export async function peekToken(raw: string, purpose: AuthTokenPurpose) {
  const t = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(raw) } })
  return t && t.purpose === purpose && !t.usedAt && t.expiresAt > new Date() ? t : null
}
