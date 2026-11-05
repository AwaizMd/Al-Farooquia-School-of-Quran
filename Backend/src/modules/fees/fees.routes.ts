import { Router } from 'express'
import { z } from 'zod'
import { AdjustmentKind } from '../../generated/prisma/enums.js'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission, requireRecentAuth } from '../../middleware/auth.js'
import { body, IsoDate } from '../../middleware/validate.js'
import * as fees from './fees.service.js'

export const feesRouter = Router()
const T = 'Fees'
const Id = z.string().uuid()
const Iso = IsoDate
const Minor = z.number().int().min(1).max(100_000_000)

const ManualPayment = z.object({ studentId: Id, amountMinor: Minor, method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE']), receivedOn: Iso.optional(), note: z.string().trim().max(300).optional(), invoiceIds: z.array(Id).max(24).optional() })
const Adjust = z.object({ amountMinor: Minor, kind: z.enum(AdjustmentKind), reason: z.string().trim().min(5).max(300) })
const Reason = z.object({ reason: z.string().trim().min(5).max(300) })
const Refund = z.object({ amountMinor: Minor, reason: z.string().trim().min(5).max(300) })
const Issue = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a period like 2026-10.') })

doc('get', '/fees', T, 'Invoices and payments the caller may see')
feesRouter.get('/fees', requireAuth, async (req, res) => {
  res.json(await fees.listFees(req))
})

doc('get', '/fees/students/:ref', T, 'One student’s invoices, balances and receipts')
feesRouter.get('/fees/students/:ref', requireAuth, async (req, res) => {
  res.json(await fees.studentFees(req, z.string().min(1).max(64).parse(req.params.ref)))
})

doc('post', '/fees/payments', T, 'Record money received at the office', { body: ManualPayment, auth: 'fees.record' })
feesRouter.post('/fees/payments', requirePermission('fees.record'), async (req, res) => {
  res.status(201).json(await fees.recordManualPayment(req, body(req, ManualPayment)))
})

doc('post', '/fees/invoices/issue', T, 'Issue invoices for a period (idempotent)', { body: Issue, auth: 'fees.invoice' })
feesRouter.post('/fees/invoices/issue', requirePermission('fees.invoice'), async (req, res) => {
  res.json(await fees.issueInvoices(req, body(req, Issue).period))
})

doc('post', '/fees/invoices/:id/adjustments', T, 'Waive or correct part of an invoice', { body: Adjust, auth: 'fees.adjust + recent re-authentication' })
feesRouter.post('/fees/invoices/:id/adjustments', requirePermission('fees.adjust'), requireRecentAuth(), async (req, res) => {
  res.json(await fees.adjustInvoice(req, Id.parse(req.params.id), body(req, Adjust)))
})

doc('post', '/fees/invoices/:id/void', T, 'Void an invoice with no payments', { body: Reason, auth: 'fees.adjust + recent re-authentication' })
feesRouter.post('/fees/invoices/:id/void', requirePermission('fees.adjust'), requireRecentAuth(), async (req, res) => {
  res.json(await fees.voidInvoice(req, Id.parse(req.params.id), body(req, Reason).reason))
})

doc('post', '/fees/payments/:id/refunds', T, 'Refund part or all of a payment', { body: Refund, auth: 'fees.refund + recent re-authentication' })
feesRouter.post('/fees/payments/:id/refunds', requirePermission('fees.refund'), requireRecentAuth(), async (req, res) => {
  res.json(await fees.refundPayment(req, Id.parse(req.params.id), body(req, Refund)))
})
