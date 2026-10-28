import { Router } from 'express'
import { z } from 'zod'
import { NotificationCategory, NotificationChannel, ReportFrequency } from '../../generated/prisma/enums.js'
import { notFound } from '../../common/errors.js'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission } from '../../middleware/auth.js'
import { body } from '../../middleware/validate.js'
import { prisma } from '../../database/prisma.js'
import { JOBS, jobOverview, runTracked } from '../../jobs/registry.js'
import * as reports from '../scheduled-reports/reports.service.js'
import * as reminders from './reminders.service.js'
import { audit } from '../audit-logs/audit.service.js'

export const notificationsRouter = Router()
const T = 'Notifications'

doc('get', '/notifications', T, 'Your in-app notifications (latest 100)')
notificationsRouter.get('/notifications', requireAuth, async (req, res) => {
  const items = await prisma.notification.findMany({ where: { userId: req.auth!.user.id }, orderBy: { createdAt: 'desc' }, take: 100 })
  res.json({ items })
})

doc('post', '/notifications/read', T, 'Mark notifications as read', { body: z.object({ ids: z.array(z.string().uuid()).max(200) }) })
notificationsRouter.post('/notifications/read', requireAuth, async (req, res) => {
  const { ids } = body(req, z.object({ ids: z.array(z.string().uuid()).max(200) }))
  // Scoped to the caller: other people's notifications are untouched.
  const r = await prisma.notification.updateMany({ where: { id: { in: ids }, userId: req.auth!.user.id, readAt: null }, data: { readAt: new Date() } })
  res.json({ updated: r.count })
})

const Pref = z.object({ channel: z.enum(NotificationChannel), category: z.enum(NotificationCategory), enabled: z.boolean() })
doc('get', '/notifications/preferences', T, 'Your notification choices')
notificationsRouter.get('/notifications/preferences', requireAuth, async (req, res) => {
  res.json({ items: await prisma.notificationPreference.findMany({ where: { userId: req.auth!.user.id } }) })
})

doc('put', '/notifications/preferences', T, 'Change notification choices (WhatsApp/SMS opt-in records consent)', { body: z.object({ items: z.array(Pref).max(30) }) })
notificationsRouter.put('/notifications/preferences', requireAuth, async (req, res) => {
  const { items } = body(req, z.object({ items: z.array(Pref).max(30) }))
  const userId = req.auth!.user.id
  for (const p of items) {
    const consentAt = p.enabled && (p.channel === 'WHATSAPP' || p.channel === 'SMS') ? new Date() : null
    await prisma.notificationPreference.upsert({ where: { userId_channel_category: { userId, channel: p.channel, category: p.category } }, update: { enabled: p.enabled, consentAt }, create: { userId, ...p, consentAt } })
  }
  res.json({ items: await prisma.notificationPreference.findMany({ where: { userId } }) })
})

// ---------- Fee reminders (administration) ----------

const Rules = z.object({ rules: z.array(z.object({ key: z.string().max(20), enabled: z.boolean(), offsetDays: z.number().int().min(-30).max(60).optional(), channels: z.array(z.enum(NotificationChannel)).min(1).max(4).optional() })).min(1).max(10) })
const Template = z.object({ subject: z.string().trim().min(3).max(150), body: z.string().trim().min(10).max(1000) })

doc('get', '/reminders/rules', 'Reminders', 'Reminder schedule', { auth: 'fees.read' })
notificationsRouter.get('/reminders/rules', requirePermission('fees.read'), async (_req, res) => res.json(await reminders.getRules()))
doc('put', '/reminders/rules', 'Reminders', 'Change the reminder schedule', { body: Rules, auth: 'fees.invoice' })
notificationsRouter.put('/reminders/rules', requirePermission('fees.invoice'), async (req, res) => res.json(await reminders.setRules(req, body(req, Rules).rules)))
doc('get', '/reminders/template', 'Reminders', 'Reminder message', { auth: 'fees.read' })
notificationsRouter.get('/reminders/template', requirePermission('fees.read'), async (_req, res) => res.json(await reminders.getTemplate()))
doc('put', '/reminders/template', 'Reminders', 'Edit the reminder message', { body: Template, auth: 'fees.invoice' })
notificationsRouter.put('/reminders/template', requirePermission('fees.invoice'), async (req, res) => res.json(await reminders.setTemplate(req, body(req, Template))))
doc('get', '/reminders/queue', 'Reminders', 'Outstanding invoices with reminder status', { auth: 'fees.read' })
notificationsRouter.get('/reminders/queue', requirePermission('fees.read'), async (_req, res) => res.json(await reminders.queueView()))
doc('post', '/reminders/invoices/:id/send', 'Reminders', 'Send a reminder now (once per day)', { auth: 'fees.invoice' })
notificationsRouter.post('/reminders/invoices/:id/send', requirePermission('fees.invoice'), async (req, res) => res.json(await reminders.sendNow(req, z.string().uuid().parse(req.params.id))))

// ---------- Scheduled progress reports ----------

const Config = z.object({
  enabled: z.boolean(), frequency: z.enum(ReportFrequency), dayOfWeek: z.number().int().min(0).max(6), dayOfMonth: z.number().int().min(1).max(28),
  sendAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), channels: z.array(z.enum(NotificationChannel)).min(1).max(4), sections: z.array(z.string()).min(1).max(4),
})
doc('get', '/scheduled-reports/config', 'Reports', 'Parent progress report schedule', { auth: 'settings.manage' })
notificationsRouter.get('/scheduled-reports/config', requirePermission('settings.manage'), async (_req, res) => res.json(await reports.getConfig()))
doc('put', '/scheduled-reports/config', 'Reports', 'Change the parent progress report schedule', { body: Config, auth: 'settings.manage' })
notificationsRouter.put('/scheduled-reports/config', requirePermission('settings.manage'), async (req, res) => res.json(await reports.setConfig(req, body(req, Config))))
doc('get', '/scheduled-reports/runs', 'Reports', 'History of report runs', { auth: 'settings.manage' })
notificationsRouter.get('/scheduled-reports/runs', requirePermission('settings.manage'), async (_req, res) => {
  res.json({ items: await prisma.reportRun.findMany({ orderBy: { startedAt: 'desc' }, take: 24, include: { _count: { select: { deliveries: true } } } }) })
})

// ---------- Background job monitoring ----------

doc('get', '/admin/jobs', 'Administration', 'Background jobs: last runs and delivery counts', { auth: 'settings.manage' })
notificationsRouter.get('/admin/jobs', requirePermission('settings.manage'), async (_req, res) => res.json(await jobOverview()))
doc('post', '/admin/jobs/:name/run', 'Administration', 'Run a background job now (it is idempotent)', { auth: 'settings.manage' })
notificationsRouter.post('/admin/jobs/:name/run', requirePermission('settings.manage'), async (req, res) => {
  const job = JOBS.find((j) => j.name === req.params.name)
  if (!job) throw notFound()
  res.json({ name: job.name, result: await runTracked(job) })
})

doc('get', '/reminders/log', 'Reminders', 'Recent fee reminder deliveries and their outcome', { auth: 'fees.read' })
notificationsRouter.get('/reminders/log', requirePermission('fees.read'), async (_req, res) => {
  const rows = await prisma.notificationDelivery.findMany({ where: { category: 'FEES', invoiceId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 200 })
  const invoices = await prisma.invoice.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.invoiceId!))] } }, select: { id: true, student: { select: { admissionNo: true, name: true } } } })
  const byId = new Map(invoices.map((i) => [i.id, i.student]))
  res.json({ items: rows.map((r) => ({ id: r.id, student: byId.get(r.invoiceId!) ?? null, stage: r.dedupeKey.split(':')[2], channel: r.channel, status: r.status, lastError: r.lastError, recipient: r.recipient, createdAt: r.createdAt, sentAt: r.sentAt })) })
})

// ---------- Institution settings ----------

const Settings = z.object({
  brandName: z.string().trim().min(3).max(120), shortName: z.string().trim().min(2).max(60), brandArabic: z.string().trim().max(120), tagline: z.string().trim().max(120),
  address: z.string().trim().max(300), phone: z.string().trim().max(40), email: z.string().trim().email(), currency: z.enum(['INR', 'PKR', 'BDT', 'GBP', 'USD', 'AED']),
  weeklyOff: z.number().int().min(0).max(6), feeDueDay: z.number().int().min(1).max(28),
}).partial()
doc('get', '/settings', 'Administration', 'Institution settings')
notificationsRouter.get('/settings', requireAuth, async (_req, res) => {
  res.json(await prisma.institutionSettings.findUniqueOrThrow({ where: { id: 1 } }))
})
doc('put', '/settings', 'Administration', 'Change institution settings', { body: Settings, auth: 'settings.manage' })
notificationsRouter.put('/settings', requirePermission('settings.manage'), async (req, res) => {
  const patch = body(req, Settings)
  const saved = await prisma.institutionSettings.update({ where: { id: 1 }, data: patch })
  await audit({ action: 'settings.updated', summary: `Settings updated: ${Object.keys(patch).join(', ')}`, entityType: 'institution_settings' }, req)
  res.json(saved)
})
