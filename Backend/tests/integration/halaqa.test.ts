import { beforeEach, describe, expect, it } from 'vitest'
import { prisma as scoped } from '../../src/database/prisma.js'
import { institutionToday } from '../../src/common/clock.js'
import { recurringDates } from '../../src/modules/halaqa/halaqa.service.js'
import { asOrg } from '../../src/tenancy/context.js'
import { forgetMadrasa } from '../../src/tenancy/settings.js'
import { PASSWORD, client, makeUser, type Client } from '../helpers/auth.js'
import { inMadrasa, prisma, resetDatabase, seedMadrasa } from '../helpers/db.js'
import { seedPeopleFixture } from '../helpers/people.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let principal: Client
let today: string
let categoryId: string

async function as(identifier: string, madrasaId?: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  if (madrasaId) {
    const orig = c.agent
    for (const m of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const fn = orig[m].bind(orig)
      ;(orig as unknown as Record<string, unknown>)[m] = (url: string) => fn(url).set('X-Madrasa-Id', madrasaId)
    }
  }
  return c
}
const enable = async (madrasaId: string) => {
  await asOrg('test', () => scoped.madrasaFeature.upsert({ where: { madrasaId_feature: { madrasaId, feature: 'HALAQA' } }, update: { enabled: true }, create: { madrasaId, feature: 'HALAQA', enabled: true } }))
  forgetMadrasa(madrasaId)
}
const newHalaqa = async (name = 'Tafseer Circle', extra: object = {}) => {
  const r = await principal.post('/api/v1/halaqa', { name, categoryId, status: 'ACTIVE', ...extra })
  expect(r.status).toBe(201)
  return r.body as { id: string; name: string }
}
const newPerson = async (fullName = 'Yusuf External', extra: object = {}) => {
  const r = await principal.post('/api/v1/halaqa/participants', { fullName, phone: '+91 98000 00001', ...extra })
  expect(r.status).toBe(201)
  return r.body as { id: string; fullName: string }
}
const join = (halaqaId: string, participantId: string) => principal.post(`/api/v1/halaqa/${halaqaId}/members`, { participantId })
const newSession = async (halaqaId: string, date = today) => (await principal.post(`/api/v1/halaqa/${halaqaId}/sessions`, { date, startTime: '18:00' })).body as { id: string }

beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  await enable(fx.madrasa.id)
  today = await inMadrasa(fx.madrasa.id, () => institutionToday())
  principal = await as('principal@x.test')
  categoryId = (await principal.get('/api/v1/halaqa/categories')).body.items[0].id
})

describe('Halaqas', () => {
  it('creates several Halaqas with the default categories, and categories can be added', async () => {
    const names = (await principal.get('/api/v1/halaqa/categories')).body.items.map((c: { name: string }) => c.name)
    expect(names).toEqual(expect.arrayContaining(['Quran', 'Hifz', 'Tafseer', 'Hadith', 'Islamic Studies', 'Spiritual gatherings', 'Special Mureed gatherings']))
    expect((await principal.post('/api/v1/halaqa/categories', { name: 'Seerah' })).status).toBe(201)
    expect((await principal.post('/api/v1/halaqa/categories', { name: 'Seerah' })).body.error.code).toBe('DUPLICATE_CATEGORY')
    await newHalaqa('Alpha'); await newHalaqa('Beta')
    expect((await principal.get('/api/v1/halaqa')).body.items).toHaveLength(2)
    expect((await principal.post('/api/v1/halaqa', { name: 'Alpha', categoryId })).body.error.code).toBe('DUPLICATE_HALAQA')
    expect((await principal.post('/api/v1/halaqa', { name: 'Gamma', categoryId, startDate: '2026-02-01', endDate: '2026-01-01' })).status).toBe(422)
  })

  it('a disabled feature is rejected by the API', async () => {
    await asOrg('test', () => scoped.madrasaFeature.update({ where: { madrasaId_feature: { madrasaId: fx.madrasa.id, feature: 'HALAQA' } }, data: { enabled: false } }))
    forgetMadrasa(fx.madrasa.id)
    expect((await principal.get('/api/v1/halaqa')).body.error.code).toBe('FEATURE_DISABLED')
    expect((await principal.get('/api/v1/mureeds/00000000-0000-4000-8000-000000000000')).body.error.code).toBe('FEATURE_DISABLED')
  })
})

describe('participants', () => {
  it('adds an existing student once, keeping one person for one student', async () => {
    const a = await principal.post('/api/v1/halaqa/participants', { studentId: fx.students.ali.id })
    expect(a.status).toBe(201)
    expect(a.body.fullName).toBe('Ali')
    expect((await principal.post('/api/v1/halaqa/participants', { studentId: fx.students.ali.id })).body.error.code).toBe('ALREADY_REGISTERED')
  })

  it('warns about a duplicate phone or email unless confirmed', async () => {
    await newPerson('Yusuf', { phone: '+91 98000 11111', email: 'Y@x.test' })
    const dupePhone = await principal.post('/api/v1/halaqa/participants', { fullName: 'Yusuf Two', phone: '09800011111' })
    expect(dupePhone.body.error.code).toBe('POSSIBLE_DUPLICATE')
    expect((await principal.post('/api/v1/halaqa/participants', { fullName: 'Y Three', email: 'y@x.test' })).body.error.code).toBe('POSSIBLE_DUPLICATE')
    expect((await principal.post('/api/v1/halaqa/participants', { fullName: 'Yusuf Two', phone: '09800011111', confirmDuplicate: true })).status).toBe(201)
  })

  it('one person in several Halaqas, transfer, leave and history', async () => {
    const [a, b, c] = [await newHalaqa('Alpha'), await newHalaqa('Beta'), await newHalaqa('Gamma')]
    const p = await newPerson()
    expect((await join(a.id, p.id)).status).toBe(201)
    expect((await join(b.id, p.id)).status).toBe(201)
    expect((await join(a.id, p.id)).body.error.code).toBe('ALREADY_MEMBER')
    const m = (await principal.get(`/api/v1/halaqa/${a.id}/members`)).body.items[0].membershipId
    expect((await principal.post(`/api/v1/halaqa/memberships/${m}/transfer`, { toHalaqaId: c.id })).status).toBe(204)
    const after = (await principal.get(`/api/v1/halaqa/participants/${p.id}`)).body
    expect(after.memberships.find((x: { halaqa: { name: string } }) => x.halaqa.name === 'Alpha').status).toBe('TRANSFERRED')
    expect(after.memberships.filter((x: { status: string }) => x.status === 'ACTIVE').map((x: { halaqa: { name: string } }) => x.halaqa.name).sort()).toEqual(['Beta', 'Gamma'])
    expect(after.history.map((h: { kind: string }) => h.kind)).toEqual(expect.arrayContaining(['created', 'joined', 'transferred']))
    await inMadrasa(fx.madrasa.id, () => expect(scoped.participantEvent.deleteMany({ where: { participantId: p.id } })).rejects.toThrow())
  })

  it('capacity holds even when additions arrive together; an inactive person cannot join', async () => {
    const h = await newHalaqa('Small', { maxParticipants: 1 })
    const [p, q] = [await newPerson('One', { phone: '+91 98000 00011' }), await newPerson('Two', { phone: '+91 98000 00012' })]
    const rs = await Promise.all([join(h.id, p.id), join(h.id, q.id)])
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409])
    const x = await newPerson('Three', { phone: '+91 98000 00013' })
    await principal.patch(`/api/v1/halaqa/participants/${x.id}`, { status: 'INACTIVE' })
    const other = await newHalaqa('Other')
    expect((await join(other.id, x.id)).body.error.code).toBe('PARTICIPANT_INACTIVE')
  })

  it('a photograph is checked by its contents and never reachable without permission', async () => {
    const p = await newPerson()
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
    const put = (type: string, bytes: Buffer) => principal.agent.put(`/api/v1/halaqa/participants/${p.id}/photo`).set('X-CSRF-Token', principal.csrf).set('Content-Type', type).send(bytes)
    expect((await put('image/png', Buffer.from('<script>alert(1)</script>'))).body.error.code).toBe('FILE_CONTENT_MISMATCH')
    expect((await put('image/png', png)).status).toBe(200)
    expect((await principal.get(`/api/v1/halaqa/participants/${p.id}/photo`)).status).toBe(200)
    expect((await (await as('p1@x.test')).get(`/api/v1/halaqa/participants/${p.id}/photo`)).status).toBe(403)
  })
})

describe('sessions', () => {
  it('works out recurring dates', () => {
    expect(recurringDates({ pattern: 'WEEKLY', from: '2026-11-01', to: '2026-11-15', weekdays: [0] })).toEqual(['2026-11-01', '2026-11-08', '2026-11-15'])
    expect(recurringDates({ pattern: 'MONTHLY', from: '2026-01-15', to: '2026-03-20', dayOfMonth: 15 })).toEqual(['2026-01-15', '2026-02-15', '2026-03-15'])
  })

  it('schedules recurring sessions without duplicates, and refuses absurd ranges', async () => {
    const h = await newHalaqa('Weekly', { startTime: '18:00', endTime: '19:00' })
    const body = { pattern: 'WEEKLY', from: '2027-01-01', to: '2027-01-31', weekdays: [1, 4] }
    const r = await principal.post(`/api/v1/halaqa/${h.id}/sessions/recurring`, body)
    expect(r.status).toBe(201)
    expect(r.body.created).toBeGreaterThan(5)
    const again = await principal.post(`/api/v1/halaqa/${h.id}/sessions/recurring`, body)
    expect(again.body).toMatchObject({ created: 0, skipped: r.body.created })
    expect((await principal.post(`/api/v1/halaqa/${h.id}/sessions/recurring`, { pattern: 'WEEKLY', from: '2027-01-01', to: '2040-01-01', weekdays: [0, 1, 2, 3, 4, 5, 6] })).status).toBe(422)
    const list = (await principal.get(`/api/v1/halaqa/sessions?halaqaId=${h.id}`)).body.items
    expect(list[0]).toMatchObject({ startTime: '18:00', endTime: '19:00', status: 'SCHEDULED' })
  })

  it('reschedules with the old date kept, cancels with a reason, completes once', async () => {
    const h = await newHalaqa()
    const s = await newSession(h.id, '2027-02-01')
    const moved = await principal.patch(`/api/v1/halaqa/sessions/${s.id}`, { date: '2027-02-03', topic: 'Surah Al-Kahf' })
    expect(moved.body).toMatchObject({ date: '2027-02-03', rescheduledFrom: '2027-02-01', topic: 'Surah Al-Kahf' })
    const done = await principal.post(`/api/v1/halaqa/sessions/${s.id}/status`, { status: 'CANCELLED', reason: 'Teacher unwell' })
    expect(done.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Teacher unwell' })
    expect((await principal.post(`/api/v1/halaqa/sessions/${s.id}/status`, { status: 'COMPLETED' })).body.error.code).toBe('SESSION_NOT_SCHEDULED')
    expect((await principal.patch(`/api/v1/halaqa/sessions/${s.id}`, { topic: 'x' })).body.error.code).toBe('SESSION_CANCELLED')
  })

  it('study material is checked by contents and needs permission', async () => {
    const h = await newHalaqa()
    const s = await newSession(h.id)
    const send = (bytes: Buffer) => principal.agent.post(`/api/v1/halaqa/sessions/${s.id}/materials`).set('X-CSRF-Token', principal.csrf).set('Content-Type', 'application/pdf').set('X-File-Name', 'notes.pdf').send(bytes)
    expect((await send(Buffer.from('not a pdf'))).body.error.code).toBe('FILE_CONTENT_MISMATCH')
    const ok = await send(Buffer.from('%PDF-1.4 test'))
    expect(ok.status).toBe(201)
    expect((await principal.get(`/api/v1/halaqa/materials/${ok.body.id}`)).status).toBe(200)
    expect((await (await as('p1@x.test')).get(`/api/v1/halaqa/materials/${ok.body.id}`)).status).toBe(404)
  })
})

describe('attendance', () => {
  it('marks once, corrections keep a history, and academic attendance is untouched', async () => {
    const h = await newHalaqa(); const p = await newPerson(); await join(h.id, p.id)
    const s = await newSession(h.id)
    const academicBefore = await inMadrasa(fx.madrasa.id, () => scoped.attendanceRecord.count())
    const r = await principal.put(`/api/v1/halaqa/sessions/${s.id}/attendance`, { marks: [{ participantId: p.id, status: 'ABSENT' }] })
    expect(r.body.attendance[0].status).toBe('ABSENT')
    // Marking again does not silently overwrite.
    const again = await principal.put(`/api/v1/halaqa/sessions/${s.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })
    expect(again.body.attendance[0].status).toBe('ABSENT')
    expect((await principal.post(`/api/v1/halaqa/attendance/${r.body.attendance[0].id}/correct`, { status: 'EXCUSED', reason: 'no' })).status).toBe(422)
    const fixed = await principal.post(`/api/v1/halaqa/attendance/${r.body.attendance[0].id}/correct`, { status: 'EXCUSED', reason: 'Was unwell, told us' })
    expect(fixed.body.attendance[0]).toMatchObject({ status: 'EXCUSED', corrections: [{ fromStatus: 'ABSENT', toStatus: 'EXCUSED' }] })
    expect(await inMadrasa(fx.madrasa.id, () => scoped.attendanceRecord.count())).toBe(academicBefore)
  })

  it('refuses a stranger, a future session and a cancelled one', async () => {
    const h = await newHalaqa(); const p = await newPerson()
    const s = await newSession(h.id)
    expect((await principal.put(`/api/v1/halaqa/sessions/${s.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })).status).toBe(404)
    await join(h.id, p.id)
    const later = await newSession(h.id, '2099-01-01')
    expect((await principal.put(`/api/v1/halaqa/sessions/${later.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })).body.error.code).toBe('SESSION_IN_FUTURE')
    await principal.post(`/api/v1/halaqa/sessions/${s.id}/status`, { status: 'CANCELLED' })
    expect((await principal.put(`/api/v1/halaqa/sessions/${s.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })).body.error.code).toBe('SESSION_CANCELLED')
  })

  it('QR: a real card works once; forged, replaced, non-member and switched-off all fail', async () => {
    const h = await newHalaqa(); const p = await newPerson(); await join(h.id, p.id)
    const s = await newSession(h.id)
    const { token } = (await principal.get(`/api/v1/halaqa/participants/${p.id}/qr`)).body
    expect(token.split('.')[1]).toBe(p.id)
    expect(token).not.toContain(p.fullName)
    const scan = (t: string, session = s.id) => principal.post(`/api/v1/halaqa/sessions/${session}/scan`, { token: t })
    expect((await scan(`${token.slice(0, -4)}AAAA`)).body.error.code).toBe('INVALID_CARD')
    expect((await scan(token)).body).toMatchObject({ status: 'PRESENT', duplicate: false, fullName: p.fullName })
    expect((await scan(token)).body.duplicate).toBe(true)
    const stranger = await newPerson('Stranger', { phone: '+91 98000 00077' })
    expect((await scan((await principal.get(`/api/v1/halaqa/participants/${stranger.id}/qr`)).body.token)).body.error.code).toBe('NOT_A_MEMBER')
    const replaced = (await principal.post(`/api/v1/halaqa/participants/${p.id}/qr`)).body.token
    const s2 = await newHalaqa('Second'); await join(s2.id, p.id)
    const s2s = await newSession(s2.id)
    expect((await scan(token, s2s.id)).body.error.code).toBe('INVALID_CARD')
    expect((await scan(replaced, s2s.id)).status).toBe(200)
    const off = await newHalaqa('NoQr', { attendanceRules: { allowQr: false, teacherWindowDays: 2, excusedCounts: false } }); await join(off.id, p.id)
    expect((await scan(replaced, (await newSession(off.id)).id)).body.error.code).toBe('QR_OFF')
    const future = await newSession(h.id, '2099-01-01')
    expect((await scan(replaced, future.id)).body.error.code).toBe('NOT_SESSION_DAY')
  })

  it('reports by month with the excused rule applied, and CSV-ready rows', async () => {
    const h = await newHalaqa('Counts', { attendanceRules: { allowQr: true, teacherWindowDays: 2, excusedCounts: true } }); const p = await newPerson(); await join(h.id, p.id)
    const a = await newSession(h.id, '2026-10-05'); const b = await principal.post(`/api/v1/halaqa/${h.id}/sessions`, { date: '2026-10-12', startTime: '18:00' })
    await principal.put(`/api/v1/halaqa/sessions/${a.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })
    await principal.put(`/api/v1/halaqa/sessions/${b.body.id}/attendance`, { marks: [{ participantId: p.id, status: 'EXCUSED' }] })
    const r = await principal.get(`/api/v1/halaqa/reports/attendance?from=2026-10-01&to=2026-10-31&halaqaId=${h.id}`)
    expect(r.body.items).toEqual([expect.objectContaining({ month: '2026-10', present: 1, excused: 1, total: 2, percent: 100 })])
    expect((await principal.get('/api/v1/halaqa/reports/attendance?from=2026-11-01&to=2026-10-01')).status).toBe(422)
  })
})

describe('who can see what', () => {
  it('a teacher sees only their own Halaqas, names only, within the marking window', async () => {
    const mine = await newHalaqa('Mine', { teacherStaffId: fx.staff.m1.id }); const other = await newHalaqa('Other', { teacherStaffId: fx.staff.m2.id })
    const p = await newPerson('Quiet Mureed', { isMureed: true, email: 'q@x.test' }); await join(mine.id, p.id)
    const s = await newSession(mine.id); const s2 = await newSession(other.id)
    const m = await as('m1@x.test')
    expect((await m.get('/api/v1/halaqa')).body.items.map((h: { name: string }) => h.name)).toEqual(['Mine'])
    expect((await m.get(`/api/v1/halaqa/${other.id}`)).status).toBe(404)
    expect((await m.get(`/api/v1/halaqa/${other.id}/members`)).status).toBe(404)
    expect((await m.get(`/api/v1/halaqa/sessions/${s2.id}`)).status).toBe(404)
    expect((await m.put(`/api/v1/halaqa/sessions/${s2.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })).status).toBe(404)
    const roster = (await m.get(`/api/v1/halaqa/${mine.id}/members`)).body.items
    expect(Object.keys(roster[0]).sort()).toEqual(['fullName', 'id', 'membershipId', 'status'])
    expect(JSON.stringify(roster)).not.toContain('q@x.test')
    expect((await m.get('/api/v1/halaqa/participants')).status).toBe(403)
    expect((await m.get(`/api/v1/halaqa/participants/${p.id}`)).status).toBe(403)
    expect((await m.get(`/api/v1/mureeds/${p.id}`)).status).toBe(403)
    expect((await m.get('/api/v1/halaqa/dashboard')).status).toBe(403)
    expect((await m.put(`/api/v1/halaqa/sessions/${s.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })).status).toBe(200)
    const old = await newSession(mine.id, '2020-01-01')
    expect((await m.put(`/api/v1/halaqa/sessions/${old.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })).body.error.code).toBe('ATTENDANCE_WINDOW_CLOSED')
    // The manager can still record it.
    expect((await principal.put(`/api/v1/halaqa/sessions/${old.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })).status).toBe(200)
  })

  it('parents, students, wardens get nothing; another madrasa gets 404', async () => {
    const h = await newHalaqa(); const p = await newPerson('Hidden', { isMureed: true }); await join(h.id, p.id); const s = await newSession(h.id)
    for (const who of ['p1@x.test', 'warden@x.test', 's-1']) {
      const c = await as(who)
      expect((await c.get('/api/v1/halaqa')).body.items, who).toEqual([])
      for (const path of [`/halaqa/${h.id}`, `/halaqa/${h.id}/members`, `/halaqa/sessions/${s.id}`]) expect((await c.get(`/api/v1${path}`)).status, `${who} ${path}`).toBe(404)
      for (const path of ['/halaqa/participants', `/halaqa/participants/${p.id}`, `/mureeds/${p.id}`, `/mureeds/${p.id}/notes`, '/halaqa/dashboard']) expect((await c.get(`/api/v1${path}`)).status, `${who} ${path}`).toBe(403)
    }
    const b = await seedMadrasa('B2', 'Second')
    await enable(b.id)
    await makeUser({ email: 'pb@x.test', roles: ['PRINCIPAL'], madrasaId: b.id })
    const other = await as('pb@x.test', b.id)
    expect((await other.get('/api/v1/halaqa')).body.items).toEqual([])
    expect((await other.get(`/api/v1/halaqa/${h.id}`)).status).toBe(404)
    expect((await other.get(`/api/v1/halaqa/participants/${p.id}`)).status).toBe(404)
    expect((await other.get(`/api/v1/mureeds/${p.id}`)).status).toBe(404)
    expect((await other.get(`/api/v1/mureeds/${p.id}/notes`)).status).toBe(404)
    expect((await other.post(`/api/v1/halaqa/${h.id}/members`, { participantId: p.id })).status).toBe(404)
    expect((await other.get(`/api/v1/halaqa/sessions/${s.id}`)).status).toBe(404)
    const card = (await principal.get(`/api/v1/halaqa/participants/${p.id}/qr`)).body.token
    const theirs = await other.post('/api/v1/halaqa', { name: 'Theirs', categoryId: (await other.get('/api/v1/halaqa/categories')).body.items[0].id })
    const ses = await other.post(`/api/v1/halaqa/${theirs.body.id}/sessions`, { date: today })
    expect((await other.post(`/api/v1/halaqa/sessions/${ses.body.id}/scan`, { token: card })).body.error.code).toBe('INVALID_CARD')
  })

  it('an administrator runs Halaqas but cannot see Mureeds or their standing', async () => {
    const p = await newPerson('Secret', { isMureed: true })
    const plain = await newPerson('Plain', { phone: '+91 98000 00055' })
    const h = await newHalaqa(); await join(h.id, plain.id)
    const admin = await as('admin@x.test')
    expect((await admin.get('/api/v1/halaqa')).status).toBe(200)
    expect((await admin.get(`/api/v1/mureeds/${p.id}`)).status).toBe(403)
    expect((await admin.get(`/api/v1/mureeds/${p.id}/notes`)).status).toBe(403)
    expect((await admin.get('/api/v1/halaqa/participants?mureed=true')).status).toBe(404)
    const list = (await admin.get('/api/v1/halaqa/participants')).body.items
    expect(list.map((x: { fullName: string }) => x.fullName)).toEqual(['Plain']) // a Mureed in no Halaqa stays out
    expect(list[0].isMureed).toBeUndefined()
    expect((await admin.post('/api/v1/halaqa/participants', { fullName: 'New', isMureed: true, phone: '+91 98000 00066' })).status).toBe(404)
    expect((await admin.patch(`/api/v1/halaqa/participants/${plain.id}`, { isMureed: true })).status).toBe(404)
    expect((await admin.get('/api/v1/halaqa/dashboard')).body.totalMureeds).toBeNull()
  })
})

describe('Mureeds', () => {
  it('holds entries and follow-ups; each profile view is audited', async () => {
    const p = await newPerson('Mureed One', { isMureed: true })
    await principal.post(`/api/v1/mureeds/${p.id}/entries`, { kind: 'MEETING', summary: 'Met after Asr' })
    const f = await principal.post(`/api/v1/mureeds/${p.id}/entries`, { kind: 'FOLLOW_UP', summary: 'Call next week', dueDate: '2027-01-01' })
    expect((await principal.post(`/api/v1/mureeds/entries/${f.body.id}/done`)).status).toBe(204)
    expect((await principal.post(`/api/v1/mureeds/entries/${f.body.id}/done`)).body.error.code).toBe('ALREADY_DONE')
    const r = await principal.get(`/api/v1/mureeds/${p.id}`)
    expect(r.body.entries).toHaveLength(2)
    expect(r.body.mureedSince).toBeTruthy()
    const log = await inMadrasa(fx.madrasa.id, () => scoped.auditLog.findMany({ where: { action: 'mureed.profile_viewed', entityId: p.id } }))
    expect(log).toHaveLength(1)
    const notMureed = await newPerson('Plain', { phone: '+91 98000 00088' })
    expect((await principal.get(`/api/v1/mureeds/${notMureed.id}`)).status).toBe(404)
  })

  it('private notes: Principal only, each read audited, text never in the audit log', async () => {
    const p = await newPerson('Mureed Two', { isMureed: true })
    const n = await principal.post(`/api/v1/mureeds/${p.id}/notes`, { body: 'SECRET-NOTE-TEXT' })
    expect(n.status).toBe(201)
    expect((await principal.get(`/api/v1/mureeds/${p.id}/notes`)).body.items[0].body).toBe('SECRET-NOTE-TEXT')
    for (const who of ['admin@x.test', 'm1@x.test', 'p1@x.test', 'warden@x.test']) {
      const c = await as(who)
      expect((await c.get(`/api/v1/mureeds/${p.id}/notes`)).status, who).toBe(403)
      expect((await c.post(`/api/v1/mureeds/${p.id}/notes`, { body: 'x' })).status, who).toBe(403)
      expect((await c.patch(`/api/v1/mureeds/notes/${n.body.id}`, { body: 'x' })).status, who).toBe(403)
      expect((await c.del(`/api/v1/mureeds/notes/${n.body.id}`)).status, who).toBe(403)
    }
    const log = await inMadrasa(fx.madrasa.id, () => scoped.auditLog.findMany({ where: { entityId: p.id } }))
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['mureed.note_added', 'mureed.notes_viewed']))
    expect(JSON.stringify(log)).not.toContain('SECRET-NOTE-TEXT')
    // Notes appear nowhere else.
    for (const path of [`/mureeds/${p.id}`, `/halaqa/participants/${p.id}`, '/halaqa/participants', '/halaqa/dashboard']) expect(JSON.stringify((await principal.get(`/api/v1${path}`)).body), path).not.toContain('SECRET-NOTE-TEXT')
    expect((await principal.del(`/api/v1/mureeds/notes/${n.body.id}`)).status).toBe(204)
  })
})

describe('messages', () => {
  it('goes through the outbox once per person, to the active members only', async () => {
    const h = await newHalaqa()
    const a = await newPerson('Has Email', { email: 'a@x.test', phone: '+91 98000 00101' })
    const b = await newPerson('No Contact', { phone: '+91 98000 00102' })
    const gone = await newPerson('Inactive', { email: 'gone@x.test', phone: '+91 98000 00103' })
    const st = (await principal.post('/api/v1/halaqa/participants', { studentId: fx.students.ali.id })).body
    for (const p of [a, b, gone, st]) await join(h.id, p.id)
    await principal.patch(`/api/v1/halaqa/participants/${gone.id}`, { status: 'INACTIVE' })
    const r = await principal.post('/api/v1/halaqa/messages', { halaqaId: h.id, kind: 'ANNOUNCEMENT', subject: 'Next week', body: 'No session on Friday.' })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ recipients: 3, emailQueued: 1, inApp: 1, noContact: 1 })
    const outbox = await prisma.notificationDelivery.findMany({ where: { dedupeKey: { startsWith: 'halaqa-message:' } } })
    expect(outbox.map((d) => d.recipient)).toEqual(['a@x.test'])
    expect((await (await as('s-1')).get('/api/v1/notifications')).body.items[0].title).toBe('Next week')
    expect((await principal.get('/api/v1/halaqa/messages')).body.items[0]).toMatchObject({ subject: 'Next week', recipientCount: 3 })
    expect((await (await as('admin@x.test')).post('/api/v1/halaqa/messages', { kind: 'UPDATE', subject: 'x y z', body: 'abc' })).status).toBe(422)
    expect((await (await as('m1@x.test')).post('/api/v1/halaqa/messages', { halaqaId: h.id, kind: 'UPDATE', subject: 'x y z', body: 'abc' })).status).toBe(403)
  })

  it('a message to a Mureed appears in their communication history', async () => {
    const p = await newPerson('Mureed', { isMureed: true, email: 'm@x.test' })
    await principal.post('/api/v1/halaqa/messages', { participantIds: [p.id], kind: 'FOLLOW_UP', subject: 'Salaam', body: 'Checking in.' })
    expect((await principal.get(`/api/v1/mureeds/${p.id}`)).body.entries[0]).toMatchObject({ kind: 'COMMUNICATION', summary: 'Message sent: Salaam' })
  })
})

describe('dashboard', () => {
  it('counts real records', async () => {
    const h = await newHalaqa(); await newHalaqa('Planned', { status: 'PLANNED' })
    const p = await newPerson('Mureed', { isMureed: true }); await join(h.id, p.id)
    const x = await newPerson('Inactive', { phone: '+91 98000 00200' }); await principal.patch(`/api/v1/halaqa/participants/${x.id}`, { status: 'INACTIVE' })
    const s = await newSession(h.id)
    await principal.put(`/api/v1/halaqa/sessions/${s.id}/attendance`, { marks: [{ participantId: p.id, status: 'PRESENT' }] })
    await principal.post(`/api/v1/halaqa/sessions/${s.id}/status`, { status: 'COMPLETED' })
    await newSession(h.id, '2099-01-01')
    expect((await principal.get('/api/v1/halaqa/dashboard')).body).toMatchObject({ totalHalaqas: 2, activeHalaqas: 1, totalParticipants: 2, inactiveParticipants: 1, totalMureeds: 1, upcomingSessions: 1, completedSessions: 1, attendance30Days: { present: 1, absent: 0, excused: 0 } })
  })
})
