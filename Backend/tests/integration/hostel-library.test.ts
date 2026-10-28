import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { addDaysIso, institutionToday } from '../../src/common/clock.js'
import { localStorage } from '../../src/integrations/storage/storage.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, app, client, type Client } from '../helpers/auth.js'
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

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')

async function upload(c: Client, id: string, body: Buffer, type: string, name = 'notes.pdf') {
  return c.agent.put(`/api/v1/library/${id}/file`).set('X-CSRF-Token', c.csrf).set('Content-Type', type).set('X-File-Name', encodeURIComponent(name)).send(body)
}

describe('digital library', () => {
  it('a mentor uploads a PDF; it is stored privately under a generated name', async () => {
    const m = await as('m1@x.test')
    const r = (await m.post('/api/v1/library', { title: 'Madd rules', category: 'Tajweed', type: 'Tajweed Guide', audience: 'ALL_STUDENTS' })).body
    expect((await upload(m, r.id, PDF, 'application/pdf', '../../etc/passwd.pdf')).status).toBe(200)
    const f = await prisma.storedFile.findFirstOrThrow()
    expect(f.storageKey).toMatch(/^library\/[0-9a-f-]{36}\.pdf$/)
    expect(f.originalName).not.toContain('/')
    const p = await as('p1@x.test')
    const dl = await p.agent.get(`/api/v1/library/${r.id}/file`)
    expect(dl.status).toBe(200)
    expect(dl.headers['content-disposition']).toMatch(/^attachment;/)
    expect(Buffer.from(dl.body).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('rejects files whose contents do not match their type, oversize files and other types', async () => {
    const admin = await as('admin@x.test')
    const r = (await admin.post('/api/v1/library', { title: 'Fake', category: 'Tajweed', type: 'PDF Book', audience: 'ALL_STUDENTS' })).body
    expect((await upload(admin, r.id, Buffer.from('MZ\x90\x00 this is an exe'), 'application/pdf')).body.error.code).toBe('FILE_CONTENT_MISMATCH')
    expect((await upload(admin, r.id, Buffer.concat([PDF, Buffer.alloc(1.2 * 1024 * 1024)]), 'application/pdf')).status).toBe(413)
    expect((await upload(admin, r.id, Buffer.from('<html>'), 'text/html')).status).toBe(415)
    expect(await prisma.storedFile.count()).toBe(0)
  })

  it('files cannot be uploaded without the session CSRF token', async () => {
    const admin = await as('admin@x.test')
    const r = (await admin.post('/api/v1/library', { title: 'X file', category: 'Tajweed', type: 'PDF Book', audience: 'ALL_STUDENTS' })).body
    const res = await admin.agent.put(`/api/v1/library/${r.id}/file`).set('Content-Type', 'application/pdf').send(PDF)
    expect(res.body.error.code).toBe('CSRF_FAILED')
  })

  it('downloads are authorised by audience; staff-only items stay hidden from families', async () => {
    const admin = await as('admin@x.test')
    const alim = (await admin.post('/api/v1/library', { title: 'Nahw notes', category: 'Arabic', type: 'Study Notes', audience: 'ALIM' })).body
    const staff = (await admin.post('/api/v1/library', { title: 'Mentor handbook', category: 'General', type: 'PDF Book', audience: 'STAFF_ONLY' })).body
    await upload(admin, alim.id, PDF, 'application/pdf')
    await upload(admin, staff.id, PDF, 'application/pdf')
    const p = await as('p1@x.test')
    const list = (await p.get('/api/v1/library')).body.items
    expect(list.map((i: { title: string; canOpen: boolean }) => [i.title, i.canOpen])).toEqual([['Nahw notes', false]])
    expect((await p.agent.get(`/api/v1/library/${alim.id}/file`)).status).toBe(403)
    expect((await p.agent.get(`/api/v1/library/${staff.id}/file`)).status).toBe(404)
    expect((await request(app).get(`/api/v1/library/${alim.id}/file`)).status).toBe(401)
    expect((await (await as('m1@x.test')).agent.get(`/api/v1/library/${staff.id}/file`)).status).toBe(200)
  })

  it('only the uploader or the library administrator can change a resource; families cannot upload', async () => {
    const m = await as('m1@x.test')
    const r = (await m.post('/api/v1/library', { title: 'Mine', category: 'Hifz', type: 'Worksheet', audience: 'HIFZ' })).body
    const admin = await as('admin@x.test')
    expect((await admin.patch(`/api/v1/library/${r.id}`, { status: 'ARCHIVED' })).body.status).toBe('ARCHIVED')
    expect((await (await as('p1@x.test')).post('/api/v1/library', { title: 'Nope', category: 'Hifz', type: 'Worksheet', audience: 'HIFZ' })).status).toBe(403)
  })

  it('local storage refuses keys that escape its folder', async () => {
    const s = localStorage('.local/storage-test')
    await expect(s.put('../escape', Buffer.from('x'), 'text/plain')).rejects.toThrow('invalid storage key')
    await expect(s.get('library/../../x')).rejects.toThrow('invalid storage key')
  })
})
