import { createHmac, randomUUID } from 'node:crypto'
import type { Request } from 'express'
import { z } from 'zod'
import type { SiteItemStatus, SiteItemType } from '../../generated/prisma/enums.js'
import { AppError, conflict, notFound } from '../../common/errors.js'
import { IMAGE_TYPES, checkUpload, safeFileName } from '../../common/fileTypes.js'
import { safeEqual } from '../../common/crypto.js'
import { env } from '../../config/env.js'
import { prisma } from '../../database/prisma.js'
import { storage } from '../../integrations/storage/storage.js'
import { asOrg } from '../../tenancy/context.js'
import { audit } from '../audit-logs/audit.service.js'

// Website content and settings. Private records never pass through here: the public API
// reads only site_items and site_settings, plus the fields a Halaqa explicitly publishes.

const FieldConfig = z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/), label: z.string().trim().min(1).max(100), type: z.enum(['text', 'textarea', 'date', 'tel', 'email', 'select', 'number']).default('text'), required: z.boolean().default(false), options: z.array(z.string().trim().min(1).max(100)).max(50).optional() }).strict()
export type FieldConfig = z.infer<typeof FieldConfig>
const FormConfig = z.object({ enabled: z.boolean().default(false), fields: z.array(FieldConfig).max(40).default([]), allowDocuments: z.boolean().default(false), instructions: z.string().trim().max(1000).default('') }).strict()

const field = (key: string, label: string, type: FieldConfig['type'] = 'text', required = false): FieldConfig => ({ key, label, type, required })
/** The fields the request names. Which are required is the madrasa's choice; only name and one way of contact are fixed by the system. */
const DEFAULT_FORMS = {
  ADMISSION: { enabled: false, allowDocuments: true, instructions: '', fields: [field('dob', 'Date of birth', 'date', true), field('gender', 'Gender'), field('guardianName', 'Parent or guardian name', 'text', true), field('guardianPhone', 'Parent or guardian phone', 'tel', true), field('address', 'Address', 'textarea'), field('previousEducation', 'Previous education', 'textarea'), field('additional', 'Additional information', 'textarea')] },
  HALAQA: { enabled: false, allowDocuments: false, instructions: '', fields: [field('age', 'Age', 'number'), field('background', 'Relevant background', 'textarea'), field('availability', 'Availability'), field('additional', 'Additional information', 'textarea')] },
  MUREED: { enabled: false, allowDocuments: false, instructions: '', fields: [field('age', 'Age', 'number'), field('address', 'Address', 'textarea'), field('background', 'About yourself', 'textarea', true)] },
  EVENT: { enabled: false, allowDocuments: false, instructions: '', fields: [field('attendees', 'Number of people attending', 'number')] },
  ENQUIRY: { enabled: false, allowDocuments: false, instructions: '', fields: [field('message', 'Your message', 'textarea', true)] },
}

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #155C46.')
const Url = z.string().trim().url().max(500).refine((u) => /^https:\/\//.test(u), 'Use an https:// address.')
export const SiteConfig = z.object({
  siteName: z.string().trim().max(120).default(''),
  siteNameAr: z.string().trim().max(120).default(''),
  tagline: z.string().trim().max(200).default(''),
  logoAssetId: z.string().uuid().nullable().default(null),
  colors: z.object({ primary: Hex.default('#155C46'), accent: Hex.default('#B8893B') }).strict().prefault({}),
  contact: z.object({ address: z.string().trim().max(400).default(''), phone: z.string().trim().max(40).default(''), email: z.string().trim().max(254).default(''), mapUrl: Url.or(z.literal('')).default(''), hours: z.string().trim().max(200).default('') }).strict().prefault({}),
  languages: z.array(z.enum(['en', 'ar'])).min(1).default(['en']),
  privacyNotice: z.string().trim().max(5000).default(''),
  consentText: z.string().trim().max(500).default('I agree that the madarsa may store and use these details to process this application.'),
  /** Same phone or email, same type, within this many days, counts as a duplicate. 0 turns the check off. */
  duplicateWindowDays: z.number().int().min(0).max(365).default(30),
  /** Personal data of decided applications is removed after this many days. 0 keeps it until removed by hand. */
  retentionDays: z.number().int().min(0).max(3650).default(0),
  notifyApplicants: z.boolean().default(false),
  showSeats: z.boolean().default(false),
  forms: z.object({ ADMISSION: FormConfig, HALAQA: FormConfig, MUREED: FormConfig, EVENT: FormConfig, ENQUIRY: FormConfig }).strict().prefault(DEFAULT_FORMS),
}).strict()
export type SiteConfig = z.infer<typeof SiteConfig>

export async function getConfig() {
  const row = await prisma.siteSettings.findFirst()
  return SiteConfig.parse(row?.config ?? {})
}

export async function saveConfig(req: Request, config: SiteConfig) {
  if (config.logoAssetId && !(await prisma.siteAsset.findUnique({ where: { id: config.logoAssetId }, select: { id: true } }))) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'logoAssetId', message: 'Choose an uploaded image.' }])
  const row = await prisma.siteSettings.findFirst({ select: { id: true } })
  if (row) await prisma.siteSettings.update({ where: { id: row.id }, data: { config } })
  else await prisma.siteSettings.create({ data: { config } as never })
  await audit({ action: 'site.settings_changed', summary: 'Website settings changed', entityType: 'site' }, req)
  return config
}

// ---------- Domains: hostnames are global, so one madrasa cannot take another's ----------

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
export const normaliseHost = (h: string) => h.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')

export const listDomains = async () => ({ items: (await prisma.siteDomain.findMany({ orderBy: { hostname: 'asc' } })).map((d) => ({ id: d.id, hostname: d.hostname })) })

export async function addDomain(req: Request, hostname: string) {
  const host = normaliseHost(hostname)
  if (!HOSTNAME.test(host)) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'hostname', message: 'Enter a domain like madarsa.example.org.' }])
  try {
    const d = await prisma.siteDomain.create({ data: { hostname: host } as never }) as unknown as { id: string; hostname: string }
    await audit({ action: 'site.domain_added', summary: `Website address ${host} added`, entityType: 'site', entityId: d.id }, req)
    return { id: d.id, hostname: d.hostname }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('DOMAIN_TAKEN', 'This address is already in use.')
    throw err
  }
}

export async function removeDomain(req: Request, id: string) {
  const d = await prisma.siteDomain.findUnique({ where: { id } })
  if (!d) throw notFound()
  await prisma.siteDomain.delete({ where: { id } })
  await audit({ action: 'site.domain_removed', summary: `Website address ${d.hostname} removed`, entityType: 'site', entityId: id }, req)
}

/** Which madrasa a public request is for. Org-wide on purpose: the hostname is what selects the madrasa. */
export const madrasaForHost = (hostname: string) => asOrg('public site: hostname decides the madrasa', () => prisma.siteDomain.findUnique({ where: { hostname: normaliseHost(hostname) }, select: { madrasaId: true } }))

// ---------- Assets (public images) ----------

const ASSET_MAX = 5 * 1024 * 1024
export async function addAsset(req: Request, body: Buffer, declaredType: string, name: string) {
  const type = checkUpload(body, declaredType, IMAGE_TYPES, ASSET_MAX, 'a PNG, JPEG or WebP image')
  const key = `site/assets/${randomUUID()}.${type.ext}`
  await storage().put(key, body, declaredType)
  const a = await prisma.siteAsset.create({ data: { fileName: safeFileName(name, type.ext), storageKey: key, contentType: declaredType, sizeBytes: body.length } as never }) as unknown as { id: string; fileName: string }
  await audit({ action: 'site.asset_added', summary: `Image "${a.fileName}" uploaded`, entityType: 'site', entityId: a.id }, req)
  return { id: a.id, fileName: a.fileName }
}
export const listAssets = async () => ({ items: (await prisma.siteAsset.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })).map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes })) })

// ---------- Content ----------

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

export interface ItemInput { type?: SiteItemType | undefined; slug?: string | undefined; title?: string | undefined; summary?: string | null | undefined; body?: string | null | undefined; data?: Record<string, unknown> | undefined; category?: string | null | undefined; imageId?: string | null | undefined; featured?: boolean | undefined; sortOrder?: number | undefined; publishAt?: Date | null | undefined; expiresAt?: Date | null | undefined }

export const itemView = (i: { id: string; type: SiteItemType; slug: string; title: string; summary: string | null; body: string | null; data: unknown; category: string | null; imageId: string | null; featured: boolean; sortOrder: number; status: SiteItemStatus; publishAt: Date | null; expiresAt: Date | null; publishedAt: Date | null; updatedAt: Date }) => ({
  id: i.id, type: i.type, slug: i.slug, title: i.title, summary: i.summary, body: i.body, data: i.data, category: i.category, imageId: i.imageId, featured: i.featured, sortOrder: i.sortOrder, status: i.status, publishAt: i.publishAt, expiresAt: i.expiresAt, publishedAt: i.publishedAt, updatedAt: i.updatedAt,
})

export async function listItems(q: { type?: SiteItemType | undefined; status?: SiteItemStatus | undefined }) {
  const rows = await prisma.siteItem.findMany({ where: { ...(q.type ? { type: q.type } : {}), ...(q.status ? { status: q.status } : {}) }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { updatedAt: 'desc' }], take: 500 })
  return { items: rows.map(itemView) }
}

export async function getItem(id: string) {
  const i = await prisma.siteItem.findUnique({ where: { id } })
  if (!i) throw notFound()
  return itemView(i)
}

async function assertImage(imageId?: string | null) {
  if (imageId && !(await prisma.siteAsset.findUnique({ where: { id: imageId }, select: { id: true } }))) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'imageId', message: 'Choose an uploaded image.' }])
}

export async function createItem(req: Request, input: ItemInput & { type: SiteItemType; title: string }) {
  await assertImage(input.imageId)
  const slug = input.slug || slugify(input.title) || randomUUID().slice(0, 8)
  if (!SLUG.test(slug)) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'slug', message: 'Use lowercase letters, numbers and hyphens.' }])
  try {
    const i = await prisma.siteItem.create({ data: { ...input, slug, data: (input.data ?? {}) as never, createdById: req.auth!.user.id } as never }) as unknown as Parameters<typeof itemView>[0]
    await audit({ action: 'site.item_created', summary: `${input.type} "${input.title}" drafted`, entityType: 'site_item', entityId: i.id }, req)
    return itemView(i)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('SLUG_TAKEN', 'Another item of this type already uses this web address. Choose another.')
    throw err
  }
}

export async function updateItem(req: Request, id: string, input: ItemInput) {
  const before = await prisma.siteItem.findUnique({ where: { id } })
  if (!before) throw notFound()
  await assertImage(input.imageId)
  if (input.slug !== undefined && !SLUG.test(input.slug)) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'slug', message: 'Use lowercase letters, numbers and hyphens.' }])
  // Changing what is live takes it back to draft unless the person may publish: nothing unreviewed goes public.
  const mayPublish = req.auth!.permissions.has('site.publish')
  const status = before.status === 'PUBLISHED' && !mayPublish ? 'DRAFT' : before.status
  try {
    const i = await prisma.siteItem.update({ where: { id }, data: { ...input, ...(input.data ? { data: input.data as never } : {}), status } as never }) as unknown as Parameters<typeof itemView>[0] & { type: string }
    await audit({ action: 'site.item_updated', summary: `${i.type} "${i.title}" changed${status !== before.status ? ' and returned to draft' : ''}`, entityType: 'site_item', entityId: id }, req)
    return itemView(i)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('SLUG_TAKEN', 'Another item of this type already uses this web address. Choose another.')
    throw err
  }
}

/** Publish, unpublish, archive, or send for approval. Only site.publish can make something public. */
export async function setItemStatus(req: Request, id: string, status: SiteItemStatus) {
  const before = await prisma.siteItem.findUnique({ where: { id } })
  if (!before) throw notFound()
  if (status === 'PUBLISHED' && !req.auth!.permissions.has('site.publish')) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.')
  const i = await prisma.siteItem.update({ where: { id }, data: { status, ...(status === 'PUBLISHED' && !before.publishedAt ? { publishedAt: before.publishAt && before.publishAt > new Date() ? before.publishAt : new Date() } : {}) } })
  await audit({ action: 'site.item_status', summary: `${i.type} "${i.title}": ${before.status} to ${status}`, entityType: 'site_item', entityId: id }, req)
  return itemView(i)
}

export async function deleteItem(req: Request, id: string) {
  const i = await prisma.siteItem.findUnique({ where: { id }, select: { title: true, type: true, status: true } })
  if (!i) throw notFound()
  if (i.status === 'PUBLISHED') throw conflict('ITEM_PUBLISHED', 'Unpublish this first.')
  await prisma.siteItem.delete({ where: { id } })
  await audit({ action: 'site.item_deleted', summary: `${i.type} "${i.title}" deleted`, entityType: 'site_item', entityId: id }, req)
}

// ---------- Preview links: signed and short-lived, so a draft is not reachable by id ----------

const PREVIEW_TTL_MS = 60 * 60_000
const previewKey = () => createHmac('sha256', env.TOKEN_HMAC_KEY).update('site-preview-v1').digest()
const signPreview = (body: string) => createHmac('sha256', previewKey()).update(body).digest('base64url')

export async function previewLink(req: Request, id: string) {
  if (!(await prisma.siteItem.findUnique({ where: { id }, select: { id: true } }))) throw notFound()
  const body = `${id}.${Date.now() + PREVIEW_TTL_MS}`
  await audit({ action: 'site.preview_link', summary: 'Preview link created', entityType: 'site_item', entityId: id }, req)
  const domain = await prisma.siteDomain.findFirst({ select: { hostname: true }, orderBy: { createdAt: 'asc' } })
  const token = `${body}.${signPreview(body)}`
  return { token, url: domain ? `https://${domain.hostname}/preview/${token}` : null, expiresInMinutes: PREVIEW_TTL_MS / 60_000 }
}

export function verifyPreview(token: string) {
  const [id, exp, sig] = token.split('.')
  if (!id || !exp || !sig || !safeEqual(sig, signPreview(`${id}.${exp}`)) || Number(exp) < Date.now()) return null
  return { id }
}

/** What makes an item live. The single rule every public read uses. */
export const liveWhere = () => {
  const now = new Date()
  return { status: 'PUBLISHED' as const, AND: [{ OR: [{ publishAt: null }, { publishAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] }
}
