import { PgBoss } from 'pg-boss'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { addDaysIso, institutionToday } from '../../src/common/clock.js'
import { failNextMail, testOutbox } from '../../src/integrations/mail/mailer.js'
import { deliverDue } from '../../src/modules/notifications/notify.service.js'
import { runReminders } from '../../src/modules/notifications/reminders.service.js'
import { periodFor, runReport, tick } from '../../src/modules/scheduled-reports/reports.service.js'
import { JOBS, runTracked } from '../../src/jobs/registry.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'
import { TEST_DATABASE_URL } from '../../vitest.config.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let today: string
beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  today = await institutionToday()
  testOutbox.length = 0
  await prisma.reminderRule.createMany({ data: [
    { key: 'before', label: 'Before', offsetDays: -3, channels: ['EMAIL', 'IN_APP'], position: 1 },
    { key: 'after3', label: '3 days after', offsetDays: 3, channels: ['EMAIL', 'WHATSAPP'], position: 2 },
  ] })
  await prisma.messageTemplate.create({ data: { key: 'fee_reminder', subject: 'Fee reminder for {student}', body: 'Dear {guardian}, {student} owes {balance} for {period}, due {dueDate}.' } })
  await prisma.scheduledReportConfig.create({ data: { id: 1 } })
  // Give the guardians sign-in emails so they can be reached.
  await prisma.guardian.update({ where: { id: fx.guardians.p1.id }, data: { email: 'p1@x.test' } })
})
afterEach(() => { failNextMail(0) })

async function as(identifier: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  return c
}
async function invoiceDue(studentId: string, due: string) {
  return prisma.invoice.create({ data: { number: `INV-${due}-${studentId.slice(0, 4)}`, studentId, period: due.slice(0, 7), planId: fx.plan.id, currency: 'INR', grossMinor: 150000, discountMinor: 0, amountMinor: 150000, issuedOn: new Date(`${due}T00:00:00Z`), dueDate: new Date(`${due}T00:00:00Z`) } })
}

describe('fee reminders', () => {
  it('queue once per stage, send by email and in-app, and never repeat', async () => {
    await invoiceDue(fx.students.ali.id, addDaysIso(today, 3))
    expect((await runReminders(today)).queued).toBe(2)
    expect((await runReminders(today)).queued).toBe(0) // rerun after a crash: nothing duplicated
    const out = await deliverDue()
    expect(out.sent).toBe(2)
    expect(testOutbox.map((m) => m.subject)).toEqual(['Fee reminder for Ali'])
    expect(testOutbox[0]!.text).toContain('₹1,500.00')
    const p = await as('p1@x.test')
    expect((await p.get('/api/v1/notifications')).body.items[0]).toMatchObject({ title: 'Fee reminder for Ali', category: 'FEES' })
  })

  it('a reminder is skipped, not sent, once the balance has been paid', async () => {
    const inv = await invoiceDue(fx.students.ali.id, addDaysIso(today, 3))
    await runReminders(today)
    const admin = await as('admin@x.test')
    await admin.post('/api/v1/fees/payments', { studentId: fx.students.ali.id, amountMinor: 150000, method: 'CASH', invoiceIds: [inv.id] })
    testOutbox.length = 0
    const out = await deliverDue()
    expect(out).toMatchObject({ sent: 0, skipped: 2 })
    expect(testOutbox.filter((m) => m.subject.startsWith('Fee reminder'))).toEqual([])
    expect(await prisma.notificationDelivery.count({ where: { lastError: 'balance_cleared' } })).toBe(2)
  })

  it('WhatsApp without a provider and consent is recorded as skipped, never as sent', async () => {
    await invoiceDue(fx.students.ali.id, addDaysIso(today, -3))
    await runReminders(today)
    const wa = await prisma.notificationDelivery.findFirstOrThrow({ where: { channel: 'WHATSAPP' } })
    expect(wa).toMatchObject({ status: 'SKIPPED', lastError: 'no_consent' })
  })

  it('respects an email opt-out and fee-access settings', async () => {
    await prisma.notificationPreference.create({ data: { userId: fx.users.parent.id, channel: 'EMAIL', category: 'FEES', enabled: false } })
    await prisma.studentGuardian.updateMany({ where: { studentId: fx.students.bilal.id }, data: { canViewFees: false } })
    await invoiceDue(fx.students.ali.id, addDaysIso(today, 3))
    await invoiceDue(fx.students.bilal.id, addDaysIso(today, 3))
    await runReminders(today)
    const rows = await prisma.notificationDelivery.findMany({ orderBy: { channel: 'asc' } })
    expect(rows.map((r) => [r.channel, r.status, r.lastError]).sort()).toEqual([['EMAIL', 'SKIPPED', 'no_consent'], ['IN_APP', 'QUEUED', null]])
  })

  it('retries failed emails with backoff, then gives up', async () => {
    await invoiceDue(fx.students.ali.id, addDaysIso(today, 3))
    await runReminders(today)
    failNextMail(10)
    await deliverDue()
    const d = await prisma.notificationDelivery.findFirstOrThrow({ where: { channel: 'EMAIL' } })
    expect(d).toMatchObject({ status: 'QUEUED', attempts: 1, lastError: 'send_failed' })
    expect(d.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
    for (let i = 0; i < 5; i++) {
      await prisma.notificationDelivery.updateMany({ where: { id: d.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
      await deliverDue()
    }
    expect((await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('FAILED')
  })

  it('administration sees the queue; the Principal can read but not send', async () => {
    const inv = await invoiceDue(fx.students.ali.id, addDaysIso(today, -3))
    const admin = await as('admin@x.test')
    const q = (await admin.get('/api/v1/reminders/queue')).body.items[0]
    expect(q.stages.map((s: { key: string; date: string }) => [s.key, s.date])).toEqual([['before', addDaysIso(today, -6)], ['after3', today]])
    expect((await admin.post(`/api/v1/reminders/invoices/${inv.id}/send`)).body.queued).toBe(2)
    expect((await admin.post(`/api/v1/reminders/invoices/${inv.id}/send`)).body.queued).toBe(0) // once per day
    const pr = await as('principal@x.test')
    expect((await pr.get('/api/v1/reminders/queue')).status).toBe(200)
    expect((await pr.post(`/api/v1/reminders/invoices/${inv.id}/send`)).status).toBe(403)
  })
})

describe('scheduled progress reports', () => {
  it('builds from stored records, states missing data, and runs once per period', async () => {
    const admin = await as('admin@x.test')
    await admin.post('/api/v1/attendance', { groupId: fx.groups.gA.id, date: today, records: [{ studentId: fx.students.ali.id, status: 'PRESENT' }] })
    const period = { key: 'TEST', start: addDaysIso(today, -6), end: today }
    const r = await runReport(period)
    expect(r).toMatchObject({ ran: true, students: 3 })
    expect((await runReport(period)).reason).toBe('already_run')
    await deliverDue()
    const aliMail = testOutbox.find((m) => m.subject.startsWith('Ali:'))!
    expect(aliMail.text).toContain('present 1, late 0, absent 0')
    expect(aliMail.text).toContain('no lessons were recorded')
    expect(await prisma.reportRun.count()).toBe(1)
  })

  it('works out the reporting period and waits for the scheduled time', async () => {
    expect(periodFor('MONTHLY', '2026-11-01')).toEqual({ key: 'M:2026-10', start: '2026-10-01', end: '2026-10-31' })
    expect(periodFor('WEEKLY', '2026-11-07').start).toBe('2026-10-31')
    await prisma.scheduledReportConfig.update({ where: { id: 1 }, data: { frequency: 'MONTHLY', dayOfMonth: 1, sendAt: '09:00' } })
    // 1 Nov 2026, 08:30 in Kolkata (03:00 UTC): too early. 09:30 IST: due.
    expect((await tick(new Date('2026-11-01T03:00:00Z'))).reason).toBe('not_due')
    expect(await tick(new Date('2026-11-01T04:00:00Z'))).toMatchObject({ ran: true, period: 'M:2026-10' })
    expect((await tick(new Date('2026-11-01T05:00:00Z'))).reason).toBe('already_run')
    await prisma.scheduledReportConfig.update({ where: { id: 1 }, data: { enabled: false } })
    expect((await tick(new Date('2026-12-01T05:00:00Z'))).reason).toBe('disabled')
  })
})

describe('in-app notifications and events', () => {
  it('families hear about new lessons and absences; each sees only their own notifications', async () => {
    const m = await as('m1@x.test')
    await m.post('/api/v1/learning-records', { studentId: fx.students.ali.id, date: today, category: 'SABAQ', surah: 2, fromAyah: 1, toAyah: 5, performance: 4, mistakes: 1, fluency: 4, tajweed: 'GOOD', prevRevision: 'DONE', targetStatus: 'MET', comments: 'Good', nextTarget: 'Al-Baqarah 6–10', followUp: false })
    await m.post('/api/v1/attendance', { groupId: fx.groups.gA.id, date: today, records: [{ studentId: fx.students.bilal.id, status: 'ABSENT' }] })
    const p1 = await as('p1@x.test')
    const mine = (await p1.get('/api/v1/notifications')).body.items
    expect(mine.map((n: { title: string }) => n.title)).toEqual(['New lesson record for Ali'])
    const p2 = await as('p2@x.test')
    const theirs = (await p2.get('/api/v1/notifications')).body.items
    expect(theirs.map((n: { title: string }) => n.title)).toEqual(['Marked absent'])
    // Marking someone else's notification as read does nothing.
    expect((await p1.post('/api/v1/notifications/read', { ids: [theirs[0].id] })).body.updated).toBe(0)
    expect((await p2.post('/api/v1/notifications/read', { ids: [theirs[0].id] })).body.updated).toBe(1)
  })

  it('opting in to WhatsApp records consent', async () => {
    const p = await as('p1@x.test')
    const r = await p.put('/api/v1/notifications/preferences', { items: [{ channel: 'WHATSAPP', category: 'FEES', enabled: true }] })
    expect(r.body.items[0].consentAt).toBeTruthy()
  })
})

describe('background jobs', () => {
  it('records each run for monitoring', async () => {
    await runTracked(JOBS.find((j) => j.name === 'fees-reminders')!)
    const admin = await as('admin@x.test')
    const job = (await admin.get('/api/v1/admin/jobs')).body.jobs.find((j: { name: string }) => j.name === 'fees-reminders')
    expect(job.lastSucceededAt).toBeTruthy()
    expect((await (await as('principal@x.test')).get('/api/v1/admin/jobs')).status).toBe(403)
  })

  it('pg-boss persists and runs a queued job against the database', async () => {
    const boss = new PgBoss({ connectionString: TEST_DATABASE_URL, schema: 'pgboss_test' })
    await boss.start()
    try {
      await boss.createQueue('deliver-notifications')
      const done = new Promise<void>((resolve) => {
        void boss.work('deliver-notifications', { pollingIntervalSeconds: 0.5 }, async () => {
          await runTracked(JOBS.find((j) => j.name === 'deliver-notifications')!)
          resolve()
        })
      })
      await boss.send('deliver-notifications', {})
      await done
      expect((await prisma.jobStatus.findUniqueOrThrow({ where: { name: 'deliver-notifications' } })).lastSucceededAt).toBeTruthy()
    } finally {
      await boss.stop({ graceful: false })
    }
  }, 30_000)
})
