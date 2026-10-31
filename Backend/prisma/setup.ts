// Starting configuration for a new installation: the Madarsa's details, its halqas
// and its fee plans. No people, accounts or activity. Safe to run more than once:
// anything that already exists is left as it is. Edit details later in Settings.
//   npm run db:setup     (production: node dist/... is not needed; run with tsx from Backend/)
import { prisma } from '../src/database/prisma.js'
import type { GroupGender, Track } from '../src/generated/prisma/enums.js'

const HALQAS: { code: string; name: string; short: string; track: Track; room: string; timing: string; gender: GroupGender }[] = [
  { code: 'g-hifz-a', name: 'Hifz Halqa A', short: 'Hifz A', track: 'HIFZ', room: 'Hall 1', timing: 'After Fajr – 12:30 pm', gender: 'BOYS' },
  { code: 'g-hifz-b', name: 'Hifz Halqa B', short: 'Hifz B', track: 'HIFZ', room: 'Hall 2', timing: 'After Fajr – 12:30 pm', gender: 'BOYS' },
  { code: 'g-nazira-a', name: 'Nazira Halqa A', short: 'Nazira A', track: 'NAZIRA', room: 'Room 4', timing: '4:00 pm – 6:30 pm', gender: 'BOYS' },
  { code: 'g-nazira-b', name: 'Nazira Halqa B', short: 'Nazira B', track: 'NAZIRA', room: 'Girls Wing 1', timing: '4:00 pm – 6:30 pm', gender: 'GIRLS' },
  { code: 'g-qaida', name: 'Noorani Qaida', short: 'Qaida', track: 'QAIDA', room: 'Room 2', timing: '4:00 pm – 6:00 pm', gender: 'MIXED' },
  { code: 'g-alim', name: 'Alimiyyah Year 1', short: 'Alim 1', track: 'ALIM', room: 'Darsgah 1', timing: '8:00 am – 2:00 pm', gender: 'BOYS' },
]

const FEE_PLANS = [
  { code: 'fp-hifz', name: 'Hifz — Day Scholar', amountMinor: 150000, covers: 'Tuition, Mushaf & stationery' },
  { code: 'fp-nazira', name: 'Nazira / Qaida — Day Scholar', amountMinor: 80000, covers: 'Tuition & reading material' },
  { code: 'fp-alim', name: 'Alimiyyah — Day Scholar', amountMinor: 120000, covers: 'Tuition & textbooks' },
  { code: 'fp-res', name: 'Residential (Hostel)', amountMinor: 350000, covers: 'Tuition, boarding & three meals' },
]

await prisma.institutionSettings.upsert({
  where: { id: 1 },
  update: {},
  create: {
    id: 1, brandName: 'Al Farooquia School of Quran', shortName: 'Al Farooquia', brandArabic: 'مدرسۃ القرآن الفاروقیۃ', tagline: 'Madarsa Management System',
    address: 'Hyderabad, Telangana, India', phone: '', email: 'office@example.org', currency: 'INR', timezone: 'Asia/Kolkata', weeklyOff: 5, feeDueDay: 10,
  },
})
let halqas = 0
for (const h of HALQAS) {
  if (await prisma.group.findUnique({ where: { code: h.code } })) continue
  await prisma.group.create({ data: h })
  halqas++
}
let plans = 0
for (const p of FEE_PLANS) {
  if (await prisma.feePlan.findUnique({ where: { code: p.code } })) continue
  await prisma.feePlan.create({ data: { ...p, currency: 'INR', cycle: 'MONTHLY' } })
  plans++
}
console.log(`Setup: Madarsa details ready, ${halqas} halqa(s) and ${plans} fee plan(s) added.`)
await prisma.$disconnect()
