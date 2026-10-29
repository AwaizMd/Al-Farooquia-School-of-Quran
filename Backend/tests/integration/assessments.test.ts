import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/database/prisma.js'
import { addDaysIso, institutionToday } from '../../src/common/clock.js'
import { resetDatabase } from '../helpers/db.js'
import { PASSWORD, client, type Client } from '../helpers/auth.js'
import { seedPeopleFixture } from '../helpers/people.js'

let fx: Awaited<ReturnType<typeof seedPeopleFixture>>
let today: string
let admin: Client
beforeEach(async () => {
  await resetDatabase()
  fx = await seedPeopleFixture()
  today = await institutionToday()
  admin = await as('admin@x.test')
})
async function as(identifier: string): Promise<Client> {
  const c = client()
  expect((await c.post('/api/v1/auth/login', { identifier, password: PASSWORD })).body.stage).toBe('full')
  return c
}
const hifzMarks = (a: number, b: number, c: number, d: number) => ({ 'Sabaq Recitation': a, Sabqi: b, Manzil: c, Tajweed: d })

async function heldExam(c: Client = admin) {
  const r = await c.post('/api/v1/exams', { title: 'Monthly Test', type: 'Monthly Test', track: 'HIFZ', date: addDaysIso(today, -1), groupIds: [fx.groups.gA.id] })
  expect(r.status).toBe(201)
  return r.body
}

describe('exams and marks', () => {
  it('schedules with the track’s default subjects and grades from stored marks', async () => {
    const exam = await heldExam()
    expect(exam.subjects.map((s: { name: string }) => s.name)).toEqual(['Sabaq Recitation', 'Sabqi', 'Manzil', 'Tajweed'])
    const m = await as('m1@x.test')
    const saved = await m.put(`/api/v1/exams/${exam.code}/results`, { entries: [
      { studentId: fx.students.ali.id, marks: hifzMarks(25, 22, 20, 20), remark: 'Excellent' },
      { studentId: fx.students.bilal.id, absent: true, marks: {} },
    ] })
    expect(saved.status).toBe(200)
    const ali = saved.body.items.find((r: { student: { admissionNo: string } }) => r.student.admissionNo === 'S-1')
    expect(ali).toMatchObject({ total: 87, max: 100, pct: 87, grade: { grade: 'Mumtaz' } })
    expect(saved.body.items.find((r: { absent: boolean }) => r.absent).grade).toBeNull()
  })

  it('rejects marks above the maximum, missing subjects and students outside the exam', async () => {
    const exam = await heldExam()
    const over = await admin.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: hifzMarks(26, 1, 1, 1) }] })
    expect(over.body.error.details).toEqual([{ path: 'entries.0.marks.Sabaq Recitation', message: 'Sabaq Recitation must be between 0 and 25.' }])
    const missing = await admin.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: { Sabqi: 3 } }] })
    expect(missing.status).toBe(422)
    const outsider = await admin.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: fx.students.sara.id, marks: hifzMarks(1, 1, 1, 1) }] })
    expect(outsider.body.error.code).toBe('NOT_IN_EXAM')
  })

  it('a mentor who is not the examiner can mark only their own halqa in a joint exam', async () => {
    const gC = await prisma.group.create({ data: { code: 'g-c', name: 'Halqa C', short: 'C', track: 'HIFZ', gender: 'BOYS' } })
    await prisma.groupMentorAssignment.create({ data: { groupId: gC.id, staffId: fx.staff.m2.id } })
    const other = await prisma.student.create({ data: { admissionNo: 'S-9', name: 'Other', gender: 'MALE', dob: new Date('2013-01-01'), admissionDate: new Date('2024-04-01'), groupId: gC.id, phone: '+91 90000 00009', enrollments: { create: { groupId: gC.id, startedOn: new Date('2024-04-01') } } } })
    const exam = (await admin.post('/api/v1/exams', { title: 'Joint Test', type: 'Monthly Test', track: 'HIFZ', date: addDaysIso(today, -1), groupIds: [fx.groups.gA.id, gC.id], examinerId: fx.staff.m2.id })).body
    const m = await as('m1@x.test')
    expect((await m.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: other.id, marks: hifzMarks(1, 1, 1, 1) }] })).status).toBe(403)
    expect(await prisma.examResult.count({ where: { examId: exam.id } })).toBe(0)
    expect((await m.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: hifzMarks(1, 1, 1, 1) }] })).status).toBe(200)
  })

  it('the database itself refuses marks above the maximum', async () => {
    const exam = await heldExam()
    const subject = await prisma.examSubject.findFirstOrThrow({ where: { examId: exam.id } })
    const result = await prisma.examResult.create({ data: { examId: exam.id, studentId: fx.students.ali.id } })
    await expect(prisma.examMark.create({ data: { resultId: result.id, subjectId: subject.id, marks: 99 } })).rejects.toThrow()
  })

  it('does not accept marks before the exam is held, or from another halqa’s mentor', async () => {
    const future = await admin.post('/api/v1/exams', { title: 'Juz Test', type: 'Hifz Juz Test', track: 'HIFZ', date: addDaysIso(today, 3), groupIds: [fx.groups.gA.id] })
    expect((await admin.put(`/api/v1/exams/${future.body.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: hifzMarks(1, 1, 1, 1) }] })).body.error.code).toBe('EXAM_NOT_HELD')
    const nazira = await admin.post('/api/v1/exams', { title: 'Nazira Test', type: 'Monthly Test', track: 'NAZIRA', date: addDaysIso(today, -1), groupIds: [fx.groups.gB.id] })
    const m = await as('m1@x.test')
    expect((await m.put(`/api/v1/exams/${nazira.body.code}/results`, { entries: [{ studentId: fx.students.sara.id, marks: {} }] })).status).toBe(404)
  })

  it('a mentor can schedule only for their own halqas and tracks must match', async () => {
    const m = await as('m1@x.test')
    expect((await m.post('/api/v1/exams', { title: 'Mixed', type: 'Monthly Test', track: 'HIFZ', date: today, groupIds: [fx.groups.gB.id] })).status).toBe(422)
    expect((await m.post('/api/v1/exams', { title: 'Own', type: 'Weekly Test', track: 'HIFZ', date: today, groupIds: [fx.groups.gA.id] })).status).toBe(201)
  })

  it('looks exams up by their own code only (no cross-exam match)', async () => {
    const a = await heldExam()
    const b = await heldExam()
    expect((await admin.get(`/api/v1/exams/${b.code}/results`)).body.exam.id).toBe(b.id)
    expect((await admin.get(`/api/v1/exams/${a.code}/results`)).body.exam.id).toBe(a.id)
    expect((await admin.get('/api/v1/exams/EX-9999/results')).status).toBe(404)
  })
})

describe('publication, grading versions and report cards', () => {
  it('families see results only after publication, and only their own child', async () => {
    const exam = await heldExam()
    await admin.put(`/api/v1/exams/${exam.code}/results`, { entries: [
      { studentId: fx.students.ali.id, marks: hifzMarks(20, 20, 20, 20) },
      { studentId: fx.students.bilal.id, marks: hifzMarks(10, 10, 10, 10) },
    ] })
    const p = await as('p1@x.test')
    expect((await p.get(`/api/v1/exams/${exam.code}/results`)).body).toMatchObject({ published: false, items: [] })
    expect((await p.get('/api/v1/report-cards/S-1')).body.items).toEqual([])

    expect((await (await as('m1@x.test')).post(`/api/v1/exams/${exam.code}/publish`)).status).toBe(403) // mentors cannot publish
    expect((await admin.post(`/api/v1/exams/${exam.code}/publish`)).body.status).toBe('PUBLISHED')
    const visible = await p.get(`/api/v1/exams/${exam.code}/results`)
    expect(visible.body.items.map((r: { student: { admissionNo: string } }) => r.student.admissionNo)).toEqual(['S-1'])
    expect((await p.get('/api/v1/report-cards/S-1')).body.items[0]).toMatchObject({ pct: 80, grade: { grade: 'Jayyid Jiddan' } })
    expect((await p.get('/api/v1/report-cards/S-2')).status).toBe(404) // another family's child
  })

  it('changing the grading scale does not regrade published report cards', async () => {
    const exam = await heldExam()
    await admin.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: hifzMarks(20, 20, 20, 20) }] })
    await admin.post(`/api/v1/exams/${exam.code}/publish`)
    const r = await admin.put('/api/v1/grading', { bands: [{ grade: 'Top', min: 75 }, { grade: 'Rest', min: 0 }] })
    expect(r.body.version).toBe(2)
    const card = (await admin.get('/api/v1/report-cards/S-1')).body.items[0]
    expect(card).toMatchObject({ grade: { grade: 'Jayyid Jiddan' }, gradingVersion: 1 })
    const fresh = await heldExam()
    await admin.put(`/api/v1/exams/${fresh.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: hifzMarks(20, 20, 20, 20) }] })
    expect((await admin.get(`/api/v1/exams/${fresh.code}/results`)).body.items[0].grade.grade).toBe('Top')
  })

  it('published results change only by administration, with a reason', async () => {
    const exam = await heldExam()
    await admin.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: hifzMarks(20, 20, 20, 20) }] })
    await admin.post(`/api/v1/exams/${exam.code}/publish`)
    const m = await as('m1@x.test')
    expect((await m.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: hifzMarks(25, 25, 25, 25) }] })).status).toBe(403)
    expect((await admin.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: hifzMarks(21, 20, 20, 20) }] })).body.error.code).toBe('REASON_REQUIRED')
    expect((await admin.put(`/api/v1/exams/${exam.code}/results`, { entries: [{ studentId: fx.students.ali.id, marks: hifzMarks(21, 20, 20, 20) }], reason: 'Re-check of Sabaq' })).status).toBe(200)
    expect(await prisma.auditLog.count({ where: { action: 'exam.results_corrected' } })).toBe(1)
  })

  it('validates the grading scale', async () => {
    expect((await admin.put('/api/v1/grading', { bands: [{ grade: 'A', min: 50 }, { grade: 'B', min: 20 }] })).status).toBe(422)
    expect((await (await as('principal@x.test')).put('/api/v1/grading', { bands: [{ grade: 'A', min: 50 }, { grade: 'B', min: 0 }] })).status).toBe(403)
  })
})
