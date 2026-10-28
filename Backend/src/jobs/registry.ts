import type { Prisma } from '../generated/prisma/client.js'
import { institutionToday } from '../common/clock.js'
import { logger } from '../common/logger.js'
import { prisma } from '../database/prisma.js'
import { issueInvoices } from '../modules/fees/fees.service.js'
import { deliverDue } from '../modules/notifications/notify.service.js'
import { runReminders } from '../modules/notifications/reminders.service.js'
import { tick } from '../modules/scheduled-reports/reports.service.js'

export interface JobDef {
  name: string
  /** Cron in the institution timezone. */
  cron: string
  description: string
  run: () => Promise<unknown>
}

/** Every background job. All of them are idempotent: running one twice changes nothing the second time. */
export const JOBS: JobDef[] = [
  { name: 'fees-issue-monthly', cron: '10 0 1 * *', description: 'Issue the month’s invoices on the 1st', run: async () => issueInvoices(null, (await institutionToday()).slice(0, 7)) },
  { name: 'fees-reminders', cron: '0 9 * * *', description: 'Queue fee reminders due today', run: () => runReminders() },
  { name: 'progress-reports', cron: '5 * * * *', description: 'Send scheduled parent progress reports when due', run: () => tick() },
  { name: 'deliver-notifications', cron: '* * * * *', description: 'Send queued messages, with retries', run: () => deliverDue() },
]

/** Run a job and record the outcome for monitoring. */
export async function runTracked(job: JobDef) {
  await prisma.jobStatus.upsert({ where: { name: job.name }, update: { lastStartedAt: new Date() }, create: { name: job.name, lastStartedAt: new Date() } })
  try {
    const result = await job.run()
    await prisma.jobStatus.update({ where: { name: job.name }, data: { lastSucceededAt: new Date(), lastError: null, lastResult: JSON.parse(JSON.stringify(result ?? null)) as Prisma.InputJsonValue } })
    return result
  } catch (err) {
    logger.error({ err, job: job.name }, 'Background job failed')
    await prisma.jobStatus.update({ where: { name: job.name }, data: { lastFailedAt: new Date(), lastError: (err as Error).message.slice(0, 500) } })
    throw err
  }
}

export async function jobOverview() {
  const [status, deliveries] = await Promise.all([
    prisma.jobStatus.findMany(),
    prisma.notificationDelivery.groupBy({ by: ['status'], _count: true }),
  ])
  return {
    jobs: JOBS.map((j) => ({ name: j.name, cron: j.cron, description: j.description, ...(status.find((s) => s.name === j.name) ?? {}) })),
    deliveries: Object.fromEntries(deliveries.map((d) => [d.status, d._count])),
  }
}
