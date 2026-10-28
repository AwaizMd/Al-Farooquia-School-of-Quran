import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let admin: Client
beforeEach(async () => {
  await resetDatabase()
  await prisma.$executeRawUnsafe(`SELECT setval('admission_no_seq', 1500)`)
  fx = await seedPeopleFixture()
  admin = client()
  await admin.post('/api/v1/auth/login', { identifier: 'admin@x.test', password: PASSWORD })
})

const admission = () => ({
  name: '  Yusuf   Rahman ', gender: 'MALE', dob: '2014-05-01', admissionDate: '2026-10-01', groupId: fx.groups.gA.id,
  phone: '+91 98765 43210', hostelResident: false, feePlanId: fx.plan.id,
  guardian: { name: 'Rahman Ali', relation: 'Father', phone: '+91 98765 43210', email: 'Rahman@X.test' },
})

describe('admissions', () => {
  it('admits a student with a new guardian, a sequence admission number and history', async () => {
    const r = await admin.post('/api/v1/students', admission())
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ admissionNo: 'S-1501', name: 'Yusuf Rahman', group: { code: 'g-a' }, guardians: [{ name: 'Rahman Ali', email: 'rahman@x.test', isPrimary: true }], mentor: { code: 'm1' }, concession: null })
    expect(await prisma.groupEnrollment.count({ where: { studentId: r.body.id, endedOn: null } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { action: 'student.admitted', entityId: r.body.id } })).toBe(1)
  })

  it('warns about a likely duplicate admission and allows it only when confirmed', async () => {
    await admin.post('/api/v1/students', admission())
    const dup = await admin.post('/api/v1/students', admission())
    expect(dup.status).toBe(409)
    expect(dup.body.error).toMatchObject({ code: 'POSSIBLE_DUPLICATE', details: [{ admissionNo: 'S-1501' }] })
    const ok = await admin.post('/api/v1/students', { ...admission(), confirmDuplicate: true })
    expect(ok.body.admissionNo).toBe('S-1502')
  })

  it('links an existing guardian (siblings share one guardian record)', async () => {
    const r = await admin.post('/api/v1/students', { ...admission(), guardian: { existingId: fx.guardians.p1.id } })
    expect(r.body.guardians[0].code).toBe('p1')
    const parent = client()
    await parent.post('/api/v1/auth/login', { identifier: 'p1@x.test', password: PASSWORD })
    expect((await parent.get('/api/v1/students')).body.total).toBe(3)
  })

  it('validates input', async () => {
    const r = await admin.post('/api/v1/students', { ...admission(), dob: '2999-01-01', phone: 'abc', groupId: 'nope' })
    expect(r.status).toBe(422)
    expect(r.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['dob', 'groupId', 'phone'])
  })

  it('records a concession only with explicit permission and keeps its history', async () => {
    const r = await admin.patch('/api/v1/students/S-2', { concession: 'NEED_BASED' })
    expect(r.body.concession).toEqual({ kind: 'NEED_BASED', percent: 50 })
    await admin.patch('/api/v1/students/S-2', { concession: null })
    expect(await prisma.concession.count({ where: { studentId: fx.students.bilal.id } })).toBe(1)
    expect(await prisma.concession.count({ where: { studentId: fx.students.bilal.id, endedAt: null } })).toBe(0)
  })
})

describe('record updates', () => {
  it('moves a student between halqas with enrollment history and moves mentor access', async () => {
    const r = await admin.patch('/api/v1/students/S-2', { groupId: fx.groups.gB.id })
    expect(r.body.group.code).toBe('g-b')
    expect(await prisma.groupEnrollment.count({ where: { studentId: fx.students.bilal.id } })).toBe(2)
    const m = client()
    await m.post('/api/v1/auth/login', { identifier: 'm1@x.test', password: PASSWORD })
    expect((await m.get('/api/v1/students/S-2')).status).toBe(404)
  })

  it('does not reopen enrollment when only the fee plan changes', async () => {
    const plan2 = await prisma.feePlan.create({ data: { code: 'fp2', name: 'Residential', amountMinor: 350000, currency: 'INR' } })
    await admin.patch('/api/v1/students/S-2', { feePlanId: plan2.id })
    expect(await prisma.groupEnrollment.count({ where: { studentId: fx.students.bilal.id } })).toBe(1)
  })

  it('deactivates without deleting and audits changed fields without private values', async () => {
    await admin.patch('/api/v1/students/S-2', { status: 'INACTIVE', medicalNotes: 'New private note' })
    expect((await prisma.student.findUniqueOrThrow({ where: { id: fx.students.bilal.id } })).status).toBe('INACTIVE')
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: fx.students.bilal.id, action: 'student.deactivated' } })
    expect(JSON.stringify(log)).not.toContain('New private note')
    expect(log.summary).toContain('medicalNotes')
  })

  it('ignores fields the client must not set (mass assignment)', async () => {
    await admin.patch('/api/v1/students/S-2', { admissionNo: 'S-HACK', userId: fx.users.admin.id, name: 'Bilal Ahmed' })
    const s = await prisma.student.findUniqueOrThrow({ where: { id: fx.students.bilal.id } })
    expect(s.admissionNo).toBe('S-2')
    expect(s.userId).toBeNull()
  })

  it('updates the primary guardian and supports extra guardians', async () => {
    await admin.patch('/api/v1/students/S-2', { primaryGuardian: { phone: '+91 90000 11111' } })
    const r = await admin.post('/api/v1/students/S-2/guardians', { name: 'Uncle Two', relation: 'Uncle', phone: '+91 90000 22222' })
    expect(r.body.guardians.map((g: { name: string; isPrimary: boolean }) => [g.name, g.isPrimary])).toEqual([['Parent Two', true], ['Uncle Two', false]])
    expect(r.body.guardians[0].phone).toBe('+91 90000 11111')
    const primaryId = r.body.guardians[0].id
    expect((await admin.del(`/api/v1/students/S-2/guardians/${primaryId}`)).body.error.code).toBe('PRIMARY_GUARDIAN')
  })

  it('refuses to mark an assigned mentor inactive', async () => {
    const r = await admin.post(`/api/v1/staff/${fx.staff.m1.id}/status`, { status: 'INACTIVE' })
    expect(r.body.error.code).toBe('STAFF_ASSIGNED')
  })

  it('links a new account to an existing guardian record exactly once', async () => {
    const g = await prisma.guardian.create({ data: { code: 'p9', name: 'New Parent', relation: 'Father', phone: '+91 90000 33333' } })
    await admin.post('/api/v1/auth/reauthenticate', { password: PASSWORD })
    const ok = await admin.post('/api/v1/admin/users', { displayName: 'New Parent', email: 'np@x.test', roles: ['PARENT'], link: { kind: 'guardian', id: g.id } })
    expect(ok.status).toBe(201)
    const again = await admin.post('/api/v1/admin/users', { displayName: 'Imposter', email: 'imp@x.test', roles: ['PARENT'], link: { kind: 'guardian', id: g.id } })
    expect(again.body.error.code).toBe('LINK_UNAVAILABLE')
    expect(await prisma.user.count({ where: { email: 'imp@x.test' } })).toBe(0) // rolled back
  })
})
