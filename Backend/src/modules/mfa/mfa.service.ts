import { randomInt, randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Role } from '../../generated/prisma/enums.js'
import { hashToken, seal, unseal } from '../../common/crypto.js'
import { AppError } from '../../common/errors.js'
import { prisma } from '../../database/prisma.js'
import { generateSecret, matchStep, otpauthUrl } from './totp.js'

type Db = Prisma.TransactionClient | typeof prisma

const ENROLLMENT_TTL_MS = 10 * 60 * 1000
const RECOVERY_CODE_COUNT = 10
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I confusion

const aadFor = (userId: string, credentialId: string) => `mfa:${userId}:${credentialId}`

/** MFA is mandatory if any of the user's roles requires it (strictest role wins). */
export async function isMfaRequired(roles: readonly Role[], db: Db = prisma) {
  if (roles.length === 0) return false
  const required = await db.mfaPolicy.count({ where: { role: { in: [...roles] }, required: true } })
  return required > 0
}

export const activeCredential = (userId: string, db: Db = prisma) => db.mfaCredential.findFirst({ where: { userId, status: 'ACTIVE' } })

/**
 * Start (or restart) enrollment: a fresh secret in a short-lived PENDING row.
 * The QR/secret is returned only from this call and never again.
 */
export async function startEnrollment(user: { id: string; email: string | null; username: string | null; displayName: string }) {
  const secret = generateSecret()
  const id = randomUUID()
  const sealed = seal(secret, aadFor(user.id, id))
  await prisma.$transaction([
    prisma.mfaCredential.updateMany({ where: { userId: user.id, status: 'PENDING' }, data: { status: 'REVOKED', revokedAt: new Date() } }),
    prisma.mfaCredential.create({
      data: {
        id,
        userId: user.id,
        status: 'PENDING',
        secretCiphertext: sealed.ciphertext,
        secretIv: sealed.iv,
        secretTag: sealed.tag,
        keyVersion: sealed.keyVersion,
        expiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS),
      },
    }),
  ])
  const url = otpauthUrl(secret, user.email ?? user.username ?? user.displayName)
  return {
    qrDataUrl: await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 }),
    manualEntryKey: secret.replace(/(.{4})/g, '$1 ').trim(),
    expiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS),
  }
}

function secretOf(c: { id: string; userId: string; secretCiphertext: Uint8Array; secretIv: Uint8Array; secretTag: Uint8Array; keyVersion: number }) {
  return unseal({ ciphertext: c.secretCiphertext, iv: c.secretIv, tag: c.secretTag, keyVersion: c.keyVersion }, aadFor(c.userId, c.id))
}

function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

async function replaceRecoveryCodes(userId: string, credentialId: string, db: Db) {
  const codes = newRecoveryCodes()
  await db.recoveryCode.deleteMany({ where: { userId } })
  await db.recoveryCode.createMany({ data: codes.map((c) => ({ userId, credentialId, codeHash: hashToken(`rc:${normaliseCode(c)}`) })) })
  return codes
}

/**
 * Activate the pending credential after a valid code. Any previous authenticator
 * is revoked in the same transaction. Returns one-time recovery codes.
 */
export async function confirmEnrollment(userId: string, code: string) {
  const pending = await prisma.mfaCredential.findFirst({ where: { userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
  if (!pending || !pending.expiresAt || pending.expiresAt.getTime() < Date.now()) {
    throw new AppError(410, 'ENROLLMENT_EXPIRED', 'This setup has expired. Start again to get a new QR code.')
  }
  const step = matchStep(secretOf(pending), code)
  if (step === null) throw new AppError(400, 'INVALID_CODE', 'That code is not valid. Check the time on your phone and try again.')
  return prisma.$transaction(async (tx) => {
    await tx.mfaCredential.updateMany({ where: { userId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } })
    const activated = await tx.mfaCredential.updateMany({
      where: { id: pending.id, status: 'PENDING' },
      data: { status: 'ACTIVE', activatedAt: new Date(), expiresAt: null, lastUsedStep: BigInt(step) },
    })
    if (activated.count !== 1) throw new AppError(409, 'ENROLLMENT_CONFLICT', 'This setup was replaced by a newer one. Start again.')
    return replaceRecoveryCodes(userId, pending.id, tx)
  })
}

/** Verify a sign-in code. The conditional update makes each time step usable once, even under concurrency. */
export async function verifyCode(userId: string, code: string) {
  const cred = await activeCredential(userId)
  if (!cred) return false
  const step = matchStep(secretOf(cred), code)
  if (step === null) return false
  const updated = await prisma.$executeRaw`
    UPDATE mfa_credentials SET "lastUsedStep" = ${BigInt(step)}
    WHERE id = ${cred.id}::uuid AND status = 'ACTIVE' AND ("lastUsedStep" IS NULL OR "lastUsedStep" < ${BigInt(step)})`
  return updated === 1
}

/** Consume a recovery code (single use). */
export async function useRecoveryCode(userId: string, code: string) {
  const r = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: hashToken(`rc:${normaliseCode(code)}`), usedAt: null, credential: { status: 'ACTIVE' } },
    data: { usedAt: new Date() },
  })
  return r.count === 1
}

export async function remainingRecoveryCodes(userId: string) {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null, credential: { status: 'ACTIVE' } } })
}

export async function regenerateRecoveryCodes(userId: string) {
  const cred = await activeCredential(userId)
  if (!cred) throw new AppError(409, 'MFA_NOT_ENABLED', 'Two-step verification is not turned on.')
  return prisma.$transaction((tx) => replaceRecoveryCodes(userId, cred.id, tx))
}

/** Revoke every authenticator (active or pending) and recovery code for a user. */
export async function revokeAllCredentials(userId: string, db: Db = prisma) {
  const r = await db.mfaCredential.updateMany({ where: { userId, status: { in: ['ACTIVE', 'PENDING'] } }, data: { status: 'REVOKED', revokedAt: new Date() } })
  await db.recoveryCode.deleteMany({ where: { userId } })
  return r.count
}
