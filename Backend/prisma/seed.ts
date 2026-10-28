// Development seed only. Contains no real personal data and must never run in production.
import { prisma } from '../src/database/prisma.js'
import type { Role } from '../src/generated/prisma/enums.js'
import { hashPassword } from '../src/modules/auth/password.js'
import { linkDevAccounts, seedActivity, seedExams, seedFees, seedPeople } from './seed-people.js'
import { institutionToday } from '../src/common/clock.js'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.')
  process.exit(1)
}

await prisma.institutionSettings.upsert({
  where: { id: 1 },
  update: {},
  create: {
    id: 1,
    brandName: 'Al Farooquia School of Quran',
    shortName: 'Al Farooquia',
    brandArabic: 'مدرسۃ القرآن الفاروقیۃ',
    tagline: 'Madarsa Management System',
    address: 'Hyderabad, Telangana, India',
    phone: '+00 0000 000000',
    email: 'office@farooquia.demo',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    weeklyOff: 5,
    feeDueDay: 10,
  },
})

// Development sign-in accounts, one per role. Names match the frontend's demo data.
// Staff accounts must set up an authenticator app at first sign-in (mandatory MFA).
const DEV_PASSWORD = 'farooquia-dev-only'
const accounts: { email?: string; username?: string; displayName: string; role: Role }[] = [
  { email: 'admin@farooquia.demo', displayName: 'Maulana Shoaib Akhtar', role: 'ADMIN' },
  { email: 'principal@farooquia.demo', displayName: 'Mufti Abdul Qadir', role: 'PRINCIPAL' },
  { email: 'mentor@farooquia.demo', displayName: 'Qari Abdul Rahman Siddiqui', role: 'MENTOR' },
  { email: 'warden@farooquia.demo', displayName: 'Hafiz Naseeruddin', role: 'WARDEN' },
  { email: 'parent@farooquia.demo', displayName: 'Javed Khan', role: 'PARENT' },
  { username: 's-1001', displayName: 'Abdullah Khan', role: 'STUDENT' },
]
const passwordHash = await hashPassword(DEV_PASSWORD)
for (const a of accounts) {
  const where = a.email ? { email: a.email } : { username: a.username! }
  const existing = await prisma.user.findUnique({ where })
  if (existing) continue
  await prisma.user.create({
    data: { ...where, displayName: a.displayName, passwordHash, status: 'ACTIVE', emailVerifiedAt: a.email ? new Date() : null, passwordChangedAt: new Date(), roles: { create: [{ role: a.role }] } },
  })
}

console.log(`People: ${await seedPeople(prisma)}`)
await linkDevAccounts(prisma)
console.log(`Activity: ${await seedActivity(prisma, await institutionToday())}`)
console.log(`Exams: ${await seedExams(prisma, await institutionToday())}`)
console.log(`Fees: ${await seedFees(prisma, await institutionToday())}`)

console.log(`Seed complete. Dev accounts (password "${DEV_PASSWORD}"): ${accounts.map((a) => a.email ?? a.username).join(', ')}`)
await prisma.$disconnect()
