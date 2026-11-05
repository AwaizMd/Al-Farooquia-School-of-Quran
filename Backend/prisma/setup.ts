// Starting configuration for a new installation: the organization, its first madrasa
// (code MAIN) with default settings, halqas and fee plans. No people, accounts or
// activity. Safe to run more than once: anything that already exists is left as it
// is. Edit details later in Settings; add more madrasas as Super Admin.
//   npm run db:setup
import { prisma } from '../src/database/prisma.js'
import type { GroupGender, Track } from '../src/generated/prisma/enums.js'
import { withMadrasa } from '../src/tenancy/context.js'
import { ensureMadrasa } from './bootstrap.js'

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

const madrasaId = await ensureMadrasa({ code: 'MAIN', name: 'Al Farooquia School of Quran', shortName: 'Al Farooquia', nameArabic: 'مدرسۃ القرآن الفاروقیۃ', address: 'Hyderabad, Telangana, India', phone: '', email: 'office@example.org' })
const { halqas, plans } = await withMadrasa(madrasaId, async () => {
  let halqas = 0
  for (const h of HALQAS) {
    if (await prisma.group.findFirst({ where: { code: h.code } })) continue
    await prisma.group.create({ data: h })
    halqas++
  }
  let plans = 0
  for (const p of FEE_PLANS) {
    if (await prisma.feePlan.findFirst({ where: { code: p.code } })) continue
    await prisma.feePlan.create({ data: { ...p, currency: 'INR', cycle: 'MONTHLY' } })
    plans++
  }
  return { halqas, plans }
})
// eslint-disable-next-line no-console -- command-line output
console.log(`Setup: organization and madrasa MAIN ready, ${halqas} halqa(s) and ${plans} fee plan(s) added.`)
await prisma.$disconnect()
