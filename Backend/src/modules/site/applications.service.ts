import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import type { Request } from 'express'
import type { ApplicationStatus, ApplicationType } from '../../generated/prisma/enums.js'
import { AppError, conflict, notFound } from '../../common/errors.js'
import { institutionToday } from '../../common/clock.js'
import { IMAGE_TYPES, PDF_TYPE, checkUpload, safeFileName } from '../../common/fileTypes.js'
import { prisma, type Tx } from '../../database/prisma.js'
import { env } from '../../config/env.js'
import { readStored, storage } from '../../integrations/storage/storage.js'
import { audit } from '../audit-logs/audit.service.js'
import { addMember, createParticipantRecord, findExistingParticipant, phoneKeyOf } from '../halaqa/halaqa.service.js'
import { queueDelivery } from '../notifications/notify.service.js'
import { createStudent } from '../students/students.service.js'
import { getConfig, liveWhere, type FieldConfig } from './site.service.js'

// Public applications: visible and decidable only with applications.* (Principal alone).
// Approval creates or links records. It never creates a login.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Random, not sequential, so references cannot be guessed or used to count applications. */
const newReference = () => `APP-${Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

export const DOCUMENT_TYPES = { ...IMAGE_TYPES, ...PDF_TYPE }
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENTS = 5

export interface UploadedFile { name: string; contentType: string; body: Buffer; label?: string | undefined }

/** Checks every answer against the form as the madrasa has configured it; unknown fields are dropped. */
export function validateAnswers(fields: FieldConfig[], raw: Record<string, unknown>) {
  const answers: Record<string, string> = {}
  const errors: { path: string; message: string }[] = []
  for (const f of fields) {
    const value = typeof raw[f.key] === 'string' ? (raw[f.key] as string).trim() : typeof raw[f.key] === 'number' ? String(raw[f.key]) : ''
    if (!value) {
      if (f.required) errors.push({ path: f.key, message: `${f.label} is required.` })
      continue
    }
    const max = f.type === 'textarea' ? 3000 : 300
    if (value.length > max) errors.push({ path: f.key, message: `${f.label} is too long.` })
    else if (f.type === 'date' && !(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)))) errors.push({ path: f.key, message: `${f.label} must be a date.` })
    else if (f.type === 'number' && !/^\d{1,6}$/.test(value)) errors.push({ path: f.key, message: `${f.label} must be a number.` })
    else if (f.type === 'tel' && !/^[+\d][\d\s()-]{6,19}$/.test(value)) errors.push({ path: f.key, message: `${f.label} is not a valid phone number.` })
    else if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push({ path: f.key, message: `${f.label} is not a valid email address.` })
    else if (f.type === 'select' && f.options && !f.options.includes(value)) errors.push({ path: f.key, message: `Choose a value for ${f.label}.` })
    else answers[f.key] = value
  }
  return { answers, errors }
}

export interface SubmitInput { type: ApplicationType; applicantName: string; phone?: string | undefined; email?: string | undefined; answers: Record<string, unknown>; consent: boolean; halaqaId?: string | undefined; siteItemId?: string | undefined; files: UploadedFile[] }

export async function submitApplication(input: SubmitInput) {
  const config = await getConfig()
  const form = config.forms[input.type]
  if (!form.enabled) throw new AppError(404, 'FORM_CLOSED', 'This form is not open at the moment.')
  const errors: { path: string; message: string }[] = []
  if (!input.consent) errors.push({ path: 'consent', message: 'Please agree before sending.' })
  if (!input.phone && !input.email) errors.push({ path: 'phone', message: 'Give a phone number or an email address.' })
  const { answers, errors: fieldErrors } = validateAnswers(form.fields, input.answers)
  errors.push(...fieldErrors)

  // Targets must be what the website itself offers, so a tampered id reaches nothing private.
  let halaqaId: string | null = null
  let siteItemId: string | null = null
  if (input.type === 'HALAQA') {
    const h = input.halaqaId ? await prisma.halaqa.findFirst({ where: { id: input.halaqaId, isPublic: true, registrationOpen: true, status: { in: ['PLANNED', 'ACTIVE'] } }, select: { id: true } }) : null
    if (!h) errors.push({ path: 'halaqaId', message: 'Choose a Halaqa.' })
    halaqaId = h?.id ?? null
  }
  if (input.type === 'EVENT' || (input.type === 'ADMISSION' && input.siteItemId)) {
    const want = input.type === 'EVENT' ? 'EVENT' : 'PROGRAM'
    const item = input.siteItemId ? await prisma.siteItem.findFirst({ where: { id: input.siteItemId, type: want, ...liveWhere() }, select: { id: true } }) : null
    if (!item) errors.push({ path: 'siteItemId', message: want === 'EVENT' ? 'Choose an event.' : 'Choose a program.' })
    siteItemId = item?.id ?? null
  }
  if (errors.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', errors)

  if (input.files.length && !form.allowDocuments) throw new AppError(422, 'DOCUMENTS_NOT_ACCEPTED', 'This form does not take documents.')
  if (input.files.length > MAX_DOCUMENTS) throw new AppError(422, 'TOO_MANY_DOCUMENTS', `You can attach up to ${MAX_DOCUMENTS} documents.`)
  const checked = input.files.map((f) => ({ f, type: checkUpload(f.body, f.contentType, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, 'a PDF or an image') }))

  const phoneKey = phoneKeyOf(input.phone)
  const email = input.email?.trim().toLowerCase() || null
  const stored: { key: string; f: UploadedFile; ext: string }[] = []
  for (const { f, type } of checked) {
    const key = `applications/${randomUUID()}.${type.ext}`
    await storage().put(key, f.body, f.contentType)
    stored.push({ key, f, ext: type.ext })
  }
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialises submissions from one person, so a double click or retry cannot create two.
      const lockKey = `${input.type}:${phoneKey ?? email}:${halaqaId ?? siteItemId ?? ''}`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
      if (config.duplicateWindowDays > 0) {
        const since = new Date(Date.now() - config.duplicateWindowDays * 86_400_000)
        const dupe = await tx.application.findFirst({
          where: { type: input.type, halaqaId, siteItemId, createdAt: { gte: since }, status: { in: ['PENDING', 'INFO_REQUESTED', 'APPROVED'] }, OR: [...(phoneKey ? [{ phoneKey }] : []), ...(email ? [{ email }] : [])] },
          select: { id: true },
        })
        // The reference is not returned: anyone can type someone else's phone number.
        if (dupe) throw conflict('DUPLICATE_APPLICATION', 'An application with these contact details was already received. The office will be in touch.')
      }
      const app = await tx.application.create({
        data: {
          reference: newReference(), type: input.type, applicantName: input.applicantName.trim(), phone: input.phone?.trim() || null, phoneKey, email, answers, consentAt: new Date(), consentText: config.consentText, halaqaId, siteItemId,
          documents: { create: stored.map((s) => ({ label: s.f.label?.slice(0, 100) || 'Document', fileName: safeFileName(s.f.name, s.ext), storageKey: s.key, contentType: s.f.contentType, sizeBytes: s.f.body.length })) },
          events: { create: { kind: 'submitted', actorName: 'Applicant' } },
        } as never,
      }) as unknown as { id: string; reference: string }
      await audit({ action: 'application.submitted', summary: `${input.type} application received`, entityType: 'application', entityId: app.id, actor: { userId: null, name: 'Public website', role: 'public' } }, undefined, tx)
      if (config.notifyApplicants && email) await queueDelivery(tx, { dedupeKey: `application-received:${app.id}`, channel: 'EMAIL', category: 'GENERAL', recipient: email, subject: `Application received: ${app.reference}`, body: `We received your application. Your reference is ${app.reference}. Please keep it for your records.` })
      return { reference: app.reference }
    })
  } catch (err) {
    for (const s of stored) await storage().remove(s.key).catch(() => undefined)
    throw err
  }
}

/** Status lookup needs both the reference and the phone or email it was sent with. */
export async function publicStatus(reference: string, contact: string) {
  const app = await prisma.application.findUnique({ where: { reference: reference.trim().toUpperCase() }, select: { status: true, type: true, createdAt: true, phoneKey: true, email: true, anonymisedAt: true } })
  const matches = app && !app.anonymisedAt && (phoneKeyOf(contact) === app.phoneKey || contact.trim().toLowerCase() === app.email)
  // One answer for a wrong reference and a wrong contact.
  if (!matches) throw notFound()
  return { status: app.status, type: app.type, receivedOn: app.createdAt.toISOString().slice(0, 10) }
}

/** The applicant answers a request for more information, using the link sent to them. */
export async function publicRespond(token: string, message: string, files: UploadedFile[]) {
  const app = await prisma.application.findFirst({ where: { respondTokenHash: hashToken(token), status: 'INFO_REQUESTED', respondExpiresAt: { gt: new Date() } }, select: { id: true } })
  if (!app) throw notFound('This link has expired or was already used.')
  if (files.length > MAX_DOCUMENTS) throw new AppError(422, 'TOO_MANY_DOCUMENTS', `You can attach up to ${MAX_DOCUMENTS} documents.`)
  const checked = files.map((f) => ({ f, type: checkUpload(f.body, f.contentType, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, 'a PDF or an image') }))
  const stored: { key: string; f: UploadedFile; ext: string }[] = []
  for (const { f, type } of checked) {
    const key = `applications/${randomUUID()}.${type.ext}`
    await storage().put(key, f.body, f.contentType)
    stored.push({ key, f, ext: type.ext })
  }
  await prisma.$transaction(async (tx) => {
    for (const s of stored) await tx.applicationDocument.create({ data: { applicationId: app.id, label: s.f.label?.slice(0, 100) || 'Further information', fileName: safeFileName(s.f.name, s.ext), storageKey: s.key, contentType: s.f.contentType, sizeBytes: s.f.body.length } as never })
    await tx.applicationEvent.create({ data: { applicationId: app.id, kind: 'applicant_responded', note: message, actorName: 'Applicant' } as never })
    await tx.application.update({ where: { id: app.id }, data: { status: 'PENDING', respondTokenHash: null, respondExpiresAt: null } })
  })
}

// ---------- Principal ----------

type ListQuery = { type?: ApplicationType | undefined; status?: ApplicationStatus | undefined; search?: string | undefined; page: number; pageSize: number }

export async function listApplications(q: ListQuery) {
  const where = { ...(q.type ? { type: q.type } : {}), ...(q.status ? { status: q.status } : {}), ...(q.search ? { OR: [{ applicantName: { contains: q.search, mode: 'insensitive' as const } }, { reference: { contains: q.search.toUpperCase() } }, { phone: { contains: q.search } }, { email: { contains: q.search.toLowerCase() } }] } : {}) }
  const [total, rows] = await Promise.all([prisma.application.count({ where }), prisma.application.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { halaqa: { select: { name: true } }, siteItem: { select: { title: true } } } })])
  return { total, page: q.page, pageSize: q.pageSize, items: rows.map((a) => ({ id: a.id, reference: a.reference, type: a.type, status: a.status, applicantName: a.applicantName, phone: a.phone, email: a.email, createdAt: a.createdAt, target: a.halaqa?.name ?? a.siteItem?.title ?? null })) }
}

export async function getApplication(req: Request, id: string) {
  const a = await prisma.application.findUnique({ where: { id }, include: { documents: { orderBy: { createdAt: 'asc' } }, events: { orderBy: { at: 'asc' } }, halaqa: { select: { id: true, name: true } }, siteItem: { select: { id: true, title: true } } } })
  if (!a) throw notFound()
  await audit({ action: 'application.viewed', summary: 'Application opened', entityType: 'application', entityId: id }, req)
  return {
    id: a.id, reference: a.reference, type: a.type, status: a.status, applicantName: a.applicantName, phone: a.phone, email: a.email, answers: a.answers, consentAt: a.consentAt, consentText: a.consentText, halaqa: a.halaqa, siteItem: a.siteItem, studentId: a.studentId, participantId: a.participantId, createdAt: a.createdAt, decidedAt: a.decidedAt, anonymisedAt: a.anonymisedAt,
    documents: a.documents.map((d) => ({ id: d.id, label: d.label, fileName: d.fileName, contentType: d.contentType, sizeBytes: d.sizeBytes, createdAt: d.createdAt })),
    history: a.events.map((e) => ({ id: e.id, kind: e.kind, note: e.note, actorName: e.actorName, at: e.at })),
  }
}

export async function getDocument(req: Request, id: string) {
  const d = await prisma.applicationDocument.findUnique({ where: { id } })
  if (!d) throw notFound()
  await audit({ action: 'application.document_viewed', summary: 'Application document opened', entityType: 'application', entityId: d.applicationId }, req)
  return { body: await readStored(d.storageKey), contentType: d.contentType, fileName: d.fileName }
}

/** The row is locked so two decisions on one application cannot both succeed. */
async function lockedOpen(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM applications WHERE id = ${id}::uuid FOR UPDATE`
  const a = await tx.application.findUnique({ where: { id } })
  if (!a) throw notFound()
  if (a.status !== 'PENDING' && a.status !== 'INFO_REQUESTED') throw conflict('ALREADY_DECIDED', 'A decision has already been made on this application.')
  return a
}

const addEvent = (tx: Tx, req: Request, applicationId: string, kind: string, note?: string | null) => tx.applicationEvent.create({ data: { applicationId, kind, note: note ?? null, actorName: req.auth!.user.displayName } as never })

async function tellApplicant(tx: Tx, a: { id: string; email: string | null; reference: string }, kind: string, subject: string, body: string) {
  if ((await getConfig()).notifyApplicants && a.email) await queueDelivery(tx, { dedupeKey: `application-${kind}:${a.id}:${randomUUID()}`, channel: 'EMAIL', category: 'GENERAL', recipient: a.email, subject: `${subject}: ${a.reference}`, body })
}

export async function reject(req: Request, id: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const a = await lockedOpen(tx, id)
    await tx.application.update({ where: { id }, data: { status: 'REJECTED', decidedAt: new Date(), respondTokenHash: null, respondExpiresAt: null } })
    await addEvent(tx, req, id, 'rejected', reason)
    await audit({ action: 'application.rejected', summary: `Application ${a.reference} rejected`, entityType: 'application', entityId: id }, req, tx)
    // The internal reason stays internal.
    await tellApplicant(tx, a, 'rejected', 'Your application', `We have reviewed application ${a.reference} and are unable to accept it at this time. JazakAllahu khairan for your interest.`)
  })
  return getApplication(req, id)
}

export async function requestInfo(req: Request, id: string, message: string) {
  const token = randomBytes(32).toString('base64url')
  const a = await prisma.$transaction(async (tx) => {
    const row = await lockedOpen(tx, id)
    await tx.application.update({ where: { id }, data: { status: 'INFO_REQUESTED', respondTokenHash: hashToken(token), respondExpiresAt: new Date(Date.now() + 14 * 86_400_000) } })
    await addEvent(tx, req, id, 'info_requested', message)
    await audit({ action: 'application.info_requested', summary: `More information requested for ${row.reference}`, entityType: 'application', entityId: id }, req, tx)
    return row
  })
  const hosts = await prisma.siteDomain.findFirst({ select: { hostname: true } })
  const link = hosts ? `https://${hosts.hostname}/application/respond?token=${token}` : null
  let emailed = false
  if (a.email && link) emailed = await queueDelivery(prisma, { dedupeKey: `application-info:${id}:${hashToken(token).slice(0, 16)}`, channel: 'EMAIL', category: 'GENERAL', recipient: a.email, subject: `More information needed: ${a.reference}`, body: `${message}\n\nPlease reply using this link within 14 days:\n${link}` })
  // Without an email address the Principal passes the link on themself, so it is shown once.
  return { ...(await getApplication(req, id)), emailed, responseLink: env.NODE_ENV === 'test' || !emailed ? link : null }
}

export async function close(req: Request, id: string, note?: string) {
  await prisma.$transaction(async (tx) => {
    const a = await lockedOpen(tx, id)
    await tx.application.update({ where: { id }, data: { status: 'CLOSED', decidedAt: new Date(), respondTokenHash: null, respondExpiresAt: null } })
    await addEvent(tx, req, id, 'closed', note)
    await audit({ action: 'application.closed', summary: `Application ${a.reference} closed`, entityType: 'application', entityId: id }, req, tx)
  })
  return getApplication(req, id)
}

export interface ApproveInput { halaqaId?: string | undefined; groupId?: string | undefined; existingParticipantId?: string | undefined; existingStudentId?: string | undefined; note?: string | undefined; admissionDate?: string | undefined }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/**
 * Approve, creating or linking the record the application is for. Never creates a login:
 * student and parent accounts follow the office's usual invitation.
 */
export async function approve(req: Request, id: string, input: ApproveInput) {
  const a = await prisma.application.findUnique({ where: { id } })
  if (!a) throw notFound()
  if (a.status !== 'PENDING' && a.status !== 'INFO_REQUESTED') throw conflict('ALREADY_DECIDED', 'A decision has already been made on this application.')
  const answers = a.answers as Record<string, unknown>

  // Admissions use the existing admission service, outside the application transaction, because it runs its own.
  let studentId = input.existingStudentId ?? null
  if (a.type === 'ADMISSION') {
    if (studentId && !(await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } }))) throw notFound()
    if (!studentId) {
      const missing = [!input.groupId && 'groupId', !str(answers.dob) && 'dob', !a.phone && !str(answers.guardianPhone) && 'phone', !str(answers.guardianName) && 'guardianName'].filter(Boolean) as string[]
      if (missing.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', missing.map((path) => ({ path, message: path === 'groupId' ? 'Choose a class.' : `This application has no ${path}. Request it from the applicant, or link an existing student.` })))
      const gender = /^f/i.test(str(answers.gender) ?? '') ? 'FEMALE' : 'MALE'
      const phone = (a.phone ?? str(answers.guardianPhone))!
      const created = await createStudent(req, { name: a.applicantName, gender, dob: str(answers.dob)!, admissionDate: input.admissionDate ?? (await institutionToday()), groupId: input.groupId!, phone, address: str(answers.address), hostelResident: false, guardian: { name: str(answers.guardianName)!, relation: str(answers.guardianRelation) ?? 'Guardian', phone: str(answers.guardianPhone) ?? phone, ...(a.email ? { email: a.email } : {}) } } as never) as { id: string }
      studentId = created.id
    }
  }

  await prisma.$transaction(async (tx) => {
    const row = await lockedOpen(tx, id)
    let participantId: string | null = null
    if (row.type === 'HALAQA' || row.type === 'MUREED') {
      if (input.existingParticipantId) {
        const p = await tx.halaqaParticipant.findUnique({ where: { id: input.existingParticipantId }, select: { id: true, isMureed: true } })
        if (!p) throw notFound()
        participantId = p.id
        if (row.type === 'MUREED' && !p.isMureed) {
          await tx.halaqaParticipant.update({ where: { id: p.id }, data: { isMureed: true, mureedSince: new Date(await institutionToday()) } })
          await tx.participantEvent.create({ data: { participantId: p.id, kind: 'mureed_added', summary: `Recorded as a Mureed from application ${row.reference}`, actorName: req.auth!.user.displayName } as never })
        }
      } else {
        // Never a second record for someone already here: the Principal must choose to link them.
        const existing = await findExistingParticipant({ phone: row.phone, email: row.email })
        if (existing) throw new AppError(409, 'PARTICIPANT_EXISTS', 'Someone with these contact details is already registered. Link the application to them.', { participantId: existing.id, fullName: existing.fullName })
        participantId = (await createParticipantRecord(tx, req, { fullName: row.applicantName, phone: row.phone, email: row.email, address: str(answers.address) ?? null, isMureed: row.type === 'MUREED', notes: `From application ${row.reference}` })).id
      }
      const joinHalaqa = input.halaqaId ?? (row.type === 'HALAQA' ? row.halaqaId : null)
      if (joinHalaqa) await addMember(req, joinHalaqa, { participantId }, tx)
    }
    await tx.application.update({ where: { id }, data: { status: 'APPROVED', decidedAt: new Date(), studentId, participantId, respondTokenHash: null, respondExpiresAt: null } })
    await addEvent(tx, req, id, 'approved', input.note)
    await audit({ action: 'application.approved', summary: `Application ${row.reference} approved`, entityType: 'application', entityId: id, metadata: { studentId, participantId } }, req, tx)
    await tellApplicant(tx, row, 'approved', 'Your application', `Your application ${row.reference} has been accepted. The office will contact you about the next steps.`)
  })
  return getApplication(req, id)
}

export async function stats() {
  const [byStatus, byType, newEnquiries] = await Promise.all([
    prisma.application.groupBy({ by: ['status'], _count: true }),
    prisma.application.groupBy({ by: ['type'], _count: true, where: { status: { in: ['PENDING', 'INFO_REQUESTED'] } } }),
    prisma.application.count({ where: { type: 'ENQUIRY', status: 'PENDING' } }),
  ])
  const n = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0
  return { total: byStatus.reduce((t, x) => t + x._count, 0), pending: n('PENDING'), infoRequested: n('INFO_REQUESTED'), approved: n('APPROVED'), rejected: n('REJECTED'), closed: n('CLOSED'), newEnquiries, openByType: Object.fromEntries(byType.map((x) => [x.type, x._count])) }
}

/** Remove personal data of applications decided longer ago than the madrasa's retention rule. */
export async function applyRetention() {
  const { retentionDays } = await getConfig()
  if (!retentionDays) return { anonymised: 0 }
  const before = new Date(Date.now() - retentionDays * 86_400_000)
  const due = await prisma.application.findMany({ where: { anonymisedAt: null, status: { in: ['REJECTED', 'CLOSED', 'APPROVED'] }, decidedAt: { lt: before } }, select: { id: true }, take: 200 })
  for (const a of due) await anonymise(a.id, 'Retention rule')
  return { anonymised: due.length }
}

async function anonymise(id: string, actorName: string) {
  const docs = await prisma.applicationDocument.findMany({ where: { applicationId: id } })
  for (const d of docs) await storage().remove(d.storageKey).catch(() => undefined)
  await prisma.$transaction(async (tx) => {
    await tx.applicationDocument.deleteMany({ where: { applicationId: id } })
    await tx.application.update({ where: { id }, data: { applicantName: 'Removed', phone: null, phoneKey: null, email: null, answers: {}, anonymisedAt: new Date() } })
    await tx.applicationEvent.create({ data: { applicationId: id, kind: 'data_removed', note: 'Personal data and documents removed', actorName } as never })
  })
}

/** On request from the applicant, or when no longer needed. */
export async function removePersonalData(req: Request, id: string) {
  const a = await prisma.application.findUnique({ where: { id }, select: { status: true, reference: true, anonymisedAt: true } })
  if (!a) throw notFound()
  if (a.anonymisedAt) throw conflict('ALREADY_REMOVED', 'This data has already been removed.')
  if (a.status === 'PENDING' || a.status === 'INFO_REQUESTED') throw conflict('NOT_DECIDED', 'Reject or close the application first.')
  await anonymise(id, req.auth!.user.displayName)
  await audit({ action: 'application.data_removed', summary: `Personal data of ${a.reference} removed`, entityType: 'application', entityId: id }, req)
}
