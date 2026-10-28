// Stops the local development PostgreSQL started by `npm run db:start`, including
// one left running after its terminal was closed.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DATA_DIR = resolve('.local/pgdata')
const pkgRoot = resolve('node_modules/@embedded-postgres')
const platformPkg = existsSync(pkgRoot) ? readdirSync(pkgRoot)[0] : undefined
if (!platformPkg) throw new Error('embedded-postgres binaries are not installed; run npm install')
const pgCtl = join(pkgRoot, platformPkg, 'native', 'bin', process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl')

if (!existsSync(join(DATA_DIR, 'postmaster.pid'))) {
  console.log('Local PostgreSQL is not running.')
} else {
  execFileSync(pgCtl, ['stop', '-D', DATA_DIR, '-m', 'fast'], { stdio: 'inherit' })
}
