// Development only: loads the frontend's fictional people (src/data) into the
// database with the same codes, so screens that still read the in-browser demo
// dataset line up with the records served by the API.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import type { ConcessionKind, GroupGender, Track } from '../src/generated/prisma/enums.js'

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const load = async (file: string): Promise<Any> => import(pathToFileURL(resolve('..', 'src', 'data', file)).href)

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
