import { currentMadrasa, prisma } from './db.js'

/** Switch payment methods on directly (the admin screen does the same through the API). */
export async function enablePayments(opts: { bank?: boolean; upi?: boolean; bankProofRequired?: boolean } = {}) {
  const data = {
    bankEnabled: opts.bank ?? false, bankAccountName: 'Al Farooquia Trust', bankName: 'Test Bank', bankAccountNumber: '123456789012', bankIfsc: 'TEST0001234', bankProofRequired: opts.bankProofRequired ?? false,
    upiEnabled: false,
  }
  await prisma.paymentSettings.upsert({ where: { madrasaId: currentMadrasa()! }, update: data, create: data })
}
