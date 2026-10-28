import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { addDaysIso, institutionToday } from '../../src/common/clock.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let today: string
beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  today = await institutionToday()
})
async function as(identifier: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  return c
}
const register = (date: string, statuses: Record<string, string>, extra: object = {}) => ({
  groupId: fx.groups.gA.id, date, records: Object.entries(statuses).map(([studentId, status]) => ({ studentId, status })), ...extra,
})

describe('attendance', () => {
  it('a mentor marks today for their halqa; families see only their own child', async () => {
    const m = await as('m1@x.test')
    const r = await m.post('/api/v1/attendance', register(today, { [fx.students.ali.id]: 'PRESENT', [fx.students.bilal.id]: 'ABSENT' }))
    expect(r.body).toMatchObject({ created: 2, corrected: 0 })
    const p = await as('p1@x.test')
    const days = (await p.get('/api/v1/attendance')).body.days
    expect(days[today]).toEqual({ 'S-1': 'present' })
  })

  it('a mentor cannot mark another halqa, an earlier day or a future day', async () => {
    const m = await as('m1@x.test')
    expect((await m.post('/api/v1/attendance', { ...register(today, {}), groupId: fx.groups.gB.id, records: [{ studentId: fx.students.sara.id, status: 'PRESENT' }] })).status).toBe(403)
    expect((await m.post('/api/v1/attendance', register(addDaysIso(today, -1), { [fx.students.ali.id]: 'PRESENT' }))).status).toBe(403)
    expect((await m.post('/api/v1/attendance', register(addDaysIso(today, 1), { [fx.students.ali.id]: 'PRESENT' }))).body.error.code).toBe('FUTURE_DATE')
  })

  it('rejects students who are not in the halqa and duplicates', async () => {
    const admin = await as('admin@x.test')
    expect((await admin.post('/api/v1/attendance', register(today, { [fx.students.sara.id]: 'PRESENT' }))).body.error.code).toBe('NOT_IN_HALQA')
    const dup = { groupId: fx.groups.gA.id, date: today, records: [{ studentId: fx.students.ali.id, status: 'PRESENT' }, { studentId: fx.students.ali.id, status: 'LATE' }] }
    expect((await admin.post('/api/v1/attendance', dup)).status).toBe(422)
  })

  it('keeps a correction trail; corrections after the day need a reason', async () => {
    const m = await as('m1@x.test')
    await m.post('/api/v1/attendance', register(today, { [fx.students.ali.id]: 'ABSENT' }))
    const same = await m.post('/api/v1/attendance', register(today, { [fx.students.ali.id]: 'LATE' }))
    expect(same.body.corrected).toBe(1)

    const admin = await as('admin@x.test')
    const yesterday = addDaysIso(today, -1)
    await admin.post('/api/v1/attendance', register(yesterday, { [fx.students.bilal.id]: 'ABSENT' }))
    expect((await admin.post('/api/v1/attendance', register(yesterday, { [fx.students.bilal.id]: 'EXCUSED' }))).body.error.code).toBe('REASON_REQUIRED')
    const p = await as('principal@x.test')
    expect((await p.post('/api/v1/attendance', register(yesterday, { [fx.students.bilal.id]: 'EXCUSED' }, { reason: 'Medical note received' }))).body.corrected).toBe(1)
    const hist = await admin.get(`/api/v1/attendance/${fx.students.bilal.id}/${yesterday}/corrections`)
    expect(hist.body).toMatchObject({ status: 'EXCUSED', corrections: [{ from: 'ABSENT', to: 'EXCUSED', reason: 'Medical note received' }] })
  })

  it('two simultaneous saves of one register never duplicate a mark', async () => {
    const m = await as('m1@x.test')
    const body = register(today, { [fx.students.ali.id]: 'PRESENT', [fx.students.bilal.id]: 'PRESENT' })
    const [a, b] = await Promise.all([m.post('/api/v1/attendance', body), m.post('/api/v1/attendance', body)])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(await prisma.attendanceRecord.count()).toBe(2)
    expect(await prisma.attendanceSession.count()).toBe(1)
  })
})

const lesson = (studentId: string, extra: object = {}) => ({
  studentId, date: today, category: 'SABAQ', surah: 2, fromAyah: 142, toAyah: 147, performance: 4, mistakes: 2, fluency: 4,
  tajweed: 'GOOD', prevRevision: 'DONE', targetStatus: 'MET', comments: 'Good lesson.', nextTarget: 'Al-Baqarah 148–153', followUp: false, ...extra,
})

describe('learning records', () => {
  it('the mentor records a Sabaq; the Juz is worked out on the server', async () => {
    const m = await as('m1@x.test')
    const r = await m.post('/api/v1/learning-records', lesson(fx.students.ali.id))
    expect(r.status).toBe(201)
    expect(r.body.record).toMatchObject({ admissionNo: 'S-1', juz: 2, mentor: { code: 'm1' } })
    expect(r.body.duplicateForDay).toBe(false)
    expect((await m.post('/api/v1/learning-records', lesson(fx.students.ali.id))).body.duplicateForDay).toBe(true) // warns, does not block
  })

  it('validates ayah ranges, categories per track and dates', async () => {
    const m = await as('m1@x.test')
    const bad = await m.post('/api/v1/learning-records', lesson(fx.students.ali.id, { surah: 1, fromAyah: 1, toAyah: 8 }))
    expect(bad.body.error.details).toEqual([{ path: 'toAyah', message: 'This Surah has 7 ayahs.' }])
    expect((await m.post('/api/v1/learning-records', lesson(fx.students.ali.id, { category: 'QAIDA', qaidaLesson: 3 }))).body.error.details[0].path).toBe('category')
    expect((await m.post('/api/v1/learning-records', lesson(fx.students.ali.id, { date: addDaysIso(today, 1) }))).status).toBe(422)
    expect((await m.post('/api/v1/learning-records', lesson(fx.students.ali.id, { date: addDaysIso(today, -10) }))).body.error.details[0].message).toMatch(/last 7 days/)
  })

  it('other mentors and families cannot record; the student’s other records stay hidden from wardens', async () => {
    const m = await as('m1@x.test')
    expect((await m.post('/api/v1/learning-records', lesson(fx.students.sara.id, { category: 'NAZIRA' }))).status).toBe(404)
    const p = await as('p1@x.test')
    expect((await p.post('/api/v1/learning-records', lesson(fx.students.ali.id))).status).toBe(403)
    await m.post('/api/v1/learning-records', lesson(fx.students.ali.id))
    expect((await p.get('/api/v1/learning-records')).body.items.map((r: { admissionNo: string }) => r.admissionNo)).toEqual(['S-1'])
    const w = await as('warden@x.test')
    expect((await w.get('/api/v1/learning-records')).body.items).toEqual([])
  })

  it('edits keep the previous version; administration must give a reason', async () => {
    const m = await as('m1@x.test')
    const id = (await m.post('/api/v1/learning-records', lesson(fx.students.ali.id))).body.record.id
    const edited = await m.patch(`/api/v1/learning-records/${id}`, { performance: 5, comments: 'Excellent after revision.' })
    expect(edited.body).toMatchObject({ performance: 5, edited: true })
    const admin = await as('admin@x.test')
    expect((await admin.patch(`/api/v1/learning-records/${id}`, { mistakes: 0 })).body.error.details[0].path).toBe('reason')
    await admin.patch(`/api/v1/learning-records/${id}`, { mistakes: 0, reason: 'Corrected after re-check' })
    const revs = (await admin.get(`/api/v1/learning-records/${id}/revisions`)).body.items
    expect(revs.map((r: { previous: { performance: number; mistakes: number } }) => [r.previous.performance, r.previous.mistakes])).toEqual([[4, 2], [5, 2]])
  })

  it('the database rejects impossible ratings even if the API were bypassed', async () => {
    await expect(prisma.learningRecord.create({ data: { studentId: fx.students.ali.id, date: new Date(), category: 'SABAQ', surah: 2, fromAyah: 1, toAyah: 2, performance: 9, mistakes: 0, fluency: 3, tajweed: 'GOOD', prevRevision: 'DONE', targetStatus: 'MET', comments: '', nextTarget: 'x' } })).rejects.toThrow()
  })
})
