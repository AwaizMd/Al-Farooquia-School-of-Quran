import { existsSync } from 'node:fs'
import { z } from 'zod'

// Load Backend/.env for local runs. Real deployments inject variables directly.
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) process.loadEnvFile('.env')

const csv = z
  .string()
  .default('')
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))

const base64Key = z
  .string()
  .transform((s) => Buffer.from(s, 'base64'))
  .refine((b) => b.length >= 32, 'must be at least 32 bytes, base64-encoded')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  // Browser origins allowed to call the API with credentials.
  CORS_ORIGINS: csv,
  // Number of reverse proxies in front of the app (for correct client IPs).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  API_DOCS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),

  // Public URL of the web app, used to build links in emails.
  APP_BASE_URL: z.string().url(),
  // Secure cookies need HTTPS; only local development may turn this off.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // 32+ random bytes (base64). Keys the HMAC used to store session, link and recovery-code hashes.
  TOKEN_HMAC_KEY: base64Key,
  // Versioned AES-256 keys for TOTP secrets: "1:<base64 32 bytes>,2:<base64 32 bytes>".
  MFA_ENCRYPTION_KEYS: z.string().transform((s, ctx) => {
    const keys = new Map<number, Buffer>()
    for (const part of s.split(',').map((p) => p.trim()).filter(Boolean)) {
      const [v, k] = part.split(':')
      const version = Number(v)
      const key = Buffer.from(k ?? '', 'base64')
      if (!Number.isInteger(version) || version < 1 || key.length !== 32) {
        ctx.addIssue({ code: 'custom', message: 'each entry must be <version>:<base64 32-byte key>' })
        return z.NEVER
      }
      keys.set(version, key)
    }
    if (keys.size === 0) ctx.addIssue({ code: 'custom', message: 'at least one key is required' })
    return keys
  }),
  MFA_ACTIVE_KEY_VERSION: z.coerce.number().int().min(1),
  MFA_ISSUER: z.string().min(1).default('Al Farooquia MMS'),

  // "file" writes emails to .local/outbox (development); "smtp" sends them.
  MAIL_TRANSPORT: z.enum(['file', 'smtp']).default('file'),
  SMTP_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  MAIL_FROM: z.string().min(3).default('Al Farooquia MMS <no-reply@farooquia.demo>'),

  // Online fee payment: none (off), dev (local simulator, never in production) or razorpay.
  PAYMENT_PROVIDER: z.enum(['none', 'dev', 'razorpay']).default('none'),
  DEV_PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('dev-only-webhook-secret-change-me'),
  RAZORPAY_KEY_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  RAZORPAY_KEY_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  RAZORPAY_WEBHOOK_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),

  // Private file storage for library uploads: local disk (one server) or an S3-compatible bucket.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('storage'),
  S3_BUCKET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  S3_ACCESS_KEY_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  S3_SECRET_ACCESS_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  UPLOAD_MAX_MB: z.coerce.number().min(1).max(100).default(15),
})

export type Env = z.infer<typeof schema>

function load(): Env {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    // Name the offending variables without echoing their (possibly secret) values.
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${problems}`)
  }
  const env = parsed.data
  if (env.NODE_ENV === 'production') {
    if (env.CORS_ORIGINS.length === 0) throw new Error('CORS_ORIGINS must be set in production')
    if (!env.COOKIE_SECURE) throw new Error('COOKIE_SECURE cannot be false in production')
    if (env.MAIL_TRANSPORT !== 'smtp' || !env.SMTP_URL) throw new Error('Production requires MAIL_TRANSPORT=smtp and SMTP_URL')
  }
  if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'dev') throw new Error('PAYMENT_PROVIDER=dev is not allowed in production')
  if (env.PAYMENT_PROVIDER === 'razorpay' && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET)) {
    throw new Error('PAYMENT_PROVIDER=razorpay needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET')
  }
  if (env.STORAGE_DRIVER === 's3' && !(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY)) {
    throw new Error('STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY')
  }
  if (!env.MFA_ENCRYPTION_KEYS.has(env.MFA_ACTIVE_KEY_VERSION)) {
    throw new Error('MFA_ACTIVE_KEY_VERSION does not match any key in MFA_ENCRYPTION_KEYS')
  }
  return env
}

export const env = load()
export const isProd = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
