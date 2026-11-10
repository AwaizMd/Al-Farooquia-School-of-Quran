import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import QRCode from 'qrcode'
import { z } from 'zod'
import { AppError, conflict, notFound } from '../../common/errors.js'
import { addDaysIso, institutionToday } from '../../common/clock.js'
import { IMAGE_TYPES, PDF_TYPE, checkUpload, safeFileName } from '../../common/fileTypes.js'
import { prisma, type Tx } from '../../database/prisma.js'
import { readStored, storage } from '../../integrations/storage/storage.js'
import type { AuthContext } from '../../types/express.js'
import { audit } from '../audit-logs/audit.service.js'
import { isoDate, toDate } from '../students/students.service.js'
import { issueParticipantQr, verifyParticipantQr } from './participant-qr.js'

/** Each Halaqa's own attendance rules. */
export const AttendanceRules = z.object({
  allowQr: z.boolean().default(true),
  /** Teachers can mark this many days after a session; later changes are corrections by a manager. */
  teacherWindowDays: z.number().int().min(0).max(60).default(2),
  /** Whether an excused absence counts as attended in percentages. */
  excusedCounts: z.boolean().default(false),
}).strict()

const DEFAULT_CATEGORIES = ['Quran', 'Hifz', 'Tafseer', 'Hadith', 'Islamic Studies', 'Spiritual gatherings', 'Special Mureed gatherings']

export const phoneKeyOf = (phone?: string | null) => (phone ? phone.replace(/\D/g, '').slice(-10) || null : null)

/**
 * Who sees which Halaqas: managers all of them; a teacher only those they are assigned to.
 * Anything else is a 404, so existence is not revealed.
 */
export async function halaqaScope(auth: AuthContext) {
  if (auth.permissions.has('halaqa.read')) return {}
  if (!auth.permissions.has('halaqa.attendance')) return null
  const staff = await prisma.staffProfile.findFirst({ where: { userId: auth.user.id }, select: { id: true } })
  return staff ? { teacherStaffId: staff.id } : null
}

async function visibleHalaqa(req: Request, id: string) {
  const scope = await halaqaScope(req.auth!)
  const h = scope && (await prisma.halaqa.findFirst({ where: { id, ...scope } }))
  if (!h) throw notFound()
  return h
}

const event = (db: Tx | typeof prisma, req: Request, participantId: string, kind: string, summary: string) =>
  db.participantEvent.create({ data: { participantId, kind, summary, actorName: req.auth!.user.displayName } as never })

// ---------- Categories ----------

export async function listCategories() {
  let rows = await prisma.halaqaCategory.findMany({ orderBy: { name: 'asc' } })
  if (!rows.length) {
    await prisma.halaqaCategory.createMany({ data: DEFAULT_CATEGORIES.map((name) => ({ name })) as never, skipDuplicates: true })
    rows = await prisma.halaqaCategory.findMany({ orderBy: { name: 'asc' } })
  }
  return { items: rows.map((c) => ({ id: c.id, name: c.name, active: c.active })) }
}

export async function saveCategory(req: Request, id: string | null, input: { name?: string | undefined; active?: boolean | undefined }) {
  try {
    if (id) {
      if (!(await prisma.halaqaCategory.findUnique({ where: { id }, select: { id: true } }))) throw notFound()
      const c = await prisma.halaqaCategory.update({ where: { id }, data: input as never })
      await audit({ action: 'halaqa.category_changed', summary: `Halaqa category "${c.name}" changed`, entityType: 'halaqa_category', entityId: id }, req)
      return c
    }
    const c = await prisma.halaqaCategory.create({ data: { name: input.name! } as never })
    await audit({ action: 'halaqa.category_created', summary: `Halaqa category "${input.name}" created`, entityType: 'halaqa_category', entityId: (c as { id: string }).id }, req)
    return c
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('DUPLICATE_CATEGORY', 'A category with this name already exists.')
    throw err
  }
}

// ---------- Halaqas ----------

export interface HalaqaInput {
  name?: string | undefined; description?: string | null | undefined; categoryId?: string | undefined; purpose?: string | null | undefined; location?: string | null | undefined
  teacherStaffId?: string | null | undefined; frequency?: 'ONE_OFF' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM' | undefined; meetingDays?: number[] | undefined; startTime?: string | null | undefined; endTime?: string | null | undefined
  startDate?: string | null | undefined; endDate?: string | null | undefined; maxParticipants?: number | null | undefined; status?: 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'ENDED' | undefined; instructions?: string | null | undefined
  attendanceRules?: z.infer<typeof AttendanceRules> | undefined; isPublic?: boolean | undefined; publicName?: string | null | undefined; publicDescription?: string | null | undefined; publicEligibility?: string | null | undefined; registrationOpen?: boolean | undefined
}

const halaqaView = (h: Awaited<ReturnType<typeof findHalaqa>> & object, canSeeAll: boolean) => ({
  id: h.id, name: h.name, description: h.description, category: h.category, purpose: h.purpose, location: h.location, teacher: h.teacher, frequency: h.frequency, meetingDays: h.meetingDays, startTime: h.startTime, endTime: h.endTime,
  startDate: isoDate(h.startDate), endDate: isoDate(h.endDate), maxParticipants: h.maxParticipants, status: h.status, instructions: h.instructions, attendanceRules: AttendanceRules.parse(h.attendanceRules ?? {}), activeMembers: h._count.memberships,
  ...(canSeeAll ? { isPublic: h.isPublic, publicName: h.publicName, publicDescription: h.publicDescription, publicEligibility: h.publicEligibility, registrationOpen: h.registrationOpen } : {}),
})
const INCLUDE = { category: { select: { id: true, name: true } }, teacher: { select: { id: true, displayName: true } }, _count: { select: { memberships: { where: { status: 'ACTIVE' as const } } } } }
const findHalaqa = (id: string) => prisma.halaqa.findUnique({ where: { id }, include: INCLUDE })

export async function listHalaqas(req: Request) {
  const scope = await halaqaScope(req.auth!)
  if (!scope) return { items: [] }
  const rows = await prisma.halaqa.findMany({ where: scope, include: INCLUDE, orderBy: { name: 'asc' } })
  return { items: rows.map((h) => halaqaView(h, req.auth!.permissions.has('halaqa.read'))) }
}

export async function getHalaqa(req: Request, id: string) {
  await visibleHalaqa(req, id)
  return halaqaView((await findHalaqa(id))!, req.auth!.permissions.has('halaqa.read'))
}

async function assertRefs(input: HalaqaInput) {
  if (input.categoryId && !(await prisma.halaqaCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'categoryId', message: 'Choose a category.' }])
  if (input.teacherStaffId && !(await prisma.staffProfile.findUnique({ where: { id: input.teacherStaffId }, select: { id: true } }))) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'teacherStaffId', message: 'Choose a teacher.' }])
}

const halaqaData = (i: HalaqaInput) => {
  const { startDate, endDate, ...rest } = i
  return { ...rest, ...(startDate !== undefined ? { startDate: startDate ? toDate(startDate) : null } : {}), ...(endDate !== undefined ? { endDate: endDate ? toDate(endDate) : null } : {}) }
}

export async function createHalaqa(req: Request, input: HalaqaInput) {
  await assertRefs(input)
  try {
    const h = await prisma.halaqa.create({ data: halaqaData(input) as never }) as unknown as { id: string; name: string }
    await audit({ action: 'halaqa.created', summary: `Halaqa "${h.name}" created`, entityType: 'halaqa', entityId: h.id }, req)
    return getHalaqa(req, h.id)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('DUPLICATE_HALAQA', 'A Halaqa with this name already exists.')
    throw err
  }
}

export async function updateHalaqa(req: Request, id: string, input: HalaqaInput) {
  if (!(await prisma.halaqa.findUnique({ where: { id }, select: { id: true } }))) throw notFound()
  await assertRefs(input)
  try {
    const h = await prisma.halaqa.update({ where: { id }, data: halaqaData(input) as never })
    await audit({ action: 'halaqa.updated', summary: `Halaqa "${h.name}" changed: ${Object.keys(input).join(', ')}`, entityType: 'halaqa', entityId: id }, req)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('DUPLICATE_HALAQA', 'A Halaqa with this name already exists.')
    throw err
  }
  return getHalaqa(req, id)
}

// ---------- Participants ----------

export interface ParticipantInput {
  fullName?: string | undefined; phone?: string | null | undefined; email?: string | null | undefined; address?: string | null | undefined; guardianName?: string | null | undefined; guardianPhone?: string | null | undefined
  dob?: string | null | undefined; notes?: string | null | undefined; status?: 'ACTIVE' | 'INACTIVE' | undefined; studentId?: string | undefined; confirmDuplicate?: boolean | undefined
  isMureed?: boolean | undefined; mureedSince?: string | null | undefined
}

type ParticipantRow = NonNullable<Awaited<ReturnType<typeof prisma.halaqaParticipant.findUnique>>>
/** Mureed standing is only shown to those allowed to see the Mureed directory. */
const participantView = (p: ParticipantRow, canSeeMureed: boolean) => ({
  id: p.id, studentId: p.studentId, fullName: p.fullName, phone: p.phone, email: p.email, address: p.address, guardianName: p.guardianName, guardianPhone: p.guardianPhone, dob: isoDate(p.dob), hasPhoto: !!p.photoKey, status: p.status, notes: p.notes, createdAt: p.createdAt,
  ...(canSeeMureed ? { isMureed: p.isMureed, mureedSince: isoDate(p.mureedSince) } : {}),
})
const seesMureed = (req: Request) => req.auth!.permissions.has('mureeds.read')

export async function listParticipants(req: Request, q: { search?: string | undefined; status?: 'ACTIVE' | 'INACTIVE' | undefined; mureed?: boolean | undefined; page: number; pageSize: number }) {
  if (q.mureed !== undefined && !seesMureed(req)) throw notFound()
  const where = {
    ...(q.status ? { status: q.status } : {}),
    // Without the permission, Mureeds who are only Mureeds stay out of the list altogether.
    ...(q.mureed !== undefined ? { isMureed: q.mureed } : seesMureed(req) ? {} : { OR: [{ isMureed: false }, { memberships: { some: { status: 'ACTIVE' as const } } }] }),
    ...(q.search ? { AND: [{ OR: [{ fullName: { contains: q.search, mode: 'insensitive' as const } }, { phone: { contains: q.search } }, { email: { contains: q.search, mode: 'insensitive' as const } }] }] } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.halaqaParticipant.count({ where }),
    prisma.halaqaParticipant.findMany({ where, orderBy: { fullName: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { memberships: { where: { status: 'ACTIVE' }, include: { halaqa: { select: { id: true, name: true } } } } } }),
  ])
  return { total, page: q.page, pageSize: q.pageSize, items: rows.map((p) => ({ ...participantView(p, seesMureed(req)), halaqas: p.memberships.map((m) => m.halaqa) })) }
}

export async function getParticipant(req: Request, id: string) {
  const p = await prisma.halaqaParticipant.findUnique({ where: { id }, include: { memberships: { include: { halaqa: { select: { id: true, name: true } } }, orderBy: { joinedOn: 'desc' } }, events: { orderBy: { at: 'desc' }, take: 100 } } })
  if (!p) throw notFound()
  return {
    ...participantView(p, seesMureed(req)),
    memberships: p.memberships.map((m) => ({ id: m.id, halaqa: m.halaqa, joinedOn: isoDate(m.joinedOn), leftOn: isoDate(m.leftOn), status: m.status })),
    history: p.events.filter((e) => seesMureed(req) || !e.kind.startsWith('mureed')).map((e) => ({ id: e.id, kind: e.kind, summary: e.summary, actorName: e.actorName, at: e.at })),
  }
}

/** Someone already on record with this phone, email or student. Shared with public applications. */
export async function findExistingParticipant(input: { studentId?: string | null | undefined; phone?: string | null | undefined; email?: string | null | undefined }) {
  const phoneKey = phoneKeyOf(input.phone)
  const email = input.email?.trim().toLowerCase()
  const or = [...(input.studentId ? [{ studentId: input.studentId }] : []), ...(phoneKey ? [{ phoneKey }] : []), ...(email ? [{ email }] : [])]
  return or.length ? prisma.halaqaParticipant.findFirst({ where: { OR: or } }) : null
}

export async function createParticipantRecord(db: Tx | typeof prisma, req: Request, input: ParticipantInput) {
  const student = input.studentId ? await db.student.findUnique({ where: { id: input.studentId }, select: { id: true, name: true, phone: true, address: true, dob: true } }) : null
  if (input.studentId && !student) throw notFound()
  const phone = input.phone ?? student?.phone ?? null
  const p = await db.halaqaParticipant.create({
    data: {
      studentId: student?.id ?? null, fullName: input.fullName ?? student!.name, phone, phoneKey: phoneKeyOf(phone), email: input.email?.trim().toLowerCase() || null, address: input.address ?? student?.address ?? null, guardianName: input.guardianName ?? null, guardianPhone: input.guardianPhone ?? null,
      dob: input.dob ? toDate(input.dob) : student?.dob ?? null, notes: input.notes ?? null, isMureed: input.isMureed ?? false, mureedSince: input.isMureed ? toDate(input.mureedSince ?? (await institutionToday())) : null,
    } as never,
  }) as unknown as ParticipantRow
  await event(db, req, p.id, 'created', student ? 'Added from the student records' : 'Registered as a participant')
  if (input.isMureed) await event(db, req, p.id, 'mureed_added', 'Recorded as a Mureed')
  return p
}

export async function createParticipant(req: Request, input: ParticipantInput) {
  if (input.isMureed && !req.auth!.permissions.has('mureeds.manage')) throw notFound()
  if (input.studentId) {
    const already = await prisma.halaqaParticipant.findUnique({ where: { studentId: input.studentId }, select: { id: true } })
    if (already) throw new AppError(409, 'ALREADY_REGISTERED', 'This student is already registered as a participant.', { participantId: already.id })
  } else if (!input.confirmDuplicate) {
    const dupe = await findExistingParticipant(input)
    if (dupe) throw new AppError(409, 'POSSIBLE_DUPLICATE', 'Someone with this phone number or email is already registered.', { participantId: dupe.id, fullName: dupe.fullName })
  }
  try {
    const p = await prisma.$transaction((tx) => createParticipantRecord(tx, req, input))
    await audit({ action: 'halaqa.participant_created', summary: 'Halaqa participant registered', entityType: 'halaqa_participant', entityId: p.id }, req)
    return participantView(p, seesMureed(req))
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('ALREADY_REGISTERED', 'This student is already registered as a participant.')
    throw err
  }
}

export async function updateParticipant(req: Request, id: string, input: ParticipantInput) {
  const before = await prisma.halaqaParticipant.findUnique({ where: { id } })
  if (!before) throw notFound()
  if ((input.isMureed !== undefined || input.mureedSince !== undefined) && !req.auth!.permissions.has('mureeds.manage')) throw notFound()
  const { dob, mureedSince, email, phone, studentId: _ignored, confirmDuplicate: _c, ...rest } = input
  const today = await institutionToday()
  const p = await prisma.$transaction(async (tx) => {
    const row = await tx.halaqaParticipant.update({
      where: { id },
      data: {
        ...rest, ...(dob !== undefined ? { dob: dob ? toDate(dob) : null } : {}), ...(email !== undefined ? { email: email?.trim().toLowerCase() || null } : {}), ...(phone !== undefined ? { phone, phoneKey: phoneKeyOf(phone) } : {}),
        ...(input.isMureed === true && !before.isMureed ? { mureedSince: toDate(mureedSince ?? today) } : mureedSince ? { mureedSince: toDate(mureedSince) } : {}),
      } as never,
    })
    if (input.status && input.status !== before.status) await event(tx, req, id, 'status', input.status === 'ACTIVE' ? 'Activated' : 'Deactivated')
    if (input.isMureed !== undefined && input.isMureed !== before.isMureed) await event(tx, req, id, input.isMureed ? 'mureed_added' : 'mureed_removed', input.isMureed ? 'Recorded as a Mureed' : 'No longer recorded as a Mureed')
    return row
  })
  await audit({ action: 'halaqa.participant_updated', summary: `Participant changed: ${Object.keys(input).join(', ')}`, entityType: 'halaqa_participant', entityId: id }, req)
  return participantView(p, seesMureed(req))
}

const PHOTO_MAX = 3 * 1024 * 1024
export async function setPhoto(req: Request, id: string, body: Buffer, declaredType: string) {
  const type = checkUpload(body, declaredType, IMAGE_TYPES, PHOTO_MAX, 'a PNG, JPEG or WebP image')
  const before = await prisma.halaqaParticipant.findUnique({ where: { id }, select: { photoKey: true } })
  if (!before) throw notFound()
  const key = `halaqa/photos/${randomUUID()}.${type.ext}`
  await storage().put(key, body, declaredType)
  await prisma.halaqaParticipant.update({ where: { id }, data: { photoKey: key, photoType: declaredType } })
  if (before.photoKey) await storage().remove(before.photoKey).catch(() => undefined)
  await audit({ action: 'halaqa.participant_photo', summary: 'Participant photograph changed', entityType: 'halaqa_participant', entityId: id }, req)
  return { hasPhoto: true }
}

export async function getPhoto(id: string) {
  const p = await prisma.halaqaParticipant.findUnique({ where: { id }, select: { photoKey: true, photoType: true } })
  if (!p?.photoKey) throw notFound()
  return { body: await readStored(p.photoKey), contentType: p.photoType! }
}

// ---------- Memberships ----------

export async function addMember(req: Request, halaqaId: string, input: { participantId: string; joinedOn?: string | undefined }, db?: Tx) {
  const run = async (tx: Tx) => {
    const halaqa = await tx.halaqa.findUnique({ where: { id: halaqaId }, select: { id: true, name: true, maxParticipants: true, status: true } })
    const participant = await tx.halaqaParticipant.findUnique({ where: { id: input.participantId }, select: { id: true, status: true } })
    if (!halaqa || !participant) throw notFound()
    if (participant.status !== 'ACTIVE') throw conflict('PARTICIPANT_INACTIVE', 'This participant is inactive. Activate them first.')
    if (halaqa.status === 'ENDED') throw conflict('HALAQA_ENDED', 'This Halaqa has ended.')
    if (await tx.halaqaMembership.findFirst({ where: { halaqaId, participantId: input.participantId, status: 'ACTIVE' }, select: { id: true } })) throw conflict('ALREADY_MEMBER', 'This person is already in this Halaqa.')
    if (halaqa.maxParticipants !== null) {
      const n = await tx.halaqaMembership.count({ where: { halaqaId, status: 'ACTIVE' } })
      if (n >= halaqa.maxParticipants) throw conflict('HALAQA_FULL', 'This Halaqa has reached its maximum number of participants.')
    }
    const m = await tx.halaqaMembership.create({ data: { halaqaId, participantId: input.participantId, joinedOn: toDate(input.joinedOn ?? (await institutionToday())) } as never }) as unknown as { id: string }
    await event(tx, req, input.participantId, 'joined', `Joined ${halaqa.name}`)
    return m
  }
  // The Halaqa row is locked so two additions cannot both take the last seat.
  const lockAndRun = async (tx: Tx) => { await tx.$queryRaw`SELECT id FROM halaqas WHERE id = ${halaqaId}::uuid FOR UPDATE`; return run(tx) }
  const m = db ? await lockAndRun(db) : await prisma.$transaction(lockAndRun)
  await audit({ action: 'halaqa.member_added', summary: 'Participant added to a Halaqa', entityType: 'halaqa', entityId: halaqaId, metadata: { participantId: input.participantId } }, req)
  return m
}

export async function removeMember(req: Request, membershipId: string, leftOn?: string) {
  const m = await prisma.halaqaMembership.findUnique({ where: { id: membershipId }, include: { halaqa: { select: { name: true } } } })
  if (!m) throw notFound()
  if (m.status !== 'ACTIVE') throw conflict('NOT_ACTIVE', 'This person has already left this Halaqa.')
  await prisma.$transaction(async (tx) => {
    await tx.halaqaMembership.update({ where: { id: membershipId }, data: { status: 'LEFT', leftOn: toDate(leftOn ?? (await institutionToday())) } })
    await event(tx, req, m.participantId, 'left', `Left ${m.halaqa.name}`)
  })
  await audit({ action: 'halaqa.member_removed', summary: `Participant left ${m.halaqa.name}`, entityType: 'halaqa', entityId: m.halaqaId, metadata: { participantId: m.participantId } }, req)
}

export async function transferMember(req: Request, membershipId: string, toHalaqaId: string) {
  const m = await prisma.halaqaMembership.findUnique({ where: { id: membershipId }, include: { halaqa: { select: { name: true } } } })
  if (!m) throw notFound()
  if (m.status !== 'ACTIVE') throw conflict('NOT_ACTIVE', 'This person has already left this Halaqa.')
  if (toHalaqaId === m.halaqaId) throw conflict('SAME_HALAQA', 'Choose a different Halaqa.')
  const today = await institutionToday()
  await prisma.$transaction(async (tx) => {
    await addMember(req, toHalaqaId, { participantId: m.participantId, joinedOn: today }, tx)
    await tx.halaqaMembership.update({ where: { id: membershipId }, data: { status: 'TRANSFERRED', leftOn: toDate(today) } })
    await event(tx, req, m.participantId, 'transferred', `Moved out of ${m.halaqa.name}`)
  })
}

export async function roster(req: Request, halaqaId: string) {
  await visibleHalaqa(req, halaqaId)
  const full = req.auth!.permissions.has('halaqa.read')
  const rows = await prisma.halaqaMembership.findMany({ where: { halaqaId, status: 'ACTIVE' }, include: { participant: true }, orderBy: { participant: { fullName: 'asc' } } })
  // A teacher gets names only: no contact details, notes or Mureed standing.
  return { items: rows.map((m) => (full ? { membershipId: m.id, joinedOn: isoDate(m.joinedOn), ...participantView(m.participant, seesMureed(req)) } : { membershipId: m.id, id: m.participant.id, fullName: m.participant.fullName, status: m.participant.status })) }
}

// ---------- Sessions ----------

export interface SessionInput { date?: string | undefined; startTime?: string | null | undefined; endTime?: string | null | undefined; location?: string | null | undefined; topic?: string | null | undefined; description?: string | null | undefined; discussionNotes?: string | null | undefined; followUp?: string | null | undefined }

const sessionView = (s: { id: string; halaqaId: string; date: Date; startTime: string | null; endTime: string | null; location: string | null; status: string; rescheduledFrom: Date | null; cancelReason: string | null; topic: string | null; description: string | null; discussionNotes: string | null; followUp: string | null; seriesId: string | null; halaqa?: { name: string } }) => ({
  id: s.id, halaqaId: s.halaqaId, halaqaName: s.halaqa?.name, date: isoDate(s.date), startTime: s.startTime, endTime: s.endTime, location: s.location, status: s.status, rescheduledFrom: isoDate(s.rescheduledFrom), cancelReason: s.cancelReason, topic: s.topic, description: s.description, discussionNotes: s.discussionNotes, followUp: s.followUp, seriesId: s.seriesId,
})

export async function listSessions(req: Request, q: { halaqaId?: string | undefined; from?: string | undefined; to?: string | undefined; status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | undefined }) {
  const scope = await halaqaScope(req.auth!)
  if (!scope) return { items: [] }
  const rows = await prisma.halaqaSession.findMany({
    where: { halaqa: scope, ...(q.halaqaId ? { halaqaId: q.halaqaId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.from || q.to ? { date: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {}) },
    include: { halaqa: { select: { name: true } } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 500,
  })
  return { items: rows.map(sessionView) }
}

async function visibleSession(req: Request, id: string) {
  const scope = await halaqaScope(req.auth!)
  const s = scope && (await prisma.halaqaSession.findFirst({ where: { id, halaqa: scope }, include: { halaqa: { select: { name: true, attendanceRules: true } } } }))
  if (!s) throw notFound()
  return s
}

export async function getSession(req: Request, id: string) {
  const s = await visibleSession(req, id)
  const [materials, marks] = await Promise.all([
    prisma.sessionMaterial.findMany({ where: { sessionId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.halaqaAttendance.findMany({ where: { sessionId: id }, include: { corrections: { orderBy: { at: 'desc' } } } }),
  ])
  return {
    ...sessionView(s), materials: materials.map((m) => ({ id: m.id, fileName: m.fileName, contentType: m.contentType, sizeBytes: m.sizeBytes })),
    attendance: marks.map((a) => ({ id: a.id, participantId: a.participantId, status: a.status, source: a.source, corrections: a.corrections.map((c) => ({ fromStatus: c.fromStatus, toStatus: c.toStatus, reason: c.reason, correctedBy: c.correctedBy, at: c.at })) })),
  }
}

export async function createSession(req: Request, halaqaId: string, input: SessionInput & { date: string }) {
  const h = await prisma.halaqa.findUnique({ where: { id: halaqaId } })
  if (!h) throw notFound()
  const { date, ...rest } = input
  try {
    const s = await prisma.halaqaSession.create({ data: { halaqaId, date: toDate(date), ...rest, startTime: rest.startTime ?? h.startTime, endTime: rest.endTime ?? h.endTime, location: rest.location ?? h.location } as never }) as unknown as { id: string }
    await audit({ action: 'halaqa.session_created', summary: `Session of ${h.name} on ${date} created`, entityType: 'halaqa_session', entityId: s.id }, req)
    return getSession(req, s.id)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('SESSION_EXISTS', 'This Halaqa already has a session at that date and time.')
    throw err
  }
}

/** Dates of a recurring schedule. Pure, and capped so a typo cannot create years of sessions. */
export function recurringDates(p: { pattern: 'WEEKLY' | 'MONTHLY'; from: string; to: string; weekdays?: number[] | undefined; dayOfMonth?: number | undefined }) {
  const out: string[] = []
  for (let d = p.from; d <= p.to && out.length <= MAX_RECURRING; d = addDaysIso(d, 1)) {
    const x = new Date(`${d}T00:00:00Z`)
    if (p.pattern === 'WEEKLY' ? p.weekdays!.includes(x.getUTCDay()) : x.getUTCDate() === p.dayOfMonth) out.push(d)
  }
  return out
}
const MAX_RECURRING = 200

export async function createRecurring(req: Request, halaqaId: string, input: { pattern: 'WEEKLY' | 'MONTHLY'; from: string; to: string; weekdays?: number[] | undefined; dayOfMonth?: number | undefined; startTime?: string | undefined; endTime?: string | undefined; topic?: string | undefined }) {
  const h = await prisma.halaqa.findUnique({ where: { id: halaqaId } })
  if (!h) throw notFound()
  const dates = recurringDates(input)
  if (!dates.length) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'to', message: 'No dates fall in this range.' }])
  if (dates.length > MAX_RECURRING) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'to', message: `This would create more than ${MAX_RECURRING} sessions. Choose a shorter range.` }])
  const seriesId = randomUUID()
  const startTime = input.startTime ?? h.startTime
  const endTime = input.endTime ?? h.endTime
  const made = await prisma.halaqaSession.createMany({ data: dates.map((d) => ({ halaqaId, seriesId, date: toDate(d), startTime, endTime, location: h.location, topic: input.topic ?? null })) as never, skipDuplicates: true })
  await audit({ action: 'halaqa.sessions_scheduled', summary: `${made.count} sessions of ${h.name} scheduled, ${input.from} to ${input.to}`, entityType: 'halaqa', entityId: halaqaId }, req)
  return { created: made.count, skipped: dates.length - made.count, seriesId }
}

export async function updateSession(req: Request, id: string, input: SessionInput) {
  const s = await prisma.halaqaSession.findUnique({ where: { id } })
  if (!s) throw notFound()
  if (s.status === 'CANCELLED') throw conflict('SESSION_CANCELLED', 'This session was cancelled.')
  const { date, ...rest } = input
  const moved = date !== undefined && date !== isoDate(s.date)
  if (moved && s.status === 'COMPLETED') throw conflict('SESSION_COMPLETED', 'A completed session cannot be moved.')
  try {
    await prisma.halaqaSession.update({ where: { id }, data: { ...rest, ...(moved ? { date: toDate(date), rescheduledFrom: s.rescheduledFrom ?? s.date } : {}) } as never })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('SESSION_EXISTS', 'This Halaqa already has a session at that date and time.')
    throw err
  }
  await audit({ action: moved ? 'halaqa.session_rescheduled' : 'halaqa.session_updated', summary: moved ? `Session moved from ${isoDate(s.date)} to ${date}` : 'Session details changed', entityType: 'halaqa_session', entityId: id }, req)
  return getSession(req, id)
}

export async function setSessionStatus(req: Request, id: string, status: 'COMPLETED' | 'CANCELLED', reason?: string) {
  const s = await prisma.halaqaSession.findUnique({ where: { id } })
  if (!s) throw notFound()
  if (s.status !== 'SCHEDULED') throw conflict('SESSION_NOT_SCHEDULED', 'Only a scheduled session can be completed or cancelled.')
  await prisma.halaqaSession.update({ where: { id }, data: { status, cancelReason: status === 'CANCELLED' ? reason ?? null : null } })
  await audit({ action: `halaqa.session_${status.toLowerCase()}`, summary: `Session of ${isoDate(s.date)} ${status.toLowerCase()}${reason ? `: ${reason}` : ''}`, entityType: 'halaqa_session', entityId: id }, req)
  return getSession(req, id)
}

const MATERIAL_MAX = 10 * 1024 * 1024
export const MATERIAL_TYPES = { ...IMAGE_TYPES, ...PDF_TYPE }
export async function addMaterial(req: Request, sessionId: string, body: Buffer, declaredType: string, name: string) {
  const type = checkUpload(body, declaredType, MATERIAL_TYPES, MATERIAL_MAX, 'a PDF or an image')
  if (!(await prisma.halaqaSession.findUnique({ where: { id: sessionId }, select: { id: true } }))) throw notFound()
  const key = `halaqa/materials/${randomUUID()}.${type.ext}`
  await storage().put(key, body, declaredType)
  const m = await prisma.sessionMaterial.create({ data: { sessionId, fileName: safeFileName(name, type.ext), storageKey: key, contentType: declaredType, sizeBytes: body.length } as never }) as unknown as { id: string; fileName: string }
  await audit({ action: 'halaqa.material_added', summary: `Study material "${m.fileName}" added`, entityType: 'halaqa_session', entityId: sessionId }, req)
  return { id: m.id, fileName: m.fileName }
}

export async function getMaterial(req: Request, id: string) {
  const m = await prisma.sessionMaterial.findUnique({ where: { id } })
  if (!m) throw notFound()
  await visibleSession(req, m.sessionId)
  return { body: await readStored(m.storageKey), contentType: m.contentType, fileName: m.fileName }
}

// ---------- Attendance ----------

async function assertTeacherWindow(req: Request, s: { date: Date; halaqa: { attendanceRules: unknown } }) {
  if (req.auth!.permissions.has('halaqa.manage')) return
  const rules = AttendanceRules.parse(s.halaqa.attendanceRules ?? {})
  if (addDaysIso(isoDate(s.date)!, rules.teacherWindowDays) < (await institutionToday())) throw conflict('ATTENDANCE_WINDOW_CLOSED', 'The time for marking this session has passed. Ask the office to correct it.')
}

export async function markAttendance(req: Request, sessionId: string, marks: { participantId: string; status: 'PRESENT' | 'ABSENT' | 'EXCUSED' }[]) {
  const s = await visibleSession(req, sessionId)
  if (s.status === 'CANCELLED') throw conflict('SESSION_CANCELLED', 'This session was cancelled.')
  if (isoDate(s.date)! > (await institutionToday())) throw conflict('SESSION_IN_FUTURE', 'Attendance can be marked on or after the day of the session.')
  await assertTeacherWindow(req, s)
  const members = new Set((await prisma.halaqaMembership.findMany({ where: { halaqaId: s.halaqaId, participantId: { in: marks.map((m) => m.participantId) } }, select: { participantId: true } })).map((m) => m.participantId))
  const stranger = marks.find((m) => !members.has(m.participantId))
  if (stranger) throw notFound()
  await prisma.$transaction(async (tx) => {
    const existing = new Set((await tx.halaqaAttendance.findMany({ where: { sessionId, participantId: { in: marks.map((m) => m.participantId) } }, select: { participantId: true } })).map((a) => a.participantId))
    const fresh = marks.filter((m) => !existing.has(m.participantId))
    // A recorded mark changes only through a correction with a reason, so history stays true.
    if (fresh.length) await tx.halaqaAttendance.createMany({ data: fresh.map((m) => ({ sessionId, participantId: m.participantId, status: m.status, markedById: req.auth!.user.id })) as never, skipDuplicates: true })
  })
  await audit({ action: 'halaqa.attendance_marked', summary: `Attendance marked for ${marks.length} participant(s)`, entityType: 'halaqa_session', entityId: sessionId }, req)
  return getSession(req, sessionId)
}

export async function correctAttendance(req: Request, attendanceId: string, input: { status: 'PRESENT' | 'ABSENT' | 'EXCUSED'; reason: string }) {
  const a = await prisma.halaqaAttendance.findUnique({ where: { id: attendanceId } })
  if (!a) throw notFound()
  if (a.status === input.status) throw conflict('NO_CHANGE', 'The attendance already has this status.')
  await prisma.$transaction(async (tx) => {
    await tx.halaqaAttendanceCorrection.create({ data: { attendanceId, fromStatus: a.status, toStatus: input.status, reason: input.reason, correctedBy: req.auth!.user.displayName } as never })
    await tx.halaqaAttendance.update({ where: { id: attendanceId }, data: { status: input.status } })
  })
  await audit({ action: 'halaqa.attendance_corrected', summary: `Attendance changed from ${a.status} to ${input.status}: ${input.reason}`, entityType: 'halaqa_session', entityId: a.sessionId }, req)
  return getSession(req, a.sessionId)
}

export async function participantQr(req: Request, id: string, rotate: boolean) {
  const p = await prisma.halaqaParticipant.findUnique({ where: { id }, select: { id: true, fullName: true, qrVersion: true } })
  if (!p) throw notFound()
  let version = p.qrVersion
  if (rotate) {
    version = (await prisma.halaqaParticipant.update({ where: { id }, data: { qrVersion: { increment: 1 } } })).qrVersion
    await audit({ action: 'halaqa.qr_replaced', summary: 'Attendance card replaced; the old card no longer works', entityType: 'halaqa_participant', entityId: id }, req)
  }
  const token = issueParticipantQr(p.id, version)
  return { token, fullName: p.fullName, qrDataUrl: await QRCode.toDataURL(token, { margin: 1, width: 360 }) }
}

/** A scanned card: the server checks the signature, the session, and that the person belongs to this Halaqa. */
export async function scanAttendance(req: Request, sessionId: string, token: string) {
  const s = await visibleSession(req, sessionId)
  if (s.status === 'CANCELLED') throw conflict('SESSION_CANCELLED', 'This session was cancelled.')
  if (isoDate(s.date) !== (await institutionToday())) throw conflict('NOT_SESSION_DAY', 'A card can only be scanned on the day of the session.')
  if (!AttendanceRules.parse(s.halaqa.attendanceRules ?? {}).allowQr) throw conflict('QR_OFF', 'QR attendance is turned off for this Halaqa.')
  const claims = verifyParticipantQr(token)
  const p = claims && (await prisma.halaqaParticipant.findUnique({ where: { id: claims.participantId }, select: { id: true, fullName: true, qrVersion: true } }))
  // The same answer for a forged card, another madrasa's card and a replaced card.
  if (!p || !claims || p.qrVersion !== claims.version) throw new AppError(422, 'INVALID_CARD', 'This card is not valid.')
  const member = await prisma.halaqaMembership.findFirst({ where: { halaqaId: s.halaqaId, participantId: p.id, status: 'ACTIVE' }, select: { id: true } })
  if (!member) throw new AppError(422, 'NOT_A_MEMBER', 'This person is not in this Halaqa.')
  const existing = await prisma.halaqaAttendance.findUnique({ where: { sessionId_participantId: { sessionId, participantId: p.id } } })
  if (existing) return { fullName: p.fullName, status: existing.status, duplicate: true }
  await prisma.halaqaAttendance.createMany({ data: [{ sessionId, participantId: p.id, status: 'PRESENT', source: 'QR', markedById: req.auth!.user.id }] as never, skipDuplicates: true })
  await audit({ action: 'halaqa.attendance_scanned', summary: 'Attendance recorded from a card', entityType: 'halaqa_session', entityId: sessionId, metadata: { participantId: p.id } }, req)
  return { fullName: p.fullName, status: 'PRESENT', duplicate: false }
}

// ---------- Reports and dashboard ----------

export async function attendanceReport(q: { halaqaId?: string | undefined; participantId?: string | undefined; from: string; to: string }) {
  const rows = await prisma.halaqaAttendance.findMany({
    where: { ...(q.participantId ? { participantId: q.participantId } : {}), session: { ...(q.halaqaId ? { halaqaId: q.halaqaId } : {}), status: { not: 'CANCELLED' }, date: { gte: toDate(q.from), lte: toDate(q.to) } } },
    include: { session: { select: { date: true, halaqa: { select: { id: true, name: true, attendanceRules: true } } } }, participant: { select: { id: true, fullName: true } } },
  })
  const by = new Map<string, { participantId: string; fullName: string; halaqaId: string; halaqaName: string; month: string; present: number; absent: number; excused: number; total: number; attended: number }>()
  for (const r of rows) {
    const month = isoDate(r.session.date)!.slice(0, 7)
    const key = `${r.participantId}:${r.session.halaqa.id}:${month}`
    const e = by.get(key) ?? { participantId: r.participantId, fullName: r.participant.fullName, halaqaId: r.session.halaqa.id, halaqaName: r.session.halaqa.name, month, present: 0, absent: 0, excused: 0, total: 0, attended: 0 }
    e.total++
    if (r.status === 'PRESENT') { e.present++; e.attended++ }
    if (r.status === 'ABSENT') e.absent++
    if (r.status === 'EXCUSED') { e.excused++; if (AttendanceRules.parse(r.session.halaqa.attendanceRules ?? {}).excusedCounts) e.attended++ }
    by.set(key, e)
  }
  return { from: q.from, to: q.to, items: [...by.values()].sort((a, b) => a.month.localeCompare(b.month) || a.halaqaName.localeCompare(b.halaqaName) || a.fullName.localeCompare(b.fullName)).map(({ attended, ...e }) => ({ ...e, percent: e.total ? Math.round((attended / e.total) * 100) : null })) }
}

export async function dashboard(req: Request) {
  const today = await institutionToday()
  const [totalHalaqas, activeHalaqas, participants, inactive, mureeds, upcoming, completed, marks, recent, nextSessions] = await Promise.all([
    prisma.halaqa.count(), prisma.halaqa.count({ where: { status: 'ACTIVE' } }), prisma.halaqaParticipant.count(), prisma.halaqaParticipant.count({ where: { status: 'INACTIVE' } }),
    seesMureed(req) ? prisma.halaqaParticipant.count({ where: { isMureed: true } }) : Promise.resolve(null),
    prisma.halaqaSession.count({ where: { status: 'SCHEDULED', date: { gte: toDate(today) } } }), prisma.halaqaSession.count({ where: { status: 'COMPLETED' } }),
    prisma.halaqaAttendance.groupBy({ by: ['status'], _count: true, where: { session: { date: { gte: toDate(addDaysIso(today, -30)) } } } }),
    prisma.participantEvent.findMany({ where: seesMureed(req) ? {} : { NOT: { kind: { startsWith: 'mureed' } } }, orderBy: { at: 'desc' }, take: 10, include: { participant: { select: { fullName: true } } } }),
    prisma.halaqaSession.findMany({ where: { status: 'SCHEDULED', date: { gte: toDate(today) } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 5, include: { halaqa: { select: { name: true } } } }),
  ])
  const count = (s: string) => marks.find((m) => m.status === s)?._count ?? 0
  return {
    totalHalaqas, activeHalaqas, totalParticipants: participants, inactiveParticipants: inactive, totalMureeds: mureeds, upcomingSessions: upcoming, completedSessions: completed,
    attendance30Days: { present: count('PRESENT'), absent: count('ABSENT'), excused: count('EXCUSED') },
    recentActivity: recent.map((e) => ({ id: e.id, summary: e.summary, participant: e.participant.fullName, at: e.at })),
    nextSessions: nextSessions.map(sessionView),
  }
}


