import { pino } from 'pino'
import { env, isProd } from '../config/env.js'

// Anything that could carry credentials or secrets is removed before a log line
// is written. Extend this list whenever a new sensitive field is introduced.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.code',
  '*.secret',
  '*.recoveryCode',
  '*.otpauthUrl',
]

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  base: { service: 'mms-backend' },
  ...(isProd || env.NODE_ENV === 'test' ? {} : { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } }),
})
