// Background worker: `npm run worker` (run exactly one or more alongside the API).
// Schedules live in PostgreSQL (pg-boss), so a restart never loses them, and
// every job is idempotent, so a job retried after a crash cannot double-send.
import { PgBoss } from 'pg-boss'
import { env } from './config/env.js'
import { institutionTimezone } from './common/clock.js'
import { logger } from './common/logger.js'
import { prisma } from './database/prisma.js'
import { JOBS, runTracked } from './jobs/registry.js'
import { asOrg } from './tenancy/context.js'

const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' })
boss.on('error', (err) => logger.error({ err }, 'pg-boss error'))

await boss.start()
// Schedules use the organization's first madrasa timezone; each job then works out "today" per madrasa.
const tz = await asOrg('worker start-up', async () => {
  const first = await prisma.madrasa.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  return institutionTimezone(first?.id)
})
for (const job of JOBS) {
  await boss.createQueue(job.name)
  await boss.schedule(job.name, job.cron, null, { tz })
  await boss.work(job.name, async () => {
    await runTracked(job)
  })
}
logger.info({ jobs: JOBS.map((j) => j.name), tz }, 'Worker started')

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  logger.info({ signal }, 'Worker stopping')
  await boss.stop({ graceful: true, timeout: 20_000 })
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
