import { createApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './common/logger.js'
import { prisma } from './database/prisma.js'

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening')
})

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  logger.info({ signal }, 'Shutting down')
  // Stop accepting connections, let in-flight requests finish, then release the pool.
  const force = setTimeout(() => process.exit(1), 10_000)
  force.unref()
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'))
