// Local PostgreSQL for development and tests, run from npm binaries so no
// system install is needed. Production uses a real PostgreSQL server.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

export interface LocalPostgresOptions {
  dataDir: string
  port: number
  databases: string[]
  persistent: boolean
}

export const LOCAL_PG_USER = 'madarsa'
export const LOCAL_PG_PASSWORD = 'madarsa_local_only'

export async function startLocalPostgres(opts: LocalPostgresOptions) {
  const databaseDir = resolve(opts.dataDir)
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: LOCAL_PG_USER,
    password: LOCAL_PG_PASSWORD,
    port: opts.port,
    persistent: opts.persistent,
    // UTF-8 regardless of the OS code page: names are stored in Arabic and Urdu script.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  })
  const fresh = !existsSync(join(databaseDir, 'PG_VERSION'))
  if (fresh) await pg.initialise()
  await pg.start()
  if (fresh) for (const db of opts.databases) await pg.createDatabase(db)
  return pg
}

// `npm run db:start` keeps the development server running in the foreground.
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)
if (isMain) {
  const pg = await startLocalPostgres({ dataDir: '.local/pgdata', port: 54320, databases: ['madarsa_dev'], persistent: true })
  console.log('PostgreSQL running on 127.0.0.1:54320 (database madarsa_dev). Press Ctrl+C to stop.')
  const stop = async () => {
    await pg.stop()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
