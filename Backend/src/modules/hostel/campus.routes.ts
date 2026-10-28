import express, { Router } from 'express'
import { z } from 'zod'
import { HostelRollStatus, LibraryAudience } from '../../generated/prisma/enums.js'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission } from '../../middleware/auth.js'
import { body, query } from '../../middleware/validate.js'
import { env } from '../../config/env.js'
import * as hostel from './hostel.service.js'
import * as library from '../library/library.service.js'

export const campusRouter = Router()
const Id = z.string().uuid()
const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
const H = 'Hostel'
const L = 'Library'

doc('get', '/hostel', H, 'Rooms, beds, occupants and residents without a bed', { auth: 'hostel.read' })
campusRouter.get('/hostel', requirePermission('hostel.read'), async (_req, res) => res.json(await hostel.overview()))

doc('post', '/hostel/beds/:id/assign', H, 'Assign or transfer a resident to a bed', { body: z.object({ studentId: Id }), auth: 'hostel.manage' })
campusRouter.post('/hostel/beds/:id/assign', requirePermission('hostel.manage'), async (req, res) => {
  res.json(await hostel.assignBed(req, Id.parse(req.params.id), body(req, z.object({ studentId: Id })).studentId))
})

doc('post', '/hostel/beds/:id/release', H, 'Release a bed', { body: z.object({ reason: z.string().trim().min(3).max(200) }), auth: 'hostel.manage' })
campusRouter.post('/hostel/beds/:id/release', requirePermission('hostel.manage'), async (req, res) => {
  res.json(await hostel.releaseBed(req, Id.parse(req.params.id), body(req, z.object({ reason: z.string().trim().min(3).max(200) })).reason))
})

doc('get', '/hostel/history', H, 'Bed assignment history', { auth: 'hostel.read' })
campusRouter.get('/hostel/history', requirePermission('hostel.read'), async (req, res) => res.json(await hostel.history(query(req, z.object({ studentId: Id.optional() })).studentId)))

const Roll = z.object({ date: Iso, entries: z.array(z.object({ studentId: Id, status: z.enum(HostelRollStatus), note: z.string().trim().max(200).optional() })).min(1).max(300), reason: z.string().trim().min(3).max(200).optional() })
doc('post', '/hostel/roll-call', H, 'Save the night roll call', { body: Roll, auth: 'hostel.manage' })
campusRouter.post('/hostel/roll-call', requirePermission('hostel.manage'), async (req, res) => res.json(await hostel.saveRollCall(req, body(req, Roll))))

doc('get', '/hostel/roll-call', H, 'Roll calls in a date range', { auth: 'hostel.read' })
campusRouter.get('/hostel/roll-call', requirePermission('hostel.read'), async (req, res) => res.json(await hostel.rollCalls(query(req, z.object({ from: Iso.optional(), to: Iso.optional() })))))

// ---------- Library ----------

const Resource = z.object({
  title: z.string().trim().min(3).max(200), category: z.string().trim().min(2).max(60), type: z.string().trim().min(2).max(60),
  author: z.string().trim().max(120).optional(), description: z.string().trim().max(1000).optional(), pages: z.number().int().min(1).max(5000).optional(), audience: z.enum(LibraryAudience),
})

doc('get', '/library', L, 'Library catalogue (what you can open is marked)')
campusRouter.get('/library', requireAuth, async (req, res) => res.json(await library.listResources(req)))

doc('post', '/library', L, 'Add a resource (then upload its file)', { body: Resource, auth: 'library.upload' })
campusRouter.post('/library', requirePermission('library.upload'), async (req, res) => res.status(201).json(await library.createResource(req, body(req, Resource))))

doc('patch', '/library/:id', L, 'Edit or archive a resource', { body: Resource.partial().extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() }), auth: 'uploader or library.manage' })
campusRouter.patch('/library/:id', requirePermission('library.upload'), async (req, res) => {
  res.json(await library.updateResource(req, Id.parse(req.params.id), body(req, Resource.partial().extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() }))))
})

doc('put', '/library/:id/file', L, 'Upload the file (raw body; PDF or audio; checked by content)', { auth: 'uploader or library.manage' })
campusRouter.put('/library/:id/file', requirePermission('library.upload'), express.raw({ type: library.UPLOAD_TYPES, limit: `${env.UPLOAD_MAX_MB}mb` }), async (req, res) => {
  const name = z.string().max(255).default('resource').parse(req.get('x-file-name') ? decodeURIComponent(req.get('x-file-name')!) : undefined)
  res.json(await library.attachFile(req, Id.parse(req.params.id), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), (req.get('content-type') ?? '').split(';')[0]!.trim(), name))
})

doc('get', '/library/:id/file', L, 'Download a file you may open')
campusRouter.get('/library/:id/file', requireAuth, async (req, res) => {
  const f = await library.openFile(req, Id.parse(req.params.id))
  if ('redirect' in f) return res.redirect(302, f.redirect!)
  res.setHeader('Content-Type', f.mimeType)
  // PDFs may be previewed in the browser; everything else downloads.
  const inline = req.query.inline === '1' && f.mimeType === 'application/pdf'
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${f.name.replace(/"/g, '')}"`)
  res.setHeader('Cache-Control', 'private, no-store')
  res.send(f.body)
})
