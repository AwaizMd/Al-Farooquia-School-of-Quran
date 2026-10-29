import express, { Router } from 'express'
import { z } from 'zod'
import { RazorpayMode } from '../../generated/prisma/enums.js'
import { forbidden, notFound } from '../../common/errors.js'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission, requireRecentAuth } from '../../middleware/auth.js'
import { body, query } from '../../middleware/validate.js'
import { prisma } from '../../database/prisma.js'
import * as settings from './settings.service.js'

export const paymentSettingsRouter = Router()
const T = 'Payment settings'

const text = (max: number) => z.string().trim().max(max).nullable().optional()
const Patch = z.object({
  razorpay: z.object({
    enabled: z.boolean().optional(), mode: z.enum(RazorpayMode).optional(),
    keyId: z.string().trim().max(60).optional(), keySecret: z.string().trim().min(8).max(120).optional(), webhookSecret: z.string().trim().min(8).max(200).optional(),
  }).optional(),
  bank: z.object({
    enabled: z.boolean().optional(), accountName: text(100), bankName: text(100), accountNumber: text(30), ifsc: text(20), branch: text(100),
    accountType: z.enum(['Savings', 'Current']).nullable().optional(), instructions: text(600), referenceHint: text(200), proofRequired: z.boolean().optional(),
  }).optional(),
  upi: z.object({ enabled: z.boolean().optional(), upiId: text(100), payeeName: text(100), instructions: text(600), proofRequired: z.boolean().optional() }).optional(),
})

doc('get', '/admin/payment-settings', T, 'Payment methods and their readiness (secrets never returned)', { auth: 'payments.configure' })
paymentSettingsRouter.get('/admin/payment-settings', requirePermission('payments.configure'), async (_req, res) => {
  res.json(await settings.adminView())
})

doc('put', '/admin/payment-settings', T, 'Change payment methods, Razorpay keys, bank and UPI details', { body: Patch, auth: 'payments.configure + recent re-authentication' })
paymentSettingsRouter.put('/admin/payment-settings', requirePermission('payments.configure'), requireRecentAuth(), async (req, res) => {
  res.json(await settings.updateSettings(req, body(req, Patch)))
})

doc('post', '/admin/payment-settings/razorpay/validate', T, 'Check the Razorpay keys against Razorpay', { auth: 'payments.configure' })
paymentSettingsRouter.post('/admin/payment-settings/razorpay/validate', requirePermission('payments.configure'), async (req, res) => {
  res.json(await settings.validateRazorpay(req))
})

doc('put', '/admin/payment-settings/upi-qr', T, 'Upload or replace the UPI QR image (raw PNG/JPEG/WebP body, max 2 MB)', { auth: 'payments.configure + recent re-authentication' })
paymentSettingsRouter.put('/admin/payment-settings/upi-qr', requirePermission('payments.configure'), requireRecentAuth(), express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '2mb' }), async (req, res) => {
  const name = z.string().max(255).default('upi-qr').parse(req.get('x-file-name') ? decodeURIComponent(req.get('x-file-name')!) : undefined)
  res.json(await settings.setUpiQr(req, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), (req.get('content-type') ?? '').split(';')[0]!.trim(), name))
})

doc('delete', '/admin/payment-settings/upi-qr', T, 'Remove the UPI QR image (switches UPI off)', { auth: 'payments.configure + recent re-authentication' })
paymentSettingsRouter.delete('/admin/payment-settings/upi-qr', requirePermission('payments.configure'), requireRecentAuth(), async (req, res) => {
  res.json(await settings.removeUpiQr(req))
})

// ---------- What a payer sees ----------

/** Payment details go only to someone who can pay for this student, or to staff with fee access (preview). */
async function mayViewPaymentDetails(userId: string, canReadFees: boolean, studentId?: string) {
  if (canReadFees) return true
  return (await prisma.studentGuardian.count({ where: { canPay: true, guardian: { userId }, ...(studentId ? { studentId } : {}) } })) > 0
}

doc('get', '/payments/options', T, 'Payment methods offered for a student, with bank/UPI details for the payer', { query: z.object({ studentId: z.string().uuid() }) })
paymentSettingsRouter.get('/payments/options', requireAuth, async (req, res) => {
  const { studentId } = query(req, z.object({ studentId: z.string().uuid() }))
  if (!(await mayViewPaymentDetails(req.auth!.user.id, req.auth!.permissions.has('fees.read'), studentId))) throw notFound()
  const m = await settings.availableMethods()
  const s = m.settings
  const gw = m.online ? await settings.gateway(s) : null
  res.json({
    online: gw ? { provider: gw.name } : null,
    bank: m.bank ? { accountName: s.bankAccountName, bankName: s.bankName, accountNumber: s.bankAccountNumber, ifsc: s.bankIfsc, branch: s.bankBranch, accountType: s.bankAccountType, instructions: s.bankInstructions, referenceHint: s.bankReferenceHint, proofRequired: s.bankProofRequired } : null,
    upi: m.upi ? { upiId: s.upiId, payeeName: s.upiPayeeName, instructions: s.upiInstructions, proofRequired: s.upiProofRequired, qr: '/payments/upi-qr' } : null,
  })
})

doc('get', '/payments/upi-qr', T, 'The Madarsa’s UPI QR code image (payers and fee staff only)')
paymentSettingsRouter.get('/payments/upi-qr', requireAuth, async (req, res) => {
  const staff = req.auth!.permissions.has('fees.read') || req.auth!.permissions.has('payments.configure')
  if (!(await mayViewPaymentDetails(req.auth!.user.id, staff))) throw forbidden()
  if (!staff && !(await settings.availableMethods()).upi) throw notFound()
  const img = await settings.upiQrImage()
  res.setHeader('Content-Type', img.mimeType)
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Content-Security-Policy', "default-src 'none'")
  res.send(img.body)
})
