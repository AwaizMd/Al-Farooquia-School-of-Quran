import type { Request } from 'express'
import type { Prisma } from '../../generated/prisma/client.js'
import type { ConcessionKind, Gender, StudentStatus } from '../../generated/prisma/enums.js'
import { AppError, conflict, forbidden, notFound } from '../../common/errors.js'
import { prisma } from '../../database/prisma.js'
import { ACCESS_INCLUDE, accessLevel, studentScope, type AccessLevel } from '../../policies/students.js'
import { audit } from '../audit-logs/audit.service.js'

type Tx = Prisma.TransactionClient

/** Institution defaults for each concession kind (approved with the student form). */
export const CONCESSION_PERCENT: Record<ConcessionKind, number> = { SIBLING: 10, NEED_BASED: 50, FULL_SPONSORSHIP: 100 }

const INCLUDE = {
  ...ACCESS_INCLUDE,
  feePlan: true,
  concessions: { where: { endedAt: null } },
} satisfies Prisma.StudentInclude
type Row = Prisma.StudentGetPayload<{ include: typeof INCLUDE }>

export const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
export const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function guardianView(g: Row['guardians'][number], level: AccessLevel) {
  const base = { id: g.guardian.id, code: g.guardian.code, name: g.guardian.name, relation: g.guardian.relation, phone: g.guardian.phone, isPrimary: g.isPrimary }
  return level === 'hostel' ? base : { ...base, email: g.guardian.email, occupation: g.guardian.occupation }
}

/** Shape a student for a viewer: fields outside their access level are never sent. */
export function project(s: Row, level: AccessLevel) {
  const mentor = s.group.mentors[0]?.staff
  const group = { id: s.group.id, code: s.group.code, name: s.group.name, short: s.group.short, track: s.group.track }
  const guardians = s.guardians.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((g) => guardianView(g, level))
  const identity = { id: s.id, admissionNo: s.admissionNo, name: s.name, gender: s.gender, dob: isoDate(s.dob), status: s.status, group, hostelResident: s.hostelResident, bloodGroup: s.bloodGroup, medicalNotes: s.medicalNotes, guardians, access: level }
  if (level === 'hostel') return identity
  const teaching = { ...identity, admissionDate: isoDate(s.admissionDate), phone: s.phone, address: s.address, mentor: mentor ? { code: mentor.code, displayName: mentor.displayName, title: mentor.title } : null }
  if (level === 'teaching') return teaching
  const c = s.concessions[0]
  return {
    ...teaching,
    feePlan: s.feePlan ? { id: s.feePlan.id, code: s.feePlan.code, name: s.feePlan.name, amountMinor: s.feePlan.amountMinor, currency: s.feePlan.currency } : null,
    concession: c ? { kind: c.kind, percent: c.percent } : null,
  }
}

export async function listStudents(req: Request, q: { search?: string | undefined; groupId?: string | undefined; status?: StudentStatus | undefined; hostel?: boolean | undefined; page: number; pageSize: number }) {
  const scope = studentScope(req.auth!)
  if (!scope) return { total: 0, page: q.page, pageSize: q.pageSize, items: [] }
  const where: Prisma.StudentWhereInput = {
    AND: [
      scope,
      q.groupId ? { groupId: q.groupId } : {},
      q.status ? { status: q.status } : {},
      q.hostel !== undefined ? { hostelResident: q.hostel } : {},
      q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { admissionNo: { contains: q.search, mode: 'insensitive' } }] } : {},
    ],
  }
  const [total, rows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({ where, include: INCLUDE, orderBy: [{ admissionNo: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ])
  return { total, page: q.page, pageSize: q.pageSize, items: rows.map((s) => project(s, accessLevel(req.auth!, s)!)) }
}

/** Find one student the caller may see, by id or admission number. Out-of-scope looks exactly like missing. */
export async function findVisible(req: Request, ref: string) {
  const scope = studentScope(req.auth!)
  if (!scope) throw notFound()
  const s = await prisma.student.findFirst({ where: { AND: [scope, UUID.test(ref) ? { id: ref } : { admissionNo: ref }] }, include: INCLUDE })
  const level = s && accessLevel(req.auth!, s)
  if (!s || !level) throw notFound()
  return { row: s, level }
}

export async function getStudent(req: Request, ref: string) {
  const { row, level } = await findVisible(req, ref)
  return project(row, level)
}

// ---------- Writes (administration) ----------

export interface NewGuardian { name: string; relation: string; phone: string; email?: string | undefined; occupation?: string | undefined }
export type GuardianInput = { existingId: string } | NewGuardian

export interface StudentInput {
  name: string
  gender: Gender
  dob: string
  admissionDate: string
  groupId: string
  phone: string
  address?: string | undefined
  hostelResident: boolean
  bloodGroup?: string | undefined
  medicalNotes?: string | undefined
  feePlanId?: string | undefined
  concession?: ConcessionKind | null | undefined
  guardian: GuardianInput
  confirmDuplicate?: boolean | undefined
}

const normaliseName = (s: string) => s.trim().replace(/\s+/g, ' ')

async function nextCode(tx: Tx, seq: 'admission_no_seq' | 'guardian_code_seq', prefix: string, pad: number) {
  const [row] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT nextval('${seq}') AS n`)
  return `${prefix}${String(row!.n).padStart(pad, '0')}`
}

async function resolveGuardian(tx: Tx, g: GuardianInput) {
  if ('existingId' in g) {
    const found = await tx.guardian.findUnique({ where: { id: g.existingId } })
    if (!found) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'guardian.existingId', message: 'Guardian not found.' }])
    return found
  }
  return tx.guardian.create({ data: { code: await nextCode(tx, 'guardian_code_seq', 'G-', 4), name: normaliseName(g.name), relation: g.relation, phone: g.phone.trim(), email: g.email?.trim().toLowerCase() || null, occupation: g.occupation?.trim() || null } })
}

async function assertGroupAndPlan(tx: Tx, groupId: string, feePlanId: string | undefined) {
  const group = await tx.group.findUnique({ where: { id: groupId } })
  if (!group || !group.active) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'groupId', message: 'Choose an active halqa.' }])
  if (feePlanId) {
    const plan = await tx.feePlan.findUnique({ where: { id: feePlanId } })
    if (!plan || !plan.active) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'feePlanId', message: 'Choose an active fee plan.' }])
  }
  return group
}

export async function createStudent(req: Request, input: StudentInput) {
  if (input.concession && !req.auth!.permissions.has('concessions.manage')) throw forbidden('Only authorised staff can approve concessions.')
  const name = normaliseName(input.name)
  if (!input.confirmDuplicate) {
    // Same name and date of birth is almost always an accidental second admission.
    const dupes = await prisma.student.findMany({ where: { name: { equals: name, mode: 'insensitive' }, dob: toDate(input.dob) }, select: { admissionNo: true, name: true, status: true } })
    if (dupes.length) throw new AppError(409, 'POSSIBLE_DUPLICATE', 'A student with the same name and date of birth already exists.', dupes)
  }
  const created = await prisma.$transaction(async (tx) => {
    const group = await assertGroupAndPlan(tx, input.groupId, input.feePlanId)
    const guardian = await resolveGuardian(tx, input.guardian)
    const student = await tx.student.create({
      data: {
        admissionNo: await nextCode(tx, 'admission_no_seq', 'S-', 4),
        name, gender: input.gender, dob: toDate(input.dob), admissionDate: toDate(input.admissionDate), groupId: group.id,
        phone: input.phone.trim(), address: input.address?.trim() || null, hostelResident: input.hostelResident,
        bloodGroup: input.bloodGroup || null, medicalNotes: input.medicalNotes?.trim() || null, feePlanId: input.feePlanId ?? null,
        guardians: { create: { guardianId: guardian.id, isPrimary: true } },
        enrollments: { create: { groupId: group.id, startedOn: toDate(input.admissionDate) } },
        ...(input.concession ? { concessions: { create: { kind: input.concession, percent: CONCESSION_PERCENT[input.concession], approvedById: req.auth!.user.id } } } : {}),
      },
    })
    await audit({ action: 'student.admitted', summary: `Admitted to ${group.name}${input.confirmDuplicate ? ' (possible duplicate confirmed)' : ''}`, entityType: 'student', entityId: student.id, metadata: { admissionNo: student.admissionNo, guardian: guardian.code } }, req, tx)
    if (input.concession) await audit({ action: 'student.concession_set', summary: `Concession approved: ${input.concession} (${CONCESSION_PERCENT[input.concession]}%)`, entityType: 'student', entityId: student.id }, req, tx)
    return student
  })
  return getStudent(req, created.id)
}

export interface StudentPatch extends Partial<Omit<StudentInput, 'guardian' | 'confirmDuplicate'>> {
  status?: StudentStatus | undefined
  primaryGuardian?: Partial<NewGuardian> | undefined
}

// Fields whose values are not copied into the audit log (only that they changed).
const PRIVATE_FIELDS = new Set(['medicalNotes', 'address', 'phone', 'dob', 'bloodGroup'])

export async function updateStudent(req: Request, ref: string, patch: StudentPatch) {
  const { row } = await findVisible(req, ref)
  if (patch.concession !== undefined && !req.auth!.permissions.has('concessions.manage')) throw forbidden('Only authorised staff can change concessions.')
  await prisma.$transaction(async (tx) => {
    const movesGroup = !!patch.groupId && patch.groupId !== row.groupId
    const checked = movesGroup || patch.feePlanId ? await assertGroupAndPlan(tx, movesGroup ? patch.groupId! : row.groupId, patch.feePlanId) : null
    const group = movesGroup ? checked : null
    const data: Prisma.StudentUncheckedUpdateInput = {}
    const changed: string[] = []
    const setIf = <K extends keyof Prisma.StudentUncheckedUpdateInput>(key: K, value: Prisma.StudentUncheckedUpdateInput[K] | undefined, current: unknown) => {
      if (value === undefined) return
      const same = value instanceof Date && current instanceof Date ? value.getTime() === current.getTime() : value === current
      if (!same) {
        data[key] = value
        changed.push(String(key))
      }
    }
    setIf('name', patch.name && normaliseName(patch.name), row.name)
    setIf('gender', patch.gender, row.gender)
    setIf('dob', patch.dob ? toDate(patch.dob) : undefined, row.dob)
    setIf('admissionDate', patch.admissionDate ? toDate(patch.admissionDate) : undefined, row.admissionDate)
    setIf('phone', patch.phone?.trim(), row.phone)
    setIf('address', patch.address === undefined ? undefined : patch.address.trim() || null, row.address)
    setIf('hostelResident', patch.hostelResident, row.hostelResident)
    setIf('bloodGroup', patch.bloodGroup === undefined ? undefined : patch.bloodGroup || null, row.bloodGroup)
    setIf('medicalNotes', patch.medicalNotes === undefined ? undefined : patch.medicalNotes.trim() || null, row.medicalNotes)
    setIf('feePlanId', patch.feePlanId, row.feePlanId)
    setIf('status', patch.status, row.status)
    if (group) {
      data.groupId = group.id
      changed.push('groupId')
      const today = toDate(new Date().toISOString().slice(0, 10))
      await tx.groupEnrollment.updateMany({ where: { studentId: row.id, endedOn: null }, data: { endedOn: today } })
      await tx.groupEnrollment.create({ data: { studentId: row.id, groupId: group.id, startedOn: today } })
    }
    if (Object.keys(data).length) await tx.student.update({ where: { id: row.id }, data })

    if (patch.concession !== undefined) {
      const open = row.concessions[0]
      if ((open?.kind ?? null) !== patch.concession) {
        if (open) await tx.concession.update({ where: { id: open.id }, data: { endedAt: new Date() } })
        if (patch.concession) await tx.concession.create({ data: { studentId: row.id, kind: patch.concession, percent: CONCESSION_PERCENT[patch.concession], approvedById: req.auth!.user.id } })
        await audit({ action: 'student.concession_set', summary: patch.concession ? `Concession approved: ${patch.concession} (${CONCESSION_PERCENT[patch.concession]}%)` : 'Concession removed', entityType: 'student', entityId: row.id }, req, tx)
      }
    }

    if (patch.primaryGuardian && Object.keys(patch.primaryGuardian).length) {
      const primary = row.guardians.find((g) => g.isPrimary)
      if (!primary) throw conflict('NO_PRIMARY_GUARDIAN', 'This student has no primary guardian to update.')
      const pg = patch.primaryGuardian
      await tx.guardian.update({
        where: { id: primary.guardianId },
        data: { ...(pg.name ? { name: normaliseName(pg.name) } : {}), ...(pg.relation ? { relation: pg.relation } : {}), ...(pg.phone ? { phone: pg.phone.trim() } : {}), ...(pg.email !== undefined ? { email: pg.email.trim().toLowerCase() || null } : {}), ...(pg.occupation !== undefined ? { occupation: pg.occupation.trim() || null } : {}) },
      })
      changed.push('guardian')
    }

    if (changed.length) {
      const visible = Object.fromEntries(changed.filter((k) => !PRIVATE_FIELDS.has(k) && k in data).map((k) => [k, String(data[k as keyof typeof data])]))
      await audit({ action: patch.status && patch.status !== row.status ? `student.${patch.status === 'ACTIVE' ? 'reactivated' : 'deactivated'}` : 'student.updated', summary: `Updated: ${changed.join(', ')}`, entityType: 'student', entityId: row.id, metadata: { changed, values: visible } }, req, tx)
    }
  })
  return getStudent(req, row.id)
}

export async function linkGuardian(req: Request, ref: string, g: GuardianInput & { isPrimary?: boolean | undefined }) {
  const { row } = await findVisible(req, ref)
  await prisma.$transaction(async (tx) => {
    const guardian = await resolveGuardian(tx, g)
    if (row.guardians.some((x) => x.guardianId === guardian.id)) throw conflict('ALREADY_LINKED', 'This guardian is already linked to the student.')
    if (g.isPrimary) await tx.studentGuardian.updateMany({ where: { studentId: row.id }, data: { isPrimary: false } })
    await tx.studentGuardian.create({ data: { studentId: row.id, guardianId: guardian.id, isPrimary: !!g.isPrimary } })
    await audit({ action: 'student.guardian_linked', summary: `Guardian ${guardian.code} linked${g.isPrimary ? ' as primary' : ''}`, entityType: 'student', entityId: row.id }, req, tx)
  })
  return getStudent(req, row.id)
}

export async function unlinkGuardian(req: Request, ref: string, guardianId: string) {
  const { row } = await findVisible(req, ref)
  const link = row.guardians.find((g) => g.guardianId === guardianId)
  if (!link) throw notFound()
  if (link.isPrimary) throw conflict('PRIMARY_GUARDIAN', 'Choose another primary guardian before removing this one.')
  await prisma.$transaction(async (tx) => {
    await tx.studentGuardian.delete({ where: { studentId_guardianId: { studentId: row.id, guardianId } } })
    await audit({ action: 'student.guardian_unlinked', summary: `Guardian ${link.guardian.code} unlinked`, entityType: 'student', entityId: row.id }, req, tx)
  })
  return getStudent(req, row.id)
}
