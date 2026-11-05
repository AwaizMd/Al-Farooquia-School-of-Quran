// Development seed only. Contains no real personal data and must never run in production.
import { prisma } from '../src/database/prisma.js'
import type { Role } from '../src/generated/prisma/enums.js'
import { hashPassword } from '../src/modules/auth/password.js'
import { linkDevAccounts, seedActivity, seedCampus, seedExams, seedFees, seedPeople } from './seed-people.js'
import { seedPayments } from './seed-payments.js'
import { institutionToday } from '../src/common/clock.js'
import { withMadrasa } from '../src/tenancy/context.js'
import { ensureMadrasa } from './bootstrap.js'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.')
  process.exit(1)
}

// The organization with two madrasas: MAIN (all demo data) and GIRLS (a second campus).
const main = await ensureMadrasa({ code: 'MAIN', name: 'Al Farooquia School of Quran', shortName: 'Al Farooquia', nameArabic: 'مدرسۃ القرآن الفاروقیۃ', address: 'Hyderabad, Telangana, India', phone: '+00 0000 000000', email: 'office@farooquia.demo' })
const girls = await ensureMadrasa({ code: 'GIRLS', name: 'Al Farooquia Girls Campus', shortName: 'Girls Campus', address: 'Tolichowki, Hyderabad (demo)', phone: '+00 0000 000001', email: 'girls@farooquia.demo' })

// Development sign-in accounts, one per role. Names match the frontend's demo data.
// Staff accounts must set up an authenticator app at first sign-in (mandatory MFA).
const DEV_PASSWORD = 'farooquia-dev-only'
// role: organization role (user_roles); in: madrasa roles (memberships) per madrasa.
const accounts: { email?: string; username?: string; displayName: string; role?: Role; in?: [string, Role][]; expires?: Date }[] = [
  { email: 'admin@farooquia.demo', displayName: 'Maulana Shoaib Akhtar', role: 'SUPER_ADMIN' },
  { email: 'accountant@farooquia.demo', displayName: 'Mohammed Salman (Accounts)', in: [[main, 'ACCOUNTANT']] },
  { email: 'ca@farooquia.demo', displayName: 'CA Rizwan Hussain', in: [[main, 'CA'], [girls, 'CA']], expires: new Date(Date.now() + 365 * 86_400_000) },
  { email: 'committee@farooquia.demo', displayName: 'Haji Abdul Kareem (Committee)', in: [[main, 'COMMITTEE_MEMBER'], [girls, 'COMMITTEE_MEMBER']] },
  { email: 'principal@farooquia.demo', displayName: 'Mufti Abdul Qadir', in: [[main, 'PRINCIPAL']] },
  { email: 'mentor@farooquia.demo', displayName: 'Qari Abdul Rahman Siddiqui', in: [[main, 'MENTOR']] },
  { email: 'mentor2@farooquia.demo', displayName: 'Hafiz Muhammad Imran Ansari', in: [[main, 'MENTOR'], [girls, 'MENTOR']] },
  { email: 'warden@farooquia.demo', displayName: 'Hafiz Naseeruddin', in: [[main, 'WARDEN']] },
  { email: 'parent@farooquia.demo', displayName: 'Javed Khan', role: 'PARENT' },
  { email: 'parent2@farooquia.demo', displayName: 'Farhan Qureshi', role: 'PARENT' },
  { username: 's-1001', displayName: 'Abdullah Khan', role: 'STUDENT' },
  { username: 's-1003', displayName: 'Usman Qureshi', role: 'STUDENT' },
]
const passwordHash = await hashPassword(DEV_PASSWORD)
for (const a of accounts) {
  const where = a.email ? { email: a.email } : { username: a.username! }
  const existing = await prisma.user.findUnique({ where })
  if (existing) continue
  await prisma.user.create({
    data: { ...where, displayName: a.displayName, passwordHash, status: 'ACTIVE', emailVerifiedAt: a.email ? new Date() : null, passwordChangedAt: new Date(), roles: { create: a.role ? [{ role: a.role }] : [] }, memberships: { create: (a.in ?? []).map(([madrasaId, role]) => ({ madrasaId, role, expiresAt: a.expires ?? null })) } },
  })
}

await withMadrasa(main, async () => {
  const today = await institutionToday()
  console.log(`People: ${await seedPeople(prisma)}`)
  await linkDevAccounts(prisma)
  console.log(`Activity: ${await seedActivity(prisma, today)}`)
  console.log(`Exams: ${await seedExams(prisma, today)}`)
  console.log(`Fees: ${await seedFees(prisma, today)}`)
  console.log(`Campus: ${await seedCampus(prisma, today)}`)

  // Bank transfer and UPI with clearly fake demo details, and a few reported payments.
  console.log(`Payments: ${await seedPayments(prisma, today)}`)
})
await withMadrasa(girls, async () => {
  if (await prisma.group.count()) return
  await prisma.group.create({ data: { code: 'g-girls-hifz', name: 'Girls Hifz Halqa', short: 'G Hifz', track: 'HIFZ', gender: 'GIRLS', room: 'Hall G1' } })
  await prisma.feePlan.create({ data: { code: 'fp-girls', name: 'Girls Hifz — Day Scholar', amountMinor: 120000, currency: 'INR', cycle: 'MONTHLY' } })
})

console.log(`Seed complete. Dev accounts (password "${DEV_PASSWORD}"): ${accounts.map((a) => a.email ?? a.username).join(', ')}`)
await prisma.$disconnect()
