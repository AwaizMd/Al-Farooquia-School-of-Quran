import express, { Router } from 'express'
import { z } from 'zod'
import { ManualPaymentMethod, ManualPaymentStatus } from '../../generated/prisma/enums.js'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission } from '../../middleware/auth.js'
import { body, IsoDate, query } from '../../middleware/validate.js'
import * as manual from './manual.service.js'

export const manualPaymentsRouter = Router()
const T = 'Manual payments'
const Id = z.string().uuid()

const Submit = z.object({
  studentId: Id, method: z.enum(ManualPaymentMethod), invoiceIds: z.array(Id).max(24).optional(),
  amountMinor: z.number().int().min(100).max(100_000_000), paidOn: IsoDate, reference: z.string().trim().min(6).max(50),
  note: z.string().trim().max(500).optional(), proofFileId: Id.optional(),
})
const List = z.object({
  status: z.enum(ManualPaymentStatus).optional(), method: z.enum(ManualPaymentMethod).optional(), studentId: Id.optional(), groupId: Id.optional(),
  reference: z.string().trim().max(50).optional(), search: z.string().trim().max(100).optional(), from: IsoDate.optional(), to: IsoDate.optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50),
})
const Approve = z.object({ amountMinor: z.number().int().min(1).max(100_000_000).optional(), note: z.string().trim().max(300).optional() })
const Reason = z.object({ reason: z.string().trim().min(5).max(300) })
const Message = z.object({ message: z.string().trim().min(5).max(300) })
const Respond = z.object({ note: z.string().trim().min(2).max(500).optional(), reference: z.string().trim().min(6).max(50).optional(), proofFileId: Id.optional() })

doc('post', '/payments/proofs', T, 'Upload proof of payment (raw PDF/PNG/JPEG/WebP body, max 5 MB); attach it to a submission', { auth: 'guardian with payment rights' })
manualPaymentsRouter.post('/payments/proofs', requireAuth, express.raw({ type: manual.PROOF_UPLOAD_TYPES, limit: '5mb' }), async (req, res) => {
  const name = z.string().max(255).default('proof').parse(req.get('x-file-name') ? decodeURIComponent(req.get('x-file-name')!) : undefined)
  res.status(201).json(await manual.uploadProof(req, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), (req.get('content-type') ?? '').split(';')[0]!.trim(), name))
})

doc('post', '/payments/submissions', T, 'Report a bank transfer or UPI payment for verification (changes no balance)', { body: Submit, auth: 'guardian with payment rights' })
manualPaymentsRouter.post('/payments/submissions', requireAuth, async (req, res) => {
  res.status(201).json(await manual.submit(req, body(req, Submit)))
})

doc('get', '/payments/submissions', T, 'Reported payments: families see their own; fee staff see all, with filters', { query: List })
manualPaymentsRouter.get('/payments/submissions', requireAuth, async (req, res) => {
  res.json(await manual.listSubmissions(req, query(req, List)))
})

doc('get', '/payments/submissions/:id', T, 'One reported payment (staff also get history and duplicate references)')
manualPaymentsRouter.get('/payments/submissions/:id', requireAuth, async (req, res) => {
  res.json(await manual.getSubmission(req, Id.parse(req.params.id)))
})

doc('get', '/payments/submissions/:id/proof', T, 'The proof of payment file (authorised download)')
manualPaymentsRouter.get('/payments/submissions/:id/proof', requireAuth, async (req, res) => {
  const f = await manual.proofFile(req, Id.parse(req.params.id))
  res.setHeader('Content-Type', f.mimeType)
  const inline = req.query.inline === '1'
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${f.name.replace(/"/g, '')}"`)
  res.setHeader('Cache-Control', 'private, no-store')
  // Uploaded by families: never let it run anything in the browser.
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
  res.send(f.body)
})

doc('patch', '/payments/submissions/:id', T, 'Answer a request for more information', { body: Respond, auth: 'guardian with payment rights' })
manualPaymentsRouter.patch('/payments/submissions/:id', requireAuth, async (req, res) => {
  res.json(await manual.respond(req, Id.parse(req.params.id), body(req, Respond)))
})

doc('post', '/payments/submissions/:id/approve', T, 'Approve after checking the bank statement: records the payment and receipt', { body: Approve, auth: 'fees.verify' })
manualPaymentsRouter.post('/payments/submissions/:id/approve', requirePermission('fees.verify'), async (req, res) => {
  res.json(await manual.approve(req, Id.parse(req.params.id), body(req, Approve)))
})

doc('post', '/payments/submissions/:id/reject', T, 'Reject with a reason (balance unchanged)', { body: Reason, auth: 'fees.verify' })
manualPaymentsRouter.post('/payments/submissions/:id/reject', requirePermission('fees.verify'), async (req, res) => {
  res.json(await manual.reject(req, Id.parse(req.params.id), body(req, Reason).reason))
})

doc('post', '/payments/submissions/:id/request-info', T, 'Ask the payer for more information', { body: Message, auth: 'fees.verify' })
manualPaymentsRouter.post('/payments/submissions/:id/request-info', requirePermission('fees.verify'), async (req, res) => {
  res.json(await manual.requestInfo(req, Id.parse(req.params.id), body(req, Message).message))
})
