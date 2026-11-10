import { createHmac } from 'node:crypto'
import express, { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { AppError, notFound } from '../../common/errors.js'
import { safeEqual } from '../../common/crypto.js'
import { consume, LIMITS } from '../../common/rateLimit.js'
import { env } from '../../config/env.js'
import { prisma } from '../../database/prisma.js'
import { readStored } from '../../integrations/storage/storage.js'
import { runInTenant } from '../../tenancy/context.js'
import { assertFeature, madrasaProfile } from '../../tenancy/settings.js'
import { publicRespond, publicStatus, submitApplication, type UploadedFile } from './applications.service.js'
import { getConfig, itemView, liveWhere, madrasaForHost, verifyPreview } from './site.service.js'

// The website's only door into the system. No session and no client-chosen madrasa: the Next.js
// server presents a server-only token and the hostname it was asked for, and the hostname
// decides the madrasa. Everything returned is built field by field from published content.

export const publicRouter = Router()

const FORM_TOKEN_MIN_MS = 3_000
const FORM_TOKEN_MAX_MS = 24 * 3_600_000
const formKey = () => createHmac('sha256', env.TOKEN_HMAC_KEY).update('public-form-token-v1').digest()
const signForm = (body: string) => createHmac('sha256', formKey()).update(body).digest('base64url')
const clientIp = (req: express.Request) => req.get('x-client-ip') || 'unknown'

/** Only the Next.js server has this token, so the headers it sends can be believed. */
const requireSiteToken: RequestHandler = (req, _res, next) => {
  const token = req.get('x-site-token') ?? ''
  if (!env.PUBLIC_SITE_TOKEN || !safeEqual(token, env.PUBLIC_SITE_TOKEN)) return next(notFound())
  next()
}

/** Runs the route in the madrasa of the requested hostname. An unknown host looks like nothing is there. */
const inSiteMadrasa: RequestHandler = (req, _res, next) => {
  void (async () => {
    const site = await madrasaForHost(req.get('x-site-host') ?? '')
    if (!site) throw notFound()
    await assertFeature('PUBLIC_WEBSITE', site.madrasaId)
    runInTenant({ ids: [site.madrasaId], active: site.madrasaId }, next)
  })().catch((err: unknown) => next(err))
}

publicRouter.use(requireSiteToken, inSiteMadrasa)

const assetUrl = (id: string | null) => (id ? `/site-assets/${id}` : null)
type Item = Parameters<typeof itemView>[0]

/** A published item, for visitors: no status, author or internal fields. */
const publicItem = (i: Item) => ({ id: i.id, type: i.type, slug: i.slug, title: i.title, summary: i.summary, body: i.body, data: i.data, category: i.category, image: assetUrl(i.imageId), featured: i.featured, publishedAt: i.publishedAt, updatedAt: i.updatedAt })

/** A public Halaqa: only the fields chosen for publication. No members, teacher or attendance. */
const publicHalaqa = (h: { id: string; name: string; publicName: string | null; publicDescription: string | null; publicEligibility: string | null; registrationOpen: boolean; location: string | null; frequency: string; meetingDays: number[]; startTime: string | null; endTime: string | null; category: { name: string } }) => ({
  id: h.id, name: h.publicName || h.name, description: h.publicDescription, eligibility: h.publicEligibility, category: h.category.name, location: h.location, frequency: h.frequency, meetingDays: h.meetingDays, startTime: h.startTime, endTime: h.endTime, registrationOpen: h.registrationOpen,
})

const publicSite = async () => {
  const [c, profile, domain] = await Promise.all([getConfig(), madrasaProfile(), prisma.siteDomain.findFirst({ select: { hostname: true }, orderBy: { createdAt: 'asc' } })])
  return {
    name: c.siteName || profile.name, nameAr: c.siteNameAr, tagline: c.tagline, logo: assetUrl(c.logoAssetId), colors: c.colors, contact: c.contact, languages: c.languages, privacyNotice: c.privacyNotice, consentText: c.consentText, showSeats: c.showSeats, canonicalHost: domain?.hostname ?? null,
    forms: Object.fromEntries(Object.entries(c.forms).map(([type, f]) => [type, { enabled: f.enabled, instructions: f.instructions, allowDocuments: f.allowDocuments, fields: f.fields }])),
  }
}

publicRouter.get('/site', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(await publicSite())
})

const ItemsQuery = z.object({ type: z.enum(['PAGE', 'PROGRAM', 'ANNOUNCEMENT', 'EVENT', 'FAQ']) })
publicRouter.get('/items', async (req, res) => {
  const { type } = ItemsQuery.parse(req.query)
  const rows = await prisma.siteItem.findMany({ where: { type, ...liveWhere() }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { publishedAt: 'desc' }], take: 200 })
  res.json({ items: rows.map(publicItem) })
})

publicRouter.get('/items/:type/:slug', async (req, res) => {
  const { type } = ItemsQuery.parse({ type: req.params.type })
  const slug = z.string().max(100).parse(req.params.slug)
  const row = await prisma.siteItem.findFirst({ where: { type, slug, ...liveWhere() } })
  if (!row) throw notFound()
  res.json(publicItem(row))
})

publicRouter.get('/halaqas', async (_req, res) => {
  const rows = await prisma.halaqa.findMany({ where: { isPublic: true, status: { in: ['PLANNED', 'ACTIVE'] } }, include: { category: { select: { name: true } } }, orderBy: { name: 'asc' } })
  res.json({ items: rows.map(publicHalaqa) })
})

publicRouter.get('/assets/:id', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id)
  const a = await prisma.siteAsset.findUnique({ where: { id } })
  if (!a) throw notFound()
  res.setHeader('Content-Type', a.contentType).setHeader('X-Content-Type-Options', 'nosniff').setHeader('Cache-Control', 'public, max-age=3600').end(await readStored(a.storageKey))
})

/** A draft, for someone holding a short-lived link made in the CMS. Never indexed. */
publicRouter.get('/preview/:token', async (req, res) => {
  const claims = verifyPreview(z.string().max(300).parse(req.params.token))
  const row = claims && (await prisma.siteItem.findUnique({ where: { id: claims.id } }))
  if (!row) throw notFound()
  res.json(publicItem(row))
})

publicRouter.get('/form-token', (_req, res) => {
  const body = String(Date.now())
  res.json({ token: `${body}.${signForm(body)}` })
})

/** Bots rarely wait: a form sent within a few seconds of being opened, or with no token, is refused. */
function assertFormToken(token: string) {
  const [ts, sig] = token.split('.')
  const age = Date.now() - Number(ts)
  if (!ts || !sig || !safeEqual(sig, signForm(ts)) || !(age >= FORM_TOKEN_MIN_MS && age <= FORM_TOKEN_MAX_MS)) throw new AppError(422, 'FORM_EXPIRED', 'Please reload the page and try again.')
}

const Phone = z.string().trim().regex(/^[+\d][\d\s()-]{6,19}$/, 'Enter a valid phone number.')
const Email = z.string().trim().email('Enter a valid email address.').max(254)
const Submit = z.object({
  type: z.enum(['ADMISSION', 'HALAQA', 'MUREED', 'EVENT', 'ENQUIRY']),
  applicantName: z.string().trim().min(2, 'Enter your name.').max(120),
  phone: Phone.optional().or(z.literal('').transform(() => undefined)),
  email: Email.optional().or(z.literal('').transform(() => undefined)),
  answers: z.record(z.string(), z.union([z.string().max(3000), z.number()])).default({}),
  consent: z.boolean(),
  halaqaId: z.string().uuid().optional(),
  siteItemId: z.string().uuid().optional(),
  formToken: z.string().max(200),
  /** Hidden from people; a bot fills it in. */
  website: z.string().max(200).optional(),
})

// Files arrive base64-encoded inside the JSON sent by the Next.js server.
const FileBody = z.object({ name: z.string().max(200), contentType: z.string().max(100), label: z.string().max(100).optional(), base64: z.string().max(7_500_000) })
const big = express.json({ limit: '40mb' })
const small = express.json({ limit: '10kb' })
const toFiles = (files: z.infer<typeof FileBody>[]): UploadedFile[] => files.map((f) => ({ name: f.name, contentType: f.contentType, label: f.label, body: Buffer.from(f.base64, 'base64') }))

publicRouter.post('/applications', big, async (req, res) => {
  await consume(LIMITS.publicSubmitPerIp, clientIp(req))
  const b = Submit.extend({ files: z.array(FileBody).max(5).default([]) }).parse(req.body)
  // A filled honeypot gets the same answer as success, with nothing saved, so a bot learns nothing.
  if (b.website) return void res.status(201).json({ reference: 'APP-RECEIVED' })
  assertFormToken(b.formToken)
  res.status(201).json(await submitApplication({ type: b.type, applicantName: b.applicantName, phone: b.phone, email: b.email, answers: b.answers, consent: b.consent, halaqaId: b.halaqaId, siteItemId: b.siteItemId, files: toFiles(b.files) }))
})

const StatusBody = z.object({ reference: z.string().trim().min(5).max(30), contact: z.string().trim().min(5).max(254) })
publicRouter.post('/applications/status', small, async (req, res) => {
  await consume(LIMITS.publicLookupPerIp, clientIp(req))
  const b = StatusBody.parse(req.body)
  res.json(await publicStatus(b.reference, b.contact))
})

const Respond = z.object({ token: z.string().min(20).max(100), message: z.string().trim().min(2).max(3000), files: z.array(FileBody).max(5).default([]) })
publicRouter.post('/applications/respond', big, async (req, res) => {
  await consume(LIMITS.publicLookupPerIp, clientIp(req))
  const b = Respond.parse(req.body)
  await publicRespond(b.token, b.message, toFiles(b.files))
  res.status(204).end()
})
