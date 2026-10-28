import type { Request } from 'express'
import type { NotificationChannel } from '../../generated/prisma/enums.js'
import { AppError, notFound } from '../../common/errors.js'
import { addDaysIso, institutionToday } from '../../common/clock.js'
import { prisma } from '../../database/prisma.js'
import { audit } from '../audit-logs/audit.service.js'
import { invoiceView } from '../fees/fees.service.js'
import { isoDate, toDate } from '../students/students.service.js'
import { guardiansOf, queueDelivery, render } from './notify.service.js'

const INVOICE_INCLUDE = {
  plan: { select: { code: true, name: true } },
  student: { select: { admissionNo: true, name: true, status: true } },
  allocations: { select: { amountMinor: true, paymentId: true } },
  adjustments: { select: { amountMinor: true, kind: true, reason: true, createdAt: true } },
  refundParts: { select: { amountMinor: true } },
} as const

const money = (minor: number, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100)
const monthName = (period: string) => new Date(`${period}-15T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export async function getRules() {
  return { items: await prisma.reminderRule.findMany({ orderBy: { position: 'asc' } }) }
}

export async function setRules(req: Request, rules: { key: string; enabled: boolean; offsetDays?: number | undefined; channels?: NotificationChannel[] | undefined }[]) {
  await prisma.$transaction(async (tx) => {
    for (const r of rules) {
      const n = await tx.reminderRule.updateMany({ where: { key: r.key }, data: { enabled: r.enabled, ...(r.offsetDays !== undefined ? { offsetDays: r.offsetDays } : {}), ...(r.channels ? { channels: r.channels } : {}) } })
      if (n.count !== 1) throw notFound()
    }
    await audit({ action: 'reminders.schedule_changed', summary: rules.map((r) => `${r.key}=${r.enabled ? 'on' : 'off'}`).join(', '), entityType: 'reminder_rules' }, req, tx)
  })
  return getRules()
}

export async function getTemplate() {
  return prisma.messageTemplate.findUniqueOrThrow({ where: { key: 'fee_reminder' } })
}

export async function setTemplate(req: Request, t: { subject: string; body: string }) {
  const unknown = [...`${t.subject} ${t.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !['guardian', 'student', 'madarsa', 'period', 'dueDate', 'balance'].includes(k!))
  if (unknown.length) throw new AppError(422, 'VALIDATION_FAILED', `Unknown placeholders: ${unknown.join(', ')}`, [{ path: 'body', message: `Unknown placeholders: ${unknown.map((u) => `{${u}}`).join(', ')}` }])
  const saved = await prisma.messageTemplate.update({ where: { key: 'fee_reminder' }, data: t })
  await audit({ action: 'reminders.template_changed', summary: 'Fee reminder message edited', entityType: 'message_template' }, req)
  return saved
}

async function queueForInvoice(invoiceId: string, stage: string, channels: NotificationChannel[], today: string) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: INVOICE_INCLUDE })
  if (!inv || inv.status !== 'ISSUED' || inv.student.status !== 'ACTIVE') return 0
  const view = invoiceView(inv, today)
  if (view.balanceMinor === 0) return 0
  const [template, settings] = await Promise.all([getTemplate(), prisma.institutionSettings.findUnique({ where: { id: 1 } })])
  let queued = 0
  for (const g of await guardiansOf(prisma, inv.studentId, { fees: true })) {
    const vars = { guardian: g.name, student: inv.student.name, madarsa: settings?.brandName ?? 'the Madarsa', period: monthName(inv.period), dueDate: isoDate(inv.dueDate)!, balance: money(view.balanceMinor, inv.currency) }
    for (const channel of channels) {
      if (channel === 'IN_APP' && !g.userId) continue
      const recipient = channel === 'EMAIL' ? g.email : channel === 'IN_APP' ? null : g.phone
      if (await queueDelivery(prisma, { dedupeKey: `fee:${inv.id}:${stage}:${g.guardianId}:${channel}`, channel, category: 'FEES', userId: g.userId, guardianId: g.guardianId, recipient, subject: render(template.subject, vars), body: render(template.body, vars), invoiceId: inv.id })) queued++
    }
  }
  return queued
}

/** Daily job: queue each enabled reminder stage for invoices that reach it today. */
export async function runReminders(today?: string) {
  const day = today ?? (await institutionToday())
  const rules = await prisma.reminderRule.findMany({ where: { enabled: true } })
  let queued = 0
  for (const rule of rules) {
    // A rule "3 days after" fires today for invoices due 3 days ago.
    const due = addDaysIso(day, -rule.offsetDays)
    const invoices = await prisma.invoice.findMany({ where: { status: 'ISSUED', dueDate: toDate(due) }, select: { id: true } })
    for (const i of invoices) queued += await queueForInvoice(i.id, rule.key, rule.channels, day)
  }
  return { date: day, queued }
}

/** Office "send a reminder now" for one invoice (at most once per day per channel). */
export async function sendNow(req: Request, invoiceId: string) {
  const today = await institutionToday()
  const n = await queueForInvoice(invoiceId, `manual-${today}`, ['EMAIL', 'IN_APP'], today)
  await audit({ action: 'reminders.sent_manually', summary: n ? `${n} reminder(s) queued` : 'Nothing queued (already sent today, cleared, or no contact)', entityType: 'invoice', entityId: invoiceId }, req)
  return { queued: n }
}

/** Outstanding invoices with the stages that have gone or will go out, and what happened to each. */
export async function queueView() {
  const today = await institutionToday()
  const [rules, invoices] = await Promise.all([
    prisma.reminderRule.findMany({ orderBy: { position: 'asc' } }),
    prisma.invoice.findMany({ where: { status: 'ISSUED', dueDate: { gte: toDate(addDaysIso(today, -45)), lte: toDate(addDaysIso(today, 14)) } }, include: INVOICE_INCLUDE, orderBy: { dueDate: 'asc' } }),
  ])
  const open = invoices.map((i) => invoiceView(i, today)).filter((v) => v.balanceMinor > 0)
  const deliveries = await prisma.notificationDelivery.findMany({ where: { invoiceId: { in: open.map((o) => o.id) } }, select: { invoiceId: true, dedupeKey: true, status: true, channel: true, sentAt: true, lastError: true } })
  return {
    today,
    items: open.map((o) => ({
      invoice: o,
      studentName: invoices.find((i) => i.id === o.id)!.student.name,
      stages: rules.map((r) => {
        const date = addDaysIso(o.dueDate, r.offsetDays)
        const ds = deliveries.filter((d) => d.invoiceId === o.id && d.dedupeKey.startsWith(`fee:${o.id}:${r.key}:`))
        return { key: r.key, label: r.label, enabled: r.enabled, date, deliveries: ds.map((d) => ({ channel: d.channel, status: d.status, sentAt: d.sentAt, lastError: d.lastError })) }
      }),
      manual: deliveries.filter((d) => d.invoiceId === o.id && d.dedupeKey.includes(':manual-')).map((d) => ({ channel: d.channel, status: d.status, sentAt: d.sentAt })),
    })),
  }
}
