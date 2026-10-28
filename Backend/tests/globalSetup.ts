import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { startLocalPostgres } from '../scripts/postgres.js'
import { TEST_DATABASE_URL } from '../vitest.config.js'

// A throwaway PostgreSQL instance per test run: never the development database.
const DATA_DIR = '.local/pgdata-test'

export default async function setup() {
  rmSync(DATA_DIR, { recursive: true, force: true })
  rmSync('.local/storage-test', { recursive: true, force: true })
  const pg = await startLocalPostgres({ dataDir: DATA_DIR, port: 54321, databases: ['madarsa_test'], persistent: false })
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  })
  return async () => {
    await pg.stop()
  }
}
