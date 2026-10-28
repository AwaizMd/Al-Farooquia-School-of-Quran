import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
})

async function as(identifier: string): Promise<Client> {
  const c = client()
  const r = await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })
  expect(r.body.stage).toBe('full')
  return c
}
const names = (r: { body: { items: { name: string }[] } }) => r.body.items.map((s) => s.name).sort()

describe('student visibility is enforced on the server', () => {
  it('parents see exactly their linked children and can switch between them', async () => {
    const p = await as('p1@x.test')
    expect(names(await p.get('/api/v1/students'))).toEqual(['Ali', 'Sara'])
    expect((await p.get('/api/v1/students/S-3')).body.name).toBe('Sara')
  })

  it('a parent cannot open an unlinked child by admission number or id (IDOR)', async () => {
    const p = await as('p1@x.test')
    const byNo = await p.get('/api/v1/students/S-2')
    const byId = await p.get(`/api/v1/students/${fx.students.bilal.id}`)
    expect(byNo.status).toBe(404)
    expect(byId.status).toBe(404)
    // Missing and forbidden look the same.
    expect((await p.get('/api/v1/students/S-999')).body).toMatchObject({ error: { code: byNo.body.error.code } })
    // Filters cannot widen the scope.
    expect(names(await p.get(`/api/v1/students?groupId=${fx.groups.gA.id}`))).toEqual(['Ali'])
  })

  it('mentors see only students of halqas currently assigned to them, without fee data', async () => {
    const m = await as('m1@x.test')
    const list = await m.get('/api/v1/students')
    expect(names(list)).toEqual(['Ali', 'Bilal'])
    expect(list.body.items[0]).not.toHaveProperty('feePlan')
    expect(list.body.items[0]).not.toHaveProperty('concession')
    expect(list.body.items[0].access).toBe('teaching')
    expect((await m.get('/api/v1/students/S-3')).status).toBe(404)
  })

  it('reassigning a halqa moves mentor access immediately and keeps history', async () => {
    const admin = await as('admin@x.test')
    const r = await admin.put(`/api/v1/groups/${fx.groups.gA.id}/mentor`, { staffId: fx.staff.m2.id })
    expect(r.status).toBe(200)
    const m = await as('m1@x.test')
    expect(names(await m.get('/api/v1/students'))).toEqual([])
    expect(await prisma.groupMentorAssignment.count({ where: { groupId: fx.groups.gA.id } })).toBe(2)
    expect(await prisma.groupMentorAssignment.count({ where: { groupId: fx.groups.gA.id, endedAt: null } })).toBe(1)
  })

  it('wardens see active hostel residents with hostel fields only', async () => {
    const w = await as('warden@x.test')
    const list = await w.get('/api/v1/students')
    expect(names(list)).toEqual(['Ali'])
    const ali = list.body.items[0]
    expect(ali.access).toBe('hostel')
    expect(ali.medicalNotes).toBe('Asthma')
    expect(ali.guardians[0]).toEqual({ id: expect.any(String), code: 'p1', name: 'Parent One', relation: 'Father', phone: '+91 90000 00001', isPrimary: true })
    for (const k of ['feePlan', 'concession', 'address', 'phone', 'mentor', 'admissionDate']) expect(ali).not.toHaveProperty(k)
    expect((await w.get('/api/v1/students/S-2')).status).toBe(404)
  })

  it('students see only themselves', async () => {
    const s = await as('s-1')
    expect(names(await s.get('/api/v1/students'))).toEqual(['Ali'])
    expect((await s.get('/api/v1/students/S-3')).status).toBe(404)
  })

  it('a parent who is also a mentor gets the union, with the best access per student', async () => {
    await prisma.userRole.create({ data: { userId: fx.users.parent.id, role: 'MENTOR' } })
    await prisma.staffProfile.update({ where: { id: fx.staff.m2.id }, data: { userId: fx.users.parent.id } })
    const pm = await as('p1@x.test')
    const list = await pm.get('/api/v1/students')
    expect(names(list)).toEqual(['Ali', 'Sara'])
    expect(list.body.items.find((s: { name: string }) => s.name === 'Sara').access).toBe('full') // parent beats mentor
  })

  it('the Principal reads everything but cannot change records', async () => {
    const p = await as('principal@x.test')
    expect(names(await p.get('/api/v1/students'))).toEqual(['Ali', 'Bilal', 'Sara'])
    expect((await p.patch('/api/v1/students/S-1', { name: 'Changed' })).status).toBe(403)
    expect((await p.put(`/api/v1/groups/${fx.groups.gA.id}/mentor`, { staffId: fx.staff.m2.id })).status).toBe(403)
  })

  it('families see only their own halqas and mentors', async () => {
    const p = await as('p2@x.test')
    expect((await p.get('/api/v1/groups')).body.items.map((g: { code: string }) => g.code)).toEqual(['g-a'])
    const staff = (await p.get('/api/v1/staff')).body.items
    expect(staff).toEqual([{ id: fx.staff.m1.id, code: 'm1', displayName: 'Mentor One', title: 'Hifz Mentor', status: 'ACTIVE', groups: [{ id: fx.groups.gA.id, code: 'g-a', name: 'Halqa A' }] }])
    expect((await p.get('/api/v1/guardians')).status).toBe(403)
  })
})
