import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../helpers/db.js'
import { addDaysIso, institutionToday } from '../../src/common/clock.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let today: string
let beds: { a: string; b: string }
beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  today = await institutionToday()
  await prisma.student.update({ where: { id: fx.students.bilal.id }, data: { hostelResident: true } })
  const room = await prisma.hostelRoom.create({ data: { code: 'R-101', block: 'Bilal Block', floor: 'Ground', beds: { create: [{ label: 'Bed A' }, { label: 'Bed B' }] } }, include: { beds: { orderBy: { label: 'asc' } } } })
  beds = { a: room.beds[0]!.id, b: room.beds[1]!.id }
})
async function as(identifier: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  return c
}

describe('hostel beds', () => {
  it('a bed can never hold two students, even when assigned at the same moment', async () => {
    const w = await as('warden@x.test')
    const [x, y] = await Promise.all([
      w.post(`/api/v1/hostel/beds/${beds.a}/assign`, { studentId: fx.students.ali.id }),
      w.post(`/api/v1/hostel/beds/${beds.a}/assign`, { studentId: fx.students.bilal.id }),
    ])
    expect([x.status, y.status].sort()).toEqual([200, 409])
    expect(await prisma.bedAssignment.count({ where: { bedId: beds.a, endedAt: null } })).toBe(1)
  })

  it('transfers keep history and only residents can be assigned', async () => {
    const w = await as('warden@x.test')
    await w.post(`/api/v1/hostel/beds/${beds.a}/assign`, { studentId: fx.students.ali.id })
    const moved = await w.post(`/api/v1/hostel/beds/${beds.b}/assign`, { studentId: fx.students.ali.id })
    expect(moved.body.rooms[0].beds.map((b: { occupant: { admissionNo: string } | null }) => b.occupant?.admissionNo ?? null)).toEqual([null, 'S-1'])
    expect((await w.get(`/api/v1/hostel/history?studentId=${fx.students.ali.id}`)).body.items).toHaveLength(2)
    expect((await w.post(`/api/v1/hostel/beds/${beds.a}/assign`, { studentId: fx.students.sara.id })).body.error.code).toBe('NOT_RESIDENT')
  })

  it('leaving the hostel frees the bed automatically', async () => {
    const w = await as('warden@x.test')
    await w.post(`/api/v1/hostel/beds/${beds.a}/assign`, { studentId: fx.students.ali.id })
    const admin = await as('admin@x.test')
    await admin.patch('/api/v1/students/S-1', { hostelResident: false })
    expect(await prisma.bedAssignment.count({ where: { endedAt: null } })).toBe(0)
  })

  it('wardens manage the hostel but nothing academic or financial; others cannot manage beds', async () => {
    const w = await as('warden@x.test')
    expect((await w.get('/api/v1/fees')).body.invoices).toEqual([])
    expect((await w.post('/api/v1/attendance', { groupId: fx.groups.gA.id, date: today, records: [{ studentId: fx.students.ali.id, status: 'PRESENT' }] })).status).toBe(403)
    const m = await as('m1@x.test')
    expect((await m.get('/api/v1/hostel')).status).toBe(403)
    expect((await (await as('principal@x.test')).post(`/api/v1/hostel/beds/${beds.a}/assign`, { studentId: fx.students.ali.id })).status).toBe(403)
  })

  it('roll call: residents only, changes to earlier nights need a reason', async () => {
    const w = await as('warden@x.test')
    expect((await w.post('/api/v1/hostel/roll-call', { date: today, entries: [{ studentId: fx.students.sara.id, status: 'PRESENT' }] })).body.error.code).toBe('NOT_RESIDENT')
    const old = addDaysIso(today, -3)
    await w.post('/api/v1/hostel/roll-call', { date: old, entries: [{ studentId: fx.students.ali.id, status: 'ABSENT' }] })
    expect((await w.post('/api/v1/hostel/roll-call', { date: old, entries: [{ studentId: fx.students.ali.id, status: 'LEAVE' }] })).body.error.code).toBe('REASON_REQUIRED')
    expect((await w.post('/api/v1/hostel/roll-call', { date: old, entries: [{ studentId: fx.students.ali.id, status: 'LEAVE' }], reason: 'Leave note found' })).body.changed).toBe(1)
    expect((await w.get(`/api/v1/hostel/roll-call?from=${old}&to=${today}`)).body.days[old]).toEqual({ 'S-1': 'leave' })
  })
})

