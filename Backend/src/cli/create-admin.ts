// Create the first administrator and print a one-time setup link.
//   node dist/cli/create-admin.js --email office@example.org --name "Office Administrator"
// (development: npx tsx src/cli/create-admin.ts ...)
import { parseArgs } from 'node:util'
import { env } from '../config/env.js'
import { prisma } from '../database/prisma.js'
import { issueToken } from '../modules/auth/tokens.js'
import { audit } from '../modules/audit-logs/audit.service.js'

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } })
const email = values.email?.trim().toLowerCase()
if (!email || !/^\S+@\S+\.\S+$/.test(email) || !values.name || values.name.trim().length < 3) {
  console.error('Usage: create-admin --email <email> --name "<full name>"')
  process.exit(1)
}
const existing = await prisma.user.findUnique({ where: { email } })
const user = existing ?? (await prisma.user.create({ data: { email, displayName: values.name.trim(), status: 'INVITED', roles: { create: [{ role: 'ADMIN' }] } } }))
if (existing && existing.status !== 'INVITED') {
  console.error('That account already exists and is set up. Use "Reset two-step verification" or the break-glass script instead.')
  process.exit(1)
}
const { raw } = await issueToken(user.id, 'INVITE')
await audit({ action: 'user.created', summary: 'First administrator created from the command line', entityType: 'user', entityId: user.id, actor: { userId: null, name: 'Command line', role: 'system' } })
console.log(`Administrator: ${user.displayName} <${email}>`)
console.log(`Open this link within 72 hours to set the password (it works once):`)
console.log(`${env.APP_BASE_URL}/accept-invite?token=${raw}`)
await prisma.$disconnect()
