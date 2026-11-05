// The organization and its first madrasa, shared by `db:setup` and the development seed.
// Safe to run more than once: what already exists is left as it is.
import { prisma } from '../src/database/prisma.js'
import { asOrg } from '../src/tenancy/context.js'
import { createMadrasaDefaults } from '../src/tenancy/defaults.js'

export const ORGANIZATION = {
  name: 'Al Farooquia School of Quran', shortName: 'Al Farooquia', nameArabic: 'مدرسۃ القرآن الفاروقیۃ', tagline: 'Madarsa Management System',
  address: 'Hyderabad, Telangana, India', phone: '', email: 'office@example.org',
}

/** Returns the id of the madrasa with this code, creating the organization and the madrasa if needed. */
export async function ensureMadrasa(m: { code: string; name: string; shortName: string; nameArabic?: string; address: string; phone: string; email: string }) {
  return asOrg('installation set-up', async () => {
    await prisma.organization.upsert({ where: { id: 1 }, update: {}, create: { id: 1, ...ORGANIZATION } })
    const existing = await prisma.madrasa.findUnique({ where: { code: m.code } })
    if (existing) return existing.id
    return prisma.$transaction(async (tx) => {
      const created = await tx.madrasa.create({ data: { ...m, nameArabic: m.nameArabic ?? null } })
      await createMadrasaDefaults(tx, created.id, { currency: 'INR', timezone: 'Asia/Kolkata', weeklyOff: 5, feeDueDay: 10 })
      return created.id
    })
  })
}
