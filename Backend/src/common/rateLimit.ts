import { prisma } from '../database/prisma.js'
import { tooManyRequests } from './errors.js'

export interface Limit {
  /** Distinguishes counters, e.g. "login:ip". */
  name: string
  max: number
  windowSec: number
}

// Fixed-window counter in PostgreSQL so limits hold across restarts and instances.
export async function hit(limit: Limit, subject: string) {
  const key = `${limit.name}:${subject}`
  const [row] = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO rate_limits (key, count, "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${limit.windowSec}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits."resetAt" <= now() THEN 1 ELSE rate_limits.count + 1 END,
      "resetAt" = CASE WHEN rate_limits."resetAt" <= now() THEN now() + make_interval(secs => ${limit.windowSec}) ELSE rate_limits."resetAt" END
    RETURNING count, "resetAt"`
  return { count: row!.count, resetAt: row!.resetAt }
}

/** Count an attempt and throw 429 once the limit is exceeded. */
export async function consume(limit: Limit, subject: string) {
  const { count, resetAt } = await hit(limit, subject)
  if (count > limit.max) throw tooManyRequests(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)))
}

export async function clear(limit: Limit, subject: string) {
  await prisma.rateLimit.deleteMany({ where: { key: `${limit.name}:${subject}` } })
}

export const LIMITS = {
  loginPerIp: { name: 'login:ip', max: 30, windowSec: 15 * 60 },
  loginPerAccount: { name: 'login:acct', max: 8, windowSec: 15 * 60 },
  mfaPerUser: { name: 'mfa:user', max: 10, windowSec: 15 * 60 },
  forgotPerIp: { name: 'forgot:ip', max: 10, windowSec: 60 * 60 },
  forgotPerAccount: { name: 'forgot:acct', max: 3, windowSec: 60 * 60 },
  tokenPerIp: { name: 'token:ip', max: 20, windowSec: 15 * 60 },
  reauthPerUser: { name: 'reauth:user', max: 10, windowSec: 15 * 60 },
} satisfies Record<string, Limit>
