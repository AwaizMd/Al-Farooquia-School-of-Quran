import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { startLocalPostgres } from '../scripts/postgres.js'
import { TEST_DATABASE_URL } from '../vitest.config.js'

// A throwaway PostgreSQL instance per test run: never the development database.
const DATA_DIR = '.local/pgdata-test'

// embedded-postgres pulls in async-exit-hook, which calls process.exit(0) on
// 'beforeExit'. That would turn a failing run into exit code 0 (and a green CI),
// so keep the failure code vitest has already set by then.
let failureCode: number | undefined
process.on('beforeExit', () => {
  if (typeof process.exitCode === 'number' && process.exitCode !== 0) failureCode ??= process.exitCode
})
process.on('exit', () => {
  if (failureCode) process.exitCode = failureCode
})

export default async function setup() {
  rmSync(DATA_DIR, { recursive: true, force: true })
  rmSync('.local/storage-test', { recursive: true, force: true })
  const pg = await startLocalPostgres({ dataDir: DATA_DIR, port: 54321, databases: ['madarsa_test'], persistent: false })
  // Behave like a server whose TimeZone is not UTC (e.g. a managed database set to
  // India time), whatever the host machine uses, so timestamp handling is tested.
  const admin = pg.getPgClient('madarsa_test')
  await admin.connect()
  await admin.query(`ALTER DATABASE madarsa_test SET timezone TO 'Asia/Kolkata'`)
  await admin.end()
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  })
  return async () => {
    await pg.stop()
  }
}
