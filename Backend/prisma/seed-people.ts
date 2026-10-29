// Development only: loads the frontend's fictional people (Frontend/src/data) into the
// database with the same codes, so screens that still read the in-browser demo
// dataset line up with the records served by the API.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { addDaysIso } from '../src/common/clock.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import type { ConcessionKind, GroupGender, Track } from '../src/generated/prisma/enums.js'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const load = async (file: string): Promise<Any> => import(pathToFileURL(resolve('..', 'Frontend', 'src', 'data', file)).href)

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const KIND: Record<string, ConcessionKind> = { 'Sibling concession': 'SIBLING', 'Need-based concession': 'NEED_BASED', 'Full sponsorship (Yateem fund)': 'FULL_SPONSORSHIP' }
const GENDER: Record<string, GroupGender> = { Boys: 'BOYS', Girls: 'GIRLS', Mixed: 'MIXED' }
const BLOODS = ['A+', 'B+', 'O+', 'AB+', 'O-', 'B-']

export async function seedPeople(prisma: PrismaClient) {
  if ((await prisma.student.count()) > 0) return 'people already present, skipped'
  const people = await load('people.js')
  const catalog = await load('catalog.js')

  for (const p of catalog.FEE_PLANS) {
    await prisma.feePlan.create({ data: { code: p.id, name: p.name, amountMinor: p.amount * 100, currency: 'INR', cycle: 'MONTHLY', covers: p.covers } })
  }
  const staffIds: Record<string, string> = {}
  for (const m of people.MENTORS) {
    const s = await prisma.staffProfile.create({ data: { code: m.id, displayName: m.name, title: m.role, phone: m.phone, email: m.email, joinedOn: d(m.joined), status: m.status === 'active' ? 'ACTIVE' : 'INACTIVE', qualification: m.qualification, specialisation: m.specialisation } })
    staffIds[m.id] = s.id
  }
  await prisma.staffProfile.create({ data: { code: 'st-principal', displayName: 'Mufti Abdul Qadir', title: 'Principal (Nazim-e-Taleemat)', email: 'principal@farooquia.demo', joinedOn: d('2014-04-01') } })
  await prisma.staffProfile.create({ data: { code: 'st-warden', displayName: 'Hafiz Naseeruddin', title: 'Hostel Warden', email: 'warden@farooquia.demo', joinedOn: d('2019-06-01') } })

  const groupIds: Record<string, string> = {}
  for (const g of people.GROUPS) {
    const row = await prisma.group.create({ data: { code: g.id, name: g.name, short: g.short, track: g.track.toUpperCase() as Track, room: g.room, timing: g.timing, gender: GENDER[g.gender]! } })
    groupIds[g.id] = row.id
    await prisma.groupMentorAssignment.create({ data: { groupId: row.id, staffId: staffIds[g.mentorId]!, startedAt: d('2026-04-01') } })
  }
  const guardianIds: Record<string, string> = {}
  for (const p of people.PARENTS) {
    const row = await prisma.guardian.create({ data: { code: p.id, name: p.name, relation: p.relation, phone: p.phone, email: p.email, occupation: p.occupation } })
    guardianIds[p.id] = row.id
  }
  const plan = Object.fromEntries((await prisma.feePlan.findMany()).map((p) => [p.code, p.id]))
  for (const [i, s] of (people.STUDENT_SEEDS as Any[]).entries()) {
    const g = people.GROUPS.find((x: Any) => x.id === s.groupId)
    const parent = people.PARENTS.find((p: Any) => p.children.includes(s.id))
    const c = people.CONCESSIONS[s.id]
    await prisma.student.create({
      data: {
        admissionNo: s.id, name: s.name, gender: s.gender === 'F' ? 'FEMALE' : 'MALE', dob: d(s.dob), admissionDate: d(s.admission),
        groupId: groupIds[s.groupId]!, phone: parent.phone, address: `${12 + i * 3}, ${people.AREAS[i % people.AREAS.length]}, Sample City`,
        hostelResident: s.hostel, bloodGroup: BLOODS[i % BLOODS.length], medicalNotes: i % 9 === 4 ? 'Mild asthma — inhaler kept with hostel warden' : null,
        feePlanId: plan[catalog.planForSeed(g.track, s.hostel)],
        guardians: { create: { guardianId: guardianIds[parent.id]!, isPrimary: true } },
        enrollments: { create: { groupId: groupIds[s.groupId]!, startedOn: d(s.admission) } },
        ...(c ? { concessions: { create: { kind: KIND[c.type]!, percent: c.percent } } } : {}),
      },
    })
  }
  // Codes issued from now on continue after the seeded ones.
  await prisma.$executeRawUnsafe(`SELECT setval('admission_no_seq', ${1000 + people.STUDENT_SEEDS.length})`)
  await prisma.$executeRawUnsafe(`SELECT setval('guardian_code_seq', ${people.PARENTS.length})`)
  await prisma.$executeRawUnsafe(`SELECT setval('staff_code_seq', ${people.MENTORS.length})`)
  return `${people.STUDENT_SEEDS.length} students, ${people.PARENTS.length} guardians, ${people.MENTORS.length + 2} staff`
}

/**
 * Development only: the demo generator's last 30 school days of attendance and
 * lesson records, relative to `today`, so dashboards have realistic history.
 */
export async function seedActivity(prisma: PrismaClient, today: string) {
  if ((await prisma.attendanceRecord.count()) > 0) return 'activity already present, skipped'
  const gen = await load('generate.js')
  const demo = gen.generateSeed(today)
  const students = Object.fromEntries((await prisma.student.findMany({ select: { id: true, admissionNo: true, groupId: true } })).map((s) => [s.admissionNo, s]))
  const staff = Object.fromEntries((await prisma.staffProfile.findMany({ select: { id: true, code: true } })).map((s) => [s.code, s.id]))

  let marks = 0
  for (const [date, statuses] of Object.entries(demo.attendance as Record<string, Record<string, string>>)) {
    const byGroup = new Map<string, [string, string][]>()
    for (const [code, status] of Object.entries(statuses)) {
      const s = students[code]
      if (!s) continue
      if (!byGroup.has(s.groupId)) byGroup.set(s.groupId, [])
      byGroup.get(s.groupId)!.push([s.id, status])
    }
    for (const [groupId, rows] of byGroup) {
      const session = await prisma.attendanceSession.create({ data: { groupId, date: d(date) } })
      await prisma.attendanceRecord.createMany({ data: rows.map(([studentId, status]) => ({ sessionId: session.id, studentId, date: d(date), status: status.toUpperCase() as 'PRESENT' })) })
      marks += rows.length
    }
  }
  const lessons = (demo.sabaq as Any[]).filter((r) => students[r.studentId]).map((r) => ({
    studentId: students[r.studentId]!.id, mentorId: staff[r.mentorId] ?? null, date: d(r.date), createdAt: new Date(`${r.createdAt}+05:30`),
    category: r.category.toUpperCase(), surah: r.surah, fromAyah: r.fromAyah, toAyah: r.toAyah, juz: r.juz, qaidaLesson: r.qaidaLesson,
    performance: r.performance, mistakes: Math.min(99, r.mistakes), fluency: r.fluency, tajweed: r.tajweed.toUpperCase(), prevRevision: r.prevRevision.toUpperCase(),
    revisionQuality: r.revisionQuality, targetStatus: r.targetStatus.toUpperCase(), comments: r.comments, nextTarget: r.nextTarget, followUp: r.followUp,
  }))
  await prisma.learningRecord.createMany({ data: lessons })

  return `${marks} attendance marks, ${lessons.length} lesson records`
}


/** Development only: the demo exams and their results. */
export async function seedExams(prisma: PrismaClient, today: string) {
  if ((await prisma.exam.count()) > 0) return 'exams already present, skipped'
  const demo = (await load('generate.js')).generateSeed(today)
  const students = Object.fromEntries((await prisma.student.findMany({ select: { id: true, admissionNo: true } })).map((x) => [x.admissionNo, x]))
  const staff = Object.fromEntries((await prisma.staffProfile.findMany({ select: { id: true, code: true } })).map((x) => [x.code, x.id]))
  // Exams and results; exams with results are published with the current grading scale.
  const groupIds = Object.fromEntries((await prisma.group.findMany({ select: { id: true, code: true } })).map((g) => [g.code, g.id]))
  const scale = await prisma.gradingScale.findFirstOrThrow({ where: { active: true } })
  let n = 0
  for (const e of demo.exams as Any[]) {
    const results = (demo.results as Any[]).filter((r) => r.examId === e.id)
    const exam = await prisma.exam.create({
      data: {
        code: `EX-${String(++n).padStart(4, '0')}`, title: e.title, type: e.type, track: e.track.toUpperCase(), date: d(e.date), examinerId: staff[e.examinerId] ?? null,
        ...(results.length ? { status: 'PUBLISHED', publishedAt: new Date(), gradingScaleId: scale.id } : {}),
        groups: { create: e.groupIds.map((g: string) => ({ groupId: groupIds[g]! })) },
        subjects: { create: e.subjects.map((s: Any, i: number) => ({ name: s.name, maxMarks: s.max, position: i })) },
      },
      include: { subjects: true },
    })
    for (const r of results) {
      if (!students[r.studentId]) continue
      await prisma.examResult.create({ data: { examId: exam.id, studentId: students[r.studentId]!.id, remark: r.remark, marks: { create: exam.subjects.map((s) => ({ subjectId: s.id, marks: r.marks[s.name] })) } } })
    }
  }
  await prisma.$executeRawUnsafe(`SELECT setval('exam_code_seq', ${n})`)
  return `${n} exams`
}

/** Development only: four months of demo invoices and payments, with receipts in the real numbering. */
export async function seedFees(prisma: PrismaClient, today: string) {
  if ((await prisma.invoice.count()) > 0) return 'fees already present, skipped'
  const demo = (await load('generate.js')).generateSeed(today)
  const students = Object.fromEntries((await prisma.student.findMany({ select: { id: true, admissionNo: true } })).map((x) => [x.admissionNo, x.id]))
  const plans = Object.fromEntries((await prisma.feePlan.findMany()).map((p) => [p.code, p.id]))
  const invoiceIds: Record<string, string> = {}
  for (const i of demo.invoices as Any[]) {
    if (!students[i.studentId]) continue
    const row = await prisma.invoice.create({ data: { number: `INV-${i.period.replace('-', '')}-${i.studentId}`, studentId: students[i.studentId]!, period: i.period, planId: plans[i.planId]!, currency: 'INR', grossMinor: i.gross * 100, discountMinor: i.discount * 100, amountMinor: i.amount * 100, issuedOn: d(i.issuedOn), dueDate: d(i.dueDate) } })
    invoiceIds[i.id] = row.id
  }
  const METHOD: Record<string, 'CASH' | 'UPI' | 'BANK_TRANSFER'> = { Cash: 'CASH', UPI: 'UPI', 'Bank Transfer': 'BANK_TRANSFER' }
  const byReceipt = new Map<string, Any[]>()
  for (const p of demo.payments as Any[]) if (invoiceIds[p.invoiceId]) (byReceipt.get(p.receiptNo) ?? byReceipt.set(p.receiptNo, []).get(p.receiptNo)!).push(p)
  const counters: Record<number, number> = {}
  const groups = [...byReceipt.values()].sort((a, b) => a[0]!.date.localeCompare(b[0]!.date))
  for (const rows of groups) {
    const first = rows[0]!
    const fy = Number(first.date.slice(5, 7)) >= 4 ? Number(first.date.slice(0, 4)) : Number(first.date.slice(0, 4)) - 1
    counters[fy] = (counters[fy] ?? 0) + 1
    const receipt = await prisma.receipt.create({ data: { number: `NR-${fy}-${String(counters[fy]).padStart(4, '0')}` } })
    await prisma.payment.create({
      data: {
        studentId: students[first.studentId]!, receiptId: receipt.id, amountMinor: rows.reduce((a: number, r: Any) => a + r.amount * 100, 0), currency: 'INR', method: METHOD[first.method] ?? 'CASH', source: 'MANUAL', receivedOn: d(first.date), note: 'Imported demo history',
        allocations: { create: rows.map((r: Any) => ({ invoiceId: invoiceIds[r.invoiceId]!, amountMinor: r.amount * 100 })) },
      },
    })
  }
  for (const [fy, last] of Object.entries(counters)) await prisma.receiptSequence.upsert({ where: { fiscalYear: Number(fy) }, update: { last }, create: { fiscalYear: Number(fy), last } })
  return `${Object.keys(invoiceIds).length} invoices, ${groups.length} payments`
}

/** Development only: rooms, beds, residents, a week of roll calls and the library catalogue. */
export async function seedCampus(prisma: PrismaClient, today: string) {
  if ((await prisma.hostelRoom.count()) > 0) return 'campus already present, skipped'
  const catalog = await load('catalog.js')
  const demo = (await load('generate.js')).generateSeed(today)
  const students = Object.fromEntries((await prisma.student.findMany({ select: { id: true, admissionNo: true } })).map((x) => [x.admissionNo, x.id]))
  for (const room of catalog.HOSTEL_ROOMS as Any[]) {
    const r = await prisma.hostelRoom.create({ data: { code: room.id, block: room.block, floor: room.floor, beds: { create: Array.from({ length: room.beds }, (_, i) => ({ label: `Bed ${'ABCD'[i]}` })) } }, include: { beds: { orderBy: { label: 'asc' } } } })
    const occupants: string[] = catalog.BED_SEED[room.id] ?? []
    for (const [i, code] of occupants.entries()) if (students[code]) await prisma.bedAssignment.create({ data: { bedId: r.beds[i]!.id, studentId: students[code]!, startedAt: new Date('2026-04-01T00:00:00Z') } })
  }
  const roll = Object.entries(demo.hostelAttendance as Record<string, Record<string, string>>).flatMap(([date, m]) => Object.entries(m).filter(([c]) => students[c]).map(([c, status]) => ({ studentId: students[c]!, date: d(date), status: status.toUpperCase() as 'PRESENT' })))
  await prisma.hostelRollEntry.createMany({ data: roll })

  const AUDIENCE: Record<string, 'ALL_STUDENTS' | 'HIFZ' | 'ALIM' | 'STAFF_ONLY'> = { 'All students': 'ALL_STUDENTS', 'Hifz groups': 'HIFZ', Alimiyyah: 'ALIM', 'Staff only': 'STAFF_ONLY' }
  const { localStorage: disk } = await import('../src/integrations/storage/storage.js')
  const { readFile } = await import('node:fs/promises')
  const { createHash, randomUUID } = await import('node:crypto')
  const store = disk(process.env.STORAGE_DIR ?? 'storage')
  for (const item of catalog.LIBRARY as Any[]) {
    const created = new Date(`${addDaysIso(today, item.uploaded)}T09:00:00Z`)
    let fileId: string | null = null
    if (item.file) {
      const bytes = await readFile(resolve('..', 'Frontend', 'public', item.file.replace(/^\//, '')))
      const key = `library/${randomUUID()}.pdf`
      await store.put(key, bytes, 'application/pdf')
      fileId = (await prisma.storedFile.create({ data: { storageKey: key, originalName: item.file.split('/').pop(), mimeType: 'application/pdf', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } })).id
    }
    await prisma.libraryResource.create({ data: { title: item.title, category: item.category, type: item.type, author: item.author, description: item.description, pages: item.pages, audience: AUDIENCE[item.access] ?? 'ALL_STUDENTS', fileId, createdAt: created } })
  }
  return `${catalog.HOSTEL_ROOMS.length} rooms, ${roll.length} roll-call marks, ${catalog.LIBRARY.length} library items`
}

/** Link the dev sign-in accounts to their people records. */
export async function linkDevAccounts(prisma: PrismaClient) {
  const link = async (email: string | null, username: string | null, kind: 'staff' | 'guardian' | 'student', code: string) => {
    const user = await prisma.user.findFirst({ where: email ? { email } : { username: username! } })
    if (!user) return
    if (kind === 'staff') await prisma.staffProfile.updateMany({ where: { code, userId: null }, data: { userId: user.id } })
    if (kind === 'guardian') await prisma.guardian.updateMany({ where: { code, userId: null }, data: { userId: user.id } })
    if (kind === 'student') await prisma.student.updateMany({ where: { admissionNo: code, userId: null }, data: { userId: user.id } })
  }
  await link('principal@farooquia.demo', null, 'staff', 'st-principal')
  await link('mentor@farooquia.demo', null, 'staff', 'm1')
  await link('warden@farooquia.demo', null, 'staff', 'st-warden')
  await link('parent@farooquia.demo', null, 'guardian', 'p1')
  await link(null, 's-1001', 'student', 'S-1001')
}
