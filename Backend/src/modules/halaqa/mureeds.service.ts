import type { Request } from 'express'
import { conflict, notFound } from '../../common/errors.js'
import { institutionToday } from '../../common/clock.js'
import { prisma } from '../../database/prisma.js'
import { queueDelivery, notifyUsers } from '../notifications/notify.service.js'
import { audit } from '../audit-logs/audit.service.js'
import { isoDate, toDate } from '../students/students.service.js'

// The Mureed directory and its records. Private notes have their own permission, and every
// read of them is audited because they are the most sensitive thing in this module.

async function mureed(id: string) {
  const p = await prisma.halaqaParticipant.findFirst({ where: { id, isMureed: true } })
  if (!p) throw notFound()
  return p
}

export async function profile(req: Request, id: string) {
  const p = await mureed(id)
  const [memberships, attendance, entries] = await Promise.all([
    prisma.halaqaMembership.findMany({ where: { participantId: id }, include: { halaqa: { select: { id: true, name: true } } }, orderBy: { joinedOn: 'desc' } }),
    prisma.halaqaAttendance.findMany({ where: { participantId: id }, include: { session: { select: { date: true, topic: true, halaqa: { select: { name: true } } } } }, orderBy: { session: { date: 'desc' } }, take: 100 }),
    prisma.mureedEntry.findMany({ where: { participantId: id }, orderBy: { date: 'desc' }, take: 200 }),
  ])
  await audit({ action: 'mureed.profile_viewed', summary: 'Mureed profile viewed', entityType: 'halaqa_participant', entityId: id }, req)
  return {
    id: p.id, fullName: p.fullName, phone: p.phone, email: p.email, address: p.address, guardianName: p.guardianName, guardianPhone: p.guardianPhone, dob: isoDate(p.dob), status: p.status, mureedSince: isoDate(p.mureedSince), hasPhoto: !!p.photoKey, notes: p.notes,
    memberships: memberships.map((m) => ({ id: m.id, halaqa: m.halaqa, joinedOn: isoDate(m.joinedOn), leftOn: isoDate(m.leftOn), status: m.status })),
    attendance: attendance.map((a) => ({ id: a.id, date: isoDate(a.session.date), halaqa: a.session.halaqa.name, topic: a.session.topic, status: a.status })),
    entries: entries.map((e) => ({ id: e.id, kind: e.kind, date: isoDate(e.date), summary: e.summary, dueDate: isoDate(e.dueDate), doneAt: e.doneAt })),
    canSeePrivateNotes: req.auth!.permissions.has('mureeds.private_notes'),
  }
}

export async function addEntry(req: Request, id: string, input: { kind: 'MEETING' | 'FOLLOW_UP' | 'COMMUNICATION'; date?: string | undefined; summary: string; dueDate?: string | undefined }) {
  await mureed(id)
  const e = await prisma.mureedEntry.create({ data: { participantId: id, kind: input.kind, date: toDate(input.date ?? (await institutionToday())), summary: input.summary, dueDate: input.dueDate ? toDate(input.dueDate) : null, createdById: req.auth!.user.id } as never }) as unknown as { id: string }
  await audit({ action: 'mureed.entry_added', summary: `Mureed ${input.kind.toLowerCase().replace('_', ' ')} recorded`, entityType: 'halaqa_participant', entityId: id }, req)
  return { id: e.id }
}

export async function completeFollowUp(req: Request, entryId: string) {
  const e = await prisma.mureedEntry.findUnique({ where: { id: entryId } })
  if (!e) throw notFound()
  if (e.kind !== 'FOLLOW_UP') throw conflict('NOT_A_FOLLOW_UP', 'Only a follow-up can be completed.')
  if (e.doneAt) throw conflict('ALREADY_DONE', 'This follow-up is already complete.')
  await prisma.mureedEntry.update({ where: { id: entryId }, data: { doneAt: new Date() } })
  await audit({ action: 'mureed.followup_done', summary: 'Mureed follow-up completed', entityType: 'halaqa_participant', entityId: e.participantId }, req)
}

// ---------- Private notes ----------

export async function listNotes(req: Request, id: string) {
  await mureed(id)
  const rows = await prisma.mureedPrivateNote.findMany({ where: { participantId: id }, orderBy: { createdAt: 'desc' } })
  // The note text never goes in the audit log: only that it was opened, and by whom.
  await audit({ action: 'mureed.notes_viewed', summary: 'Private notes opened', entityType: 'halaqa_participant', entityId: id }, req)
  return { items: rows.map((n) => ({ id: n.id, body: n.body, authorName: n.authorName, createdAt: n.createdAt, updatedAt: n.updatedAt })) }
}

export async function addNote(req: Request, id: string, body: string) {
  await mureed(id)
  const n = await prisma.mureedPrivateNote.create({ data: { participantId: id, body, authorId: req.auth!.user.id, authorName: req.auth!.user.displayName } as never }) as unknown as { id: string }
  await audit({ action: 'mureed.note_added', summary: 'Private note added', entityType: 'halaqa_participant', entityId: id }, req)
  return { id: n.id }
}

export async function updateNote(req: Request, noteId: string, body: string) {
  const n = await prisma.mureedPrivateNote.findUnique({ where: { id: noteId }, select: { participantId: true } })
  if (!n) throw notFound()
  await prisma.mureedPrivateNote.update({ where: { id: noteId }, data: { body } })
  await audit({ action: 'mureed.note_changed', summary: 'Private note changed', entityType: 'halaqa_participant', entityId: n.participantId }, req)
}

export async function deleteNote(req: Request, noteId: string) {
  const n = await prisma.mureedPrivateNote.findUnique({ where: { id: noteId }, select: { participantId: true } })
  if (!n) throw notFound()
  await prisma.mureedPrivateNote.delete({ where: { id: noteId } })
  await audit({ action: 'mureed.note_deleted', summary: 'Private note deleted', entityType: 'halaqa_participant', entityId: n.participantId }, req)
}

// ---------- Messages ----------

export interface MessageInput { halaqaId?: string | undefined; participantIds?: string[] | undefined; kind: 'ANNOUNCEMENT' | 'UPDATE' | 'SCHEDULE' | 'RESOURCE' | 'REMINDER' | 'CANCELLATION' | 'FOLLOW_UP'; subject: string; body: string }

/** Recipients are always worked out here. Email goes through the outbox; accounts also get an in-app notice. */
export async function sendMessage(req: Request, input: MessageInput) {
  if (input.halaqaId && !(await prisma.halaqa.findUnique({ where: { id: input.halaqaId }, select: { id: true } }))) throw notFound()
  const fromHalaqa = input.halaqaId ? (await prisma.halaqaMembership.findMany({ where: { halaqaId: input.halaqaId, status: 'ACTIVE' }, select: { participantId: true } })).map((m) => m.participantId) : []
  const ids = [...new Set([...fromHalaqa, ...(input.participantIds ?? [])])]
  const people = await prisma.halaqaParticipant.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true, email: true, isMureed: true, student: { select: { userId: true } } } })
  // A named recipient of another madrasa simply isn't found by the scoped query above.
  if (input.participantIds?.some((id) => !people.some((p) => p.id === id))) throw notFound()
  if (!people.length) throw conflict('NO_RECIPIENTS', 'There is nobody active to send this to.')
  const today = await institutionToday()
  let emailCount = 0
  const inAppCount = await prisma.$transaction(async (tx) => {
    const msg = await tx.halaqaMessage.create({ data: { halaqaId: input.halaqaId ?? null, kind: input.kind, subject: input.subject, body: input.body, recipientCount: people.length, emailCount: people.filter((p) => p.email).length, inAppCount: people.filter((p) => p.student?.userId).length, sentByName: req.auth!.user.displayName } as never }) as unknown as { id: string }
    for (const p of people) {
      if (p.email && (await queueDelivery(tx, { dedupeKey: `halaqa-message:${msg.id}:${p.id}`, channel: 'EMAIL', category: 'GENERAL', userId: p.student?.userId ?? null, recipient: p.email, subject: input.subject, body: input.body }))) emailCount++
      if (p.isMureed) await tx.mureedEntry.create({ data: { participantId: p.id, kind: 'COMMUNICATION', date: toDate(today), summary: `Message sent: ${input.subject}`, createdById: req.auth!.user.id } as never })
    }
    return notifyUsers(tx, people.map((p) => p.student?.userId), { category: 'GENERAL', title: input.subject, body: input.body.slice(0, 500) })
  })
  await audit({ action: 'halaqa.message_sent', summary: `Message "${input.subject}" sent to ${people.length} participant(s)`, entityType: 'halaqa', ...(input.halaqaId ? { entityId: input.halaqaId } : {}) }, req)
  return { recipients: people.length, emailQueued: emailCount, inApp: inAppCount, noContact: people.filter((p) => !p.email && !p.student?.userId).length }
}

export async function listMessages(q: { halaqaId?: string | undefined }) {
  const rows = await prisma.halaqaMessage.findMany({ where: q.halaqaId ? { halaqaId: q.halaqaId } : {}, orderBy: { sentAt: 'desc' }, take: 100, include: { halaqa: { select: { name: true } } } })
  return { items: rows.map((m) => ({ id: m.id, halaqa: m.halaqa?.name ?? null, kind: m.kind, subject: m.subject, body: m.body, recipientCount: m.recipientCount, emailCount: m.emailCount, inAppCount: m.inAppCount, sentByName: m.sentByName, sentAt: m.sentAt })) }
}
