import express, { Router } from 'express'
import { z } from 'zod'
import { doc } from '../../docs/route.js'
import { requirePermission, requireRecentAuth } from '../../middleware/auth.js'
import { IsoDate, body, query } from '../../middleware/validate.js'
import * as apps from './applications.service.js'
import * as site from './site.service.js'

export const siteRouter = Router()
const S = 'Website'
const A = 'Applications'
const Id = z.string().uuid()
const IMAGES = ['image/png', 'image/jpeg', 'image/webp']
const Type = z.enum(['PAGE', 'PROGRAM', 'ANNOUNCEMENT', 'EVENT', 'FAQ'])
const Status = z.enum(['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'ARCHIVED'])

// ---------- Website settings and content ----------

doc('get', '/site/settings', S, 'Website settings of this madrasa', { auth: 'site.manage' })
siteRouter.get('/site/settings', requirePermission('site.manage'), async (_req, res) => {
  res.json(await site.getConfig())
})
doc('put', '/site/settings', S, 'Change website settings and forms', { body: site.SiteConfig, auth: 'site.publish' })
siteRouter.put('/site/settings', requirePermission('site.publish'), async (req, res) => {
  res.json(await site.saveConfig(req, body(req, site.SiteConfig)))
})
const Domain = z.object({ hostname: z.string().trim().min(3).max(253) }).strict()
doc('get', '/site/domains', S, 'Website addresses', { auth: 'site.manage' })
siteRouter.get('/site/domains', requirePermission('site.manage'), async (_req, res) => {
  res.json(await site.listDomains())
})
doc('post', '/site/domains', S, 'Add a website address', { body: Domain, auth: 'site.publish + recent re-authentication' })
siteRouter.post('/site/domains', requirePermission('site.publish'), requireRecentAuth(), async (req, res) => {
  res.status(201).json(await site.addDomain(req, body(req, Domain).hostname))
})
doc('delete', '/site/domains/:id', S, 'Remove a website address', { auth: 'site.publish + recent re-authentication' })
siteRouter.delete('/site/domains/:id', requirePermission('site.publish'), requireRecentAuth(), async (req, res) => {
  await site.removeDomain(req, Id.parse(req.params.id))
  res.status(204).end()
})

doc('get', '/site/assets', S, 'Images uploaded for the website', { auth: 'site.manage' })
siteRouter.get('/site/assets', requirePermission('site.manage'), async (_req, res) => {
  res.json(await site.listAssets())
})
doc('post', '/site/assets', S, 'Upload an image for publication (raw body, max 5 MB)', { auth: 'site.manage' })
siteRouter.post('/site/assets', requirePermission('site.manage'), express.raw({ type: IMAGES, limit: '5mb' }), async (req, res) => {
  res.status(201).json(await site.addAsset(req, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.get('content-type') ?? '', decodeURIComponent(req.get('x-file-name') ?? 'image')))
})

const ItemFields = {
  slug: z.string().trim().max(80).optional(), summary: z.string().trim().max(1000).nullable().optional(), body: z.string().trim().max(20000).nullable().optional(), data: z.record(z.string(), z.unknown()).optional(), category: z.string().trim().max(60).nullable().optional(), imageId: Id.nullable().optional(), featured: z.boolean().optional(), sortOrder: z.number().int().min(0).max(10000).optional(),
  publishAt: z.coerce.date().nullable().optional(), expiresAt: z.coerce.date().nullable().optional(),
}
const datesOk = (x: { publishAt?: Date | null | undefined; expiresAt?: Date | null | undefined }) => !x.publishAt || !x.expiresAt || x.publishAt < x.expiresAt
const datesMsg = { path: ['expiresAt'], message: 'The expiry must be after the publication date.' }
const NewItem = z.object({ type: Type, title: z.string().trim().min(2).max(200), ...ItemFields }).strict().refine(datesOk, datesMsg)
const EditItem = z.object({ title: z.string().trim().min(2).max(200).optional(), ...ItemFields }).strict().refine(datesOk, datesMsg)
const ItemsQuery = z.object({ type: Type.optional(), status: Status.optional() })
const ItemStatus = z.object({ status: Status }).strict()
doc('get', '/site/items', S, 'Website content, including drafts', { query: ItemsQuery, auth: 'site.manage' })
siteRouter.get('/site/items', requirePermission('site.manage'), async (req, res) => {
  res.json(await site.listItems(query(req, ItemsQuery)))
})
doc('post', '/site/items', S, 'Draft a page, program, announcement, event or FAQ', { body: NewItem, auth: 'site.manage' })
siteRouter.post('/site/items', requirePermission('site.manage'), async (req, res) => {
  res.status(201).json(await site.createItem(req, body(req, NewItem)))
})
doc('get', '/site/items/:id', S, 'One item', { auth: 'site.manage' })
siteRouter.get('/site/items/:id', requirePermission('site.manage'), async (req, res) => {
  res.json(await site.getItem(Id.parse(req.params.id)))
})
doc('patch', '/site/items/:id', S, 'Change an item', { body: EditItem, auth: 'site.manage' })
siteRouter.patch('/site/items/:id', requirePermission('site.manage'), async (req, res) => {
  res.json(await site.updateItem(req, Id.parse(req.params.id), body(req, EditItem)))
})
doc('post', '/site/items/:id/status', S, 'Send for approval, publish, unpublish or archive', { body: ItemStatus, auth: 'site.manage; publishing needs site.publish' })
siteRouter.post('/site/items/:id/status', requirePermission('site.manage'), async (req, res) => {
  res.json(await site.setItemStatus(req, Id.parse(req.params.id), body(req, ItemStatus).status))
})
doc('post', '/site/items/:id/preview', S, 'Make a preview link valid for an hour', { auth: 'site.manage' })
siteRouter.post('/site/items/:id/preview', requirePermission('site.manage'), async (req, res) => {
  res.status(201).json(await site.previewLink(req, Id.parse(req.params.id)))
})
doc('delete', '/site/items/:id', S, 'Delete an item that is not published', { auth: 'site.manage' })
siteRouter.delete('/site/items/:id', requirePermission('site.manage'), async (req, res) => {
  await site.deleteItem(req, Id.parse(req.params.id))
  res.status(204).end()
})

// ---------- Applications: Principal only ----------

const AppType = z.enum(['ADMISSION', 'HALAQA', 'MUREED', 'EVENT', 'ENQUIRY'])
const List = z.object({ type: AppType.optional(), status: z.enum(['PENDING', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'CLOSED']).optional(), search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(50) })
const Reason = z.object({ reason: z.string().trim().min(5).max(1000) }).strict()
const Info = z.object({ message: z.string().trim().min(5).max(2000) }).strict()
const CloseBody = z.object({ note: z.string().trim().max(1000).optional() }).strict()
const Approve = z.object({ halaqaId: Id.optional(), groupId: Id.optional(), existingParticipantId: Id.optional(), existingStudentId: Id.optional(), note: z.string().trim().max(1000).optional(), admissionDate: IsoDate.optional() }).strict()

doc('get', '/applications/stats', A, 'Counts for the dashboard', { auth: 'applications.read' })
siteRouter.get('/applications/stats', requirePermission('applications.read'), async (_req, res) => {
  res.json(await apps.stats())
})
doc('get', '/applications', A, 'Applications to this madrasa', { query: List, auth: 'applications.read' })
siteRouter.get('/applications', requirePermission('applications.read'), async (req, res) => {
  res.json(await apps.listApplications(query(req, List)))
})
doc('get', '/applications/documents/:id', A, 'Open an uploaded document', { auth: 'applications.read' })
siteRouter.get('/applications/documents/:id', requirePermission('applications.read'), async (req, res) => {
  const f = await apps.getDocument(req, Id.parse(req.params.id))
  res.setHeader('Content-Type', f.contentType).setHeader('X-Content-Type-Options', 'nosniff').setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`).end(f.body)
})
doc('get', '/applications/:id', A, 'One application with documents and history', { auth: 'applications.read' })
siteRouter.get('/applications/:id', requirePermission('applications.read'), async (req, res) => {
  res.json(await apps.getApplication(req, Id.parse(req.params.id)))
})
doc('post', '/applications/:id/approve', A, 'Approve, creating or linking the record', { body: Approve, auth: 'applications.decide' })
siteRouter.post('/applications/:id/approve', requirePermission('applications.decide'), async (req, res) => {
  res.json(await apps.approve(req, Id.parse(req.params.id), body(req, Approve)))
})
doc('post', '/applications/:id/reject', A, 'Reject', { body: Reason, auth: 'applications.decide' })
siteRouter.post('/applications/:id/reject', requirePermission('applications.decide'), async (req, res) => {
  res.json(await apps.reject(req, Id.parse(req.params.id), body(req, Reason).reason))
})
doc('post', '/applications/:id/request-info', A, 'Ask the applicant for more information', { body: Info, auth: 'applications.decide' })
siteRouter.post('/applications/:id/request-info', requirePermission('applications.decide'), async (req, res) => {
  res.json(await apps.requestInfo(req, Id.parse(req.params.id), body(req, Info).message))
})
doc('post', '/applications/:id/close', A, 'Close (for an enquiry that has been answered)', { body: CloseBody, auth: 'applications.decide' })
siteRouter.post('/applications/:id/close', requirePermission('applications.decide'), async (req, res) => {
  res.json(await apps.close(req, Id.parse(req.params.id), body(req, CloseBody).note))
})
doc('delete', '/applications/:id/personal-data', A, 'Remove personal data and documents of a decided application', { auth: 'applications.decide + recent re-authentication' })
siteRouter.delete('/applications/:id/personal-data', requirePermission('applications.decide'), requireRecentAuth(), async (req, res) => {
  await apps.removePersonalData(req, Id.parse(req.params.id))
  res.status(204).end()
})
