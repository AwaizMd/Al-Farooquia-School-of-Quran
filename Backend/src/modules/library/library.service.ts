import type { Request } from 'express'
import { createHash, randomUUID } from 'node:crypto'
import type { Prisma } from '../../generated/prisma/client.js'
import type { LibraryAudience } from '../../generated/prisma/enums.js'
import { AppError, conflict, forbidden, notFound } from '../../common/errors.js'
import { env } from '../../config/env.js'
import { prisma } from '../../database/prisma.js'
import { storage } from '../../integrations/storage/storage.js'
import { audit } from '../audit-logs/audit.service.js'

/** Accepted uploads, identified by their first bytes as well as their declared type. */
const FILE_TYPES: Record<string, { ext: string; sniff: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', sniff: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'audio/mpeg': { ext: 'mp3', sniff: (b) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) },
  'audio/mp4': { ext: 'm4a', sniff: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
  'audio/ogg': { ext: 'ogg', sniff: (b) => b.subarray(0, 4).toString('latin1') === 'OggS' },
  'audio/wav': { ext: 'wav', sniff: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE' },
}
export const UPLOAD_TYPES = Object.keys(FILE_TYPES)

const isStaff = (req: Request) => req.auth!.roles.some((r) => r === 'ADMIN' || r === 'PRINCIPAL' || r === 'MENTOR' || r === 'WARDEN')

/** Which audiences the caller may open: staff see everything; families by the tracks of their linked students. */
async function audiencesFor(req: Request): Promise<LibraryAudience[]> {
  if (isStaff(req)) return ['ALL_STUDENTS', 'HIFZ', 'ALIM', 'STAFF_ONLY']
  const auth = req.auth!
  const or: Prisma.StudentWhereInput[] = []
  if (auth.roles.includes('PARENT')) or.push({ guardians: { some: { guardian: { userId: auth.user.id } } } })
  if (auth.roles.includes('STUDENT')) or.push({ userId: auth.user.id })
  if (!or.length) return []
  const tracks = new Set((await prisma.student.findMany({ where: { OR: or, status: 'ACTIVE' }, select: { group: { select: { track: true } } } })).map((s) => s.group.track))
  return ['ALL_STUDENTS', ...(tracks.has('HIFZ') ? (['HIFZ'] as const) : []), ...(tracks.has('ALIM') ? (['ALIM'] as const) : [])]
}

type Row = Prisma.LibraryResourceGetPayload<{ include: { file: true } }>
const view = (r: Row, canOpen: boolean, uploaders: Map<string, string>) => ({
  id: r.id, title: r.title, category: r.category, type: r.type, author: r.author, description: r.description, pages: r.pages, audience: r.audience, status: r.status,
  uploadedAt: r.createdAt, uploadedBy: r.uploadedById ? uploaders.get(r.uploadedById) ?? 'Staff' : 'Academic Office',
  file: r.file ? { name: r.file.originalName, mimeType: r.file.mimeType, sizeBytes: r.file.sizeBytes } : null, canOpen,
})

/** Families see restricted titles too (so they know they exist) but cannot open them; staff-only items stay hidden. */
export async function listResources(req: Request) {
  const allowed = await audiencesFor(req)
  const rows = await prisma.libraryResource.findMany({
    where: { status: 'ACTIVE', ...(isStaff(req) ? {} : { audience: { not: 'STAFF_ONLY' } }) },
    include: { file: true }, orderBy: { createdAt: 'desc' },
  })
  const uploaders = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.uploadedById).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]))
  return { items: rows.map((r) => view(r, allowed.includes(r.audience), uploaders)) }
}

export interface ResourceInput { title: string; category: string; type: string; author?: string | undefined; description?: string | undefined; pages?: number | undefined; audience: LibraryAudience }

export async function createResource(req: Request, input: ResourceInput) {
  const r = await prisma.libraryResource.create({ data: { ...input, author: input.author ?? null, description: input.description ?? null, pages: input.pages ?? null, uploadedById: req.auth!.user.id }, include: { file: true } })
  await audit({ action: 'library.added', summary: `${r.title} (${r.category} · ${r.audience})`, entityType: 'library_resource', entityId: r.id }, req)
  return view(r, true, new Map([[req.auth!.user.id, req.auth!.user.displayName]]))
}

function canEdit(req: Request, r: { uploadedById: string | null }) {
  return req.auth!.permissions.has('library.manage') || r.uploadedById === req.auth!.user.id
}

export async function updateResource(req: Request, id: string, patch: Partial<ResourceInput> & { status?: 'ACTIVE' | 'ARCHIVED' | undefined }) {
  const r = await prisma.libraryResource.findUnique({ where: { id } })
  if (!r) throw notFound()
  if (!canEdit(req, r)) throw forbidden('Only the uploader or the library administrator can change this resource.')
  const u = await prisma.libraryResource.update({ where: { id }, data: patch, include: { file: true } })
  await audit({ action: patch.status === 'ARCHIVED' ? 'library.archived' : 'library.updated', summary: `${u.title}: ${Object.keys(patch).join(', ')}`, entityType: 'library_resource', entityId: id }, req)
  return view(u, true, new Map())
}

/** Attach a file. Type is checked by content, the name is never used as a path, and nothing is overwritten. */
export async function attachFile(req: Request, id: string, body: Buffer, declaredType: string, originalName: string) {
  const r = await prisma.libraryResource.findUnique({ where: { id } })
  if (!r) throw notFound()
  if (!canEdit(req, r)) throw forbidden('Only the uploader or the library administrator can change this resource.')
  if (r.fileId) throw conflict('FILE_EXISTS', 'This resource already has a file. Add a new resource for a new version.')
  const type = FILE_TYPES[declaredType]
  if (!type) throw new AppError(415, 'UNSUPPORTED_FILE', 'Upload a PDF or an audio file (MP3, M4A, OGG or WAV).')
  if (body.length === 0) throw new AppError(422, 'EMPTY_FILE', 'The file is empty.')
  if (body.length > env.UPLOAD_MAX_MB * 1024 * 1024) throw new AppError(413, 'FILE_TOO_LARGE', `Files must be ${env.UPLOAD_MAX_MB} MB or smaller.`)
  if (!type.sniff(body)) throw new AppError(415, 'FILE_CONTENT_MISMATCH', 'The file’s contents do not match its type.')
  const key = `library/${randomUUID()}.${type.ext}`
  const safeName = originalName.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || `resource.${type.ext}`
  await storage().put(key, body, declaredType)
  try {
    await prisma.$transaction(async (tx) => {
      const file = await tx.storedFile.create({ data: { storageKey: key, originalName: safeName, mimeType: declaredType, sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), uploadedById: req.auth!.user.id } })
      const n = await tx.libraryResource.updateMany({ where: { id, fileId: null }, data: { fileId: file.id } })
      if (n.count !== 1) throw conflict('FILE_EXISTS', 'This resource already has a file.')
      await audit({ action: 'library.file_uploaded', summary: `${r.title}: ${safeName} (${Math.ceil(body.length / 1024)} KB)`, entityType: 'library_resource', entityId: id }, req, tx)
    })
  } catch (err) {
    await storage().remove(key).catch(() => {}) // do not leave orphaned bytes behind
    throw err
  }
  return { ok: true }
}

/** Authorise, then stream the file (or redirect to a short-lived signed URL on S3). */
export async function openFile(req: Request, id: string) {
  const r = await prisma.libraryResource.findUnique({ where: { id }, include: { file: true } })
  const allowed = await audiencesFor(req)
  if (!r || r.status !== 'ACTIVE' || !r.file || (r.audience === 'STAFF_ONLY' && !isStaff(req))) throw notFound()
  if (!allowed.includes(r.audience)) throw forbidden('This resource is restricted to another group.')
  const url = await storage().signedUrl(r.file.storageKey, r.file.originalName, r.file.mimeType)
  if (url) return { redirect: url }
  return { body: await storage().get(r.file.storageKey), name: r.file.originalName, mimeType: r.file.mimeType }
}
