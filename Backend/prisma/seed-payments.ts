// Development only: demo payment methods and reported payments, so every fee
// payment screen can be tried. The bank account and QR code are fake and are
// labelled as such; the QR encodes plain text, not a UPI payment address.
import { createHash, randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { localStorage as disk } from '../src/integrations/storage/storage.js'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

// A tiny valid PDF standing in for a bank's payment confirmation.
const demoPdf = (lines: string[]) => {
  const text = lines.map((l, i) => `BT /F1 12 Tf 50 ${750 - i * 20} Td (${l.replace(/[()\\]/g, '')}) Tj ET`).join('\n')
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

export async function seedPayments(prisma: PrismaClient, today: string) {
  if ((await prisma.manualPaymentSubmission.count()) > 0) return 'reported payments already present, skipped'
  const store = disk(process.env.STORAGE_DIR ?? 'storage')
  const saveFile = async (bytes: Buffer, mimeType: string, ext: string, name: string, purpose: 'UPI_QR' | 'PAYMENT_PROOF', uploadedById: string | null) => {
    const key = `payments/${purpose === 'UPI_QR' ? 'upi-qr' : 'proofs'}/${randomUUID()}.${ext}`
    await store.put(key, bytes, mimeType)
    return prisma.storedFile.create({ data: { storageKey: key, originalName: name, mimeType, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), uploadedById, purpose } })
  }

  // All three methods on: the development gateway for "Pay Online", plus demo bank and UPI details.
  const settings = await prisma.paymentSettings.findUnique({ where: { institutionId: 1 } })
  const qr = settings?.upiQrFileId ? null : await saveFile(await QRCode.toBuffer('DEMO ONLY - NOT A PAYMENT QR - Al Farooquia development data', { width: 360, margin: 2 }), 'image/png', 'png', 'demo-upi-qr.png', 'UPI_QR', null)
  const demo = {
    razorpayEnabled: true,
    bankEnabled: true, bankAccountName: 'Al Farooquia Educational Trust (DEMO)', bankName: 'Demo Bank of India', bankAccountNumber: '000000123456789', bankIfsc: 'DEMO0000001',
    bankBranch: 'Old City (demo)', bankAccountType: 'Current', bankInstructions: 'DEMO DATA: this is not a real account. Write the admission number in the transfer remarks.', bankReferenceHint: 'Admission number, e.g. S-1001',
    bankProofRequired: false, upiEnabled: true, upiId: 'demo.farooquia@upi', upiPayeeName: 'Al Farooquia Trust (DEMO)', upiInstructions: 'DEMO DATA: the QR code does not accept payments.', upiProofRequired: false,
    ...(qr ? { upiQrFileId: qr.id } : {}),
  }
  await prisma.paymentSettings.upsert({ where: { institutionId: 1 }, update: demo, create: { institutionId: 1, ...demo } })

  const user = async (ident: string) => (await prisma.user.findFirst({ where: { OR: [{ email: ident }, { username: ident }] } }))?.id
  const admin = await user('admin@farooquia.demo')
  const javed = await user('parent@farooquia.demo')
  const farhan = await user('parent2@farooquia.demo')
  if (!admin || !javed || !farhan) return 'demo accounts missing, skipped reported payments'

  // What a student still owes (from the ledger), so demo claims never exceed it.
  const owed = async (admissionNo: string) => {
    const [r] = await prisma.$queryRaw<{ id: string; owed: number }[]>`
      SELECT s.id, COALESCE(SUM(i."amountMinor" - COALESCE((SELECT SUM(a."amountMinor") FROM fee_adjustments a WHERE a."invoiceId" = i.id), 0)
        - COALESCE((SELECT SUM(p."amountMinor") FROM payment_allocations p WHERE p."invoiceId" = i.id), 0)), 0)::int AS owed
      FROM students s LEFT JOIN invoices i ON i."studentId" = s.id AND i.status = 'ISSUED' WHERE s."admissionNo" = ${admissionNo} GROUP BY s.id`
    return r
  }
  const proof = (lines: string[], who: string) => saveFile(demoPdf(['DEMO PAYMENT CONFIRMATION (not a real bank document)', ...lines]), 'application/pdf', 'pdf', 'payment-confirmation.pdf', 'PAYMENT_PROOF', who)

  const claims = [
    { adm: 'S-1001', by: javed, method: 'BANK_TRANSFER' as const, amount: 50000, ref: 'DEMOUTR00000001', note: 'Paid from SBI YONO.', status: 'PENDING_VERIFICATION' as const, withProof: true },
    { adm: 'S-1020', by: javed, method: 'UPI' as const, amount: 30000, ref: 'DEMOUPI00000002', note: 'Paid with Google Pay.', status: 'NEEDS_INFO' as const, review: 'Please upload the payment screenshot from your UPI app.' },
    { adm: 'S-1016', by: farhan, method: 'UPI' as const, amount: 40000, ref: 'DEMOUPI00000003', note: 'PhonePe payment.', status: 'PENDING_VERIFICATION' as const, withProof: true },
    { adm: 'S-1024', by: farhan, method: 'BANK_TRANSFER' as const, amount: 25000, ref: 'DEMOUTR00000004', note: 'NEFT transfer.', status: 'REJECTED' as const, review: 'No credit with this UTR on our bank statement. Please check the reference and submit again.' },
  ]
  let made = 0
  for (const c of claims) {
    const s = await owed(c.adm)
    if (!s || s.owed <= 0) continue
    const amount = Math.min(c.amount, s.owed)
    const file = c.withProof ? await proof([`Amount: Rs ${(amount / 100).toFixed(2)}`, `Reference: ${c.ref}`, `Date: ${today}`], c.by) : null
    const sub = await prisma.manualPaymentSubmission.create({
      data: {
        studentId: s.id, submittedById: c.by, method: c.method, invoiceIds: [], amountMinor: amount, currency: 'INR', paidOn: d(today), reference: c.ref, referenceKey: c.ref, note: c.note,
        proofFileId: file?.id ?? null, status: c.status, ...(c.review ? { reviewedById: admin, reviewedAt: new Date(), reviewNote: c.review } : {}),
      },
    })
    await prisma.auditLog.create({ data: { actorUserId: c.by, actorName: c.by === javed ? 'Javed Khan' : 'Farhan Qureshi', actorRole: 'PARENT', action: 'fees.manual_payment_submitted', summary: `${c.method === 'UPI' ? 'UPI' : 'bank transfer'} of Rs ${(amount / 100).toFixed(2)} reported (ref ${c.ref}); awaiting verification (demo data)`, entityType: 'manual_payment', entityId: sub.id } })
    if (c.review) await prisma.auditLog.create({ data: { actorUserId: admin, actorName: 'Maulana Shoaib Akhtar', actorRole: 'ADMIN', action: c.status === 'REJECTED' ? 'fees.manual_payment_rejected' : 'fees.manual_payment_info_requested', summary: `${c.status === 'REJECTED' ? 'Rejected' : 'More information requested'}: ${c.review} (demo data)`, entityType: 'manual_payment', entityId: sub.id } })
    made++
  }
  return `bank + UPI + online switched on (demo details), ${made} reported payments`
}
