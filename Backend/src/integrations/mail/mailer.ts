import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import nodemailer from 'nodemailer'
import { env, isTest } from '../../config/env.js'
import { logger } from '../../common/logger.js'

export interface MailMessage {
  to: string
  subject: string
  text: string
}

export type MailResult = { ok: true; messageId: string } | { ok: false; error: string }

/** Messages "sent" during tests, for assertions. */
export const testOutbox: MailMessage[] = []
let failNext = 0
/** Test hook: make the next n sends fail. */
export const failNextMail = (n = 1) => {
  failNext = n
}

const OUTBOX_DIR = '.local/outbox'
const smtp = env.MAIL_TRANSPORT === 'smtp' && env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null

// Phase 7 replaces direct sends with queued, retried deliveries. Callers must
// treat a failed send as "not delivered" and never as success.
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  try {
    if (isTest) {
      if (failNext > 0) {
        failNext--
        throw new Error('simulated provider failure')
      }
      testOutbox.push(msg)
      return { ok: true, messageId: `test-${testOutbox.length}` }
    }
    if (smtp) {
      const info = await smtp.sendMail({ from: env.MAIL_FROM, ...msg })
      return { ok: true, messageId: info.messageId }
    }
    mkdirSync(OUTBOX_DIR, { recursive: true })
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
    writeFileSync(join(OUTBOX_DIR, `${id}.txt`), `To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n`)
    return { ok: true, messageId: id }
  } catch (err) {
    logger.warn({ err, subject: msg.subject }, 'Email send failed')
    return { ok: false, error: 'send_failed' }
  }
}
