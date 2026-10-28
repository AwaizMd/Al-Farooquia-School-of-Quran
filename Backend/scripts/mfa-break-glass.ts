// Emergency MFA reset for when no administrator can sign in (e.g. the only
// admin lost their phone). Requires shell access to the server, which is the
// trust anchor here. Prints a 15-minute in-person ticket; the user still needs
// their own password to use it. Every run is written to the audit log.
//
//   npm run mfa:break-glass -- --user admin@example.org --reason "Lost phone, verified in person by trustee"
import { parseArgs } from 'node:util'
import { prisma } from '../src/database/prisma.js'
import { env } from '../src/config/env.js'
import { resetMfa } from '../src/modules/users/users.service.js'

const { values } = parseArgs({ options: { user: { type: 'string' }, reason: { type: 'string' } } })
if (!values.user || !values.reason || values.reason.trim().length < 5) {
  console.error('Usage: npm run mfa:break-glass -- --user <email or username> --reason "<at least 5 characters>"')
  process.exit(1)
}
const id = values.user.trim().toLowerCase()
const user = await prisma.user.findFirst({ where: { OR: [{ email: id }, { username: id }] } })
if (!user) {
  console.error('No such user.')
  process.exit(1)
}
const result = await resetMfa(null, user.id, `[break-glass CLI] ${values.reason.trim()}`, 'IN_PERSON', { name: 'Break-glass CLI' })
console.log(`Authenticator reset for ${user.displayName}. Sessions revoked: ${result.revokedSessions}.`)
console.log(`Give this link to the user in person. It expires at ${result.ticketExpiresAt?.toISOString()} and works once:`)
console.log(`${env.APP_BASE_URL}/mfa-recovery?token=${result.inPersonTicket}`)
await prisma.$disconnect()
