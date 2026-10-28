import type { Prisma } from '../../generated/prisma/client.js'
import type { NotificationCategory, NotificationChannel } from '../../generated/prisma/enums.js'
import { institutionToday } from '../../common/clock.js'
import { logger } from '../../common/logger.js'
import { prisma } from '../../database/prisma.js'
import { sendMail } from '../../integrations/mail/mailer.js'
import { invoiceView } from '../fees/fees.service.js'

type Db = Prisma.TransactionClient | typeof prisma

/** Retry delays after a failed send; then the delivery is marked failed for good. */
const BACKOFF_MIN = [1, 5, 30, 120]
const MAX_ATTEMPTS = BACKOFF_MIN.length + 1

export const render = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)

/**
 * Whether a channel may be used for this person and topic.
 * In-app and email are on unless the person opted out; WhatsApp and SMS need
 * an explicit opt-in with recorded consent.
 */
export async function channelAllowed(db: Db, userId: string | null, channel: NotificationChannel, category: NotificationCategory) {
  if (!userId) return channel === 'EMAIL'
  const pref = await db.notificationPreference.findUnique({ where: { userId_channel_category: { userId, channel, category } } })
  if (channel === 'IN_APP' || channel === 'EMAIL') return pref?.enabled ?? true
  return !!(pref?.enabled && pref.consentAt)
}

/** Guardians who should hear about a student (optionally only those with fee access). */
export async function guardiansOf(db: Db, studentId: string, opts: { fees?: boolean } = {}) {
  const links = await db.studentGuardian.findMany({
    where: { studentId, receivesNotifications: true, ...(opts.fees ? { canViewFees: true } : {}) },
    include: { guardian: { include: { user: { select: { id: true, email: true, status: true } } } } },
  })
  return links.map((l) => ({ guardianId: l.guardianId, name: l.guardian.name, phone: l.guardian.phone, email: l.guardian.user?.email ?? l.guardian.email, userId: l.guardian.user?.status === 'ACTIVE' ? l.guardian.user.id : null }))
}

/** In-app notifications for signed-in accounts (opt-outs respected). */
export async function notifyUsers(db: Db, userIds: (string | null | undefined)[], n: { category: NotificationCategory; title: string; body: string; link?: string }) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))]
  const allowed: string[] = []
  for (const id of ids) if (await channelAllowed(db, id, 'IN_APP', n.category)) allowed.push(id)
  if (allowed.length) await db.notification.createMany({ data: allowed.map((userId) => ({ userId, category: n.category, title: n.title, body: n.body, link: n.link ?? null })) })
  return allowed.length
}

/** Tell a student and their guardians (in-app) about something on their record. */
export async function notifyStudentFamily(db: Db, studentId: string, n: { category: NotificationCategory; title: string; body: string; link?: string }, opts: { fees?: boolean } = {}) {
  const student = await db.student.findUnique({ where: { id: studentId }, select: { userId: true } })
  const guardians = await guardiansOf(db, studentId, opts)
  return notifyUsers(db, [student?.userId, ...guardians.map((g) => g.userId)], n)
}

export interface QueueInput {
  dedupeKey: string
  channel: NotificationChannel
  category: NotificationCategory
  userId?: string | null | undefined
  guardianId?: string | null | undefined
  recipient?: string | null | undefined
  subject: string
  body: string
  invoiceId?: string | undefined
  reportRunId?: string | undefined
}

/** Queue an outbound message once. Returns false if this exact message was already queued or sent. */
export async function queueDelivery(db: Db, q: QueueInput) {
  const allowed = await channelAllowed(db, q.userId ?? null, q.channel, q.category)
  const configured = q.channel === 'EMAIL' || q.channel === 'IN_APP'
  const status = !allowed ? 'SKIPPED' : !configured ? 'SKIPPED' : !q.recipient && q.channel !== 'IN_APP' ? 'SKIPPED' : 'QUEUED'
  const lastError = !allowed ? 'no_consent' : !configured ? 'channel_not_configured' : status === 'SKIPPED' ? 'no_recipient' : null
  try {
    await db.notificationDelivery.create({
      data: { dedupeKey: q.dedupeKey, channel: q.channel, category: q.category, userId: q.userId ?? null, guardianId: q.guardianId ?? null, recipient: q.recipient ?? null, subject: q.subject, body: q.body, invoiceId: q.invoiceId ?? null, reportRunId: q.reportRunId ?? null, status, lastError },
    })
    return true
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false
    throw err
  }
}

/**
 * Send queued messages that are due. Each row is claimed with SKIP LOCKED so
 * two workers never send the same message. Fee reminders re-check the live
 * balance first and are skipped if it has been cleared.
 */
export async function deliverDue(limit = 50) {
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE notification_deliveries SET attempts = attempts + 1, "nextAttemptAt" = now() + interval '10 minutes'
    WHERE id IN (
      SELECT id FROM notification_deliveries
      WHERE status = 'QUEUED' AND "nextAttemptAt" <= now()
      ORDER BY "nextAttemptAt" FOR UPDATE SKIP LOCKED LIMIT ${limit}
    ) RETURNING id`
  const today = await institutionToday()
  const out = { sent: 0, failed: 0, skipped: 0, retrying: 0 }
  for (const { id } of claimed) {
    const d = (await prisma.notificationDelivery.findUnique({ where: { id } }))!
    if (d.invoiceId) {
      const inv = await prisma.invoice.findUnique({ where: { id: d.invoiceId }, include: { plan: { select: { code: true, name: true } }, student: { select: { admissionNo: true, name: true } }, allocations: { select: { amountMinor: true, paymentId: true } }, adjustments: { select: { amountMinor: true, kind: true, reason: true, createdAt: true } }, refundParts: { select: { amountMinor: true } } } })
      if (!inv || invoiceView(inv, today).balanceMinor === 0) {
        await prisma.notificationDelivery.update({ where: { id }, data: { status: 'SKIPPED', lastError: 'balance_cleared' } })
        out.skipped++
        continue
      }
    }
    if (d.channel === 'IN_APP') {
      if (d.userId) await notifyUsers(prisma, [d.userId], { category: d.category, title: d.subject, body: d.body, link: d.category === 'FEES' ? '/fees' : '/progress-report' })
      await prisma.notificationDelivery.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } })
      out.sent++
      continue
    }
    const r = await sendMail({ to: d.recipient!, subject: d.subject, text: d.body })
    if (r.ok) {
      await prisma.notificationDelivery.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), providerMessageId: r.messageId, lastError: null } })
      out.sent++
    } else if (d.attempts >= MAX_ATTEMPTS) {
      await prisma.notificationDelivery.update({ where: { id }, data: { status: 'FAILED', lastError: r.error } })
      out.failed++
      logger.warn({ deliveryId: id }, 'Notification delivery failed permanently')
    } else {
      const wait = BACKOFF_MIN[d.attempts - 1] ?? 120
      await prisma.notificationDelivery.update({ where: { id }, data: { lastError: r.error, nextAttemptAt: new Date(Date.now() + wait * 60_000) } })
      out.retrying++
    }
  }
  return out
}
