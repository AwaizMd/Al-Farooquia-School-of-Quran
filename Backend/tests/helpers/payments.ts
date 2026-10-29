import { prisma } from '../../src/database/prisma.js'

/** The Madarsa's details row, which payment settings belong to. */
export async function ensureInstitution() {
  await prisma.institutionSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, brandName: 'Test Madarsa', shortName: 'Test', brandArabic: '', tagline: '', address: 'Hyderabad', phone: '+91 90000 00000', email: 'office@x.test', currency: 'INR', timezone: 'Asia/Kolkata', weeklyOff: 5, feeDueDay: 10 } })
}

/** Switch payment methods on directly (the admin screen does the same through the API). */
export async function enablePayments(opts: { online?: boolean; bank?: boolean; upi?: boolean; bankProofRequired?: boolean } = {}) {
  await ensureInstitution()
  const data = {
    razorpayEnabled: opts.online ?? false,
    bankEnabled: opts.bank ?? false, bankAccountName: 'Al Farooquia Trust', bankName: 'Test Bank', bankAccountNumber: '123456789012', bankIfsc: 'TEST0001234', bankProofRequired: opts.bankProofRequired ?? false,
    upiEnabled: false,
  }
  await prisma.paymentSettings.upsert({ where: { institutionId: 1 }, update: data, create: { institutionId: 1, ...data } })
}
