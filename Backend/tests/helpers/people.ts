import { prisma } from '../../src/database/prisma.js'
import { makeUser } from './auth.js'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/**
 * Small fixture:
 *  halqa A (mentor M1 has an account) → Ali (hostel, guardian P1), Bilal (guardian P2)
 *  halqa B (mentor M2)               → Sara (guardian P1)
 */
export async function seedPeopleFixture() {
  await prisma.mfaPolicy.createMany({ data: [{ role: 'ADMIN', required: false }, { role: 'PRINCIPAL', required: false }, { role: 'MENTOR', required: false }, { role: 'STUDENT', required: false }, { role: 'PARENT', required: false }, { role: 'WARDEN', required: false }], skipDuplicates: true })
  const users = {
    admin: await makeUser({ email: 'admin@x.test', roles: ['ADMIN'] }),
    principal: await makeUser({ email: 'principal@x.test', roles: ['PRINCIPAL'] }),
    mentor: await makeUser({ email: 'm1@x.test', roles: ['MENTOR'] }),
    parent: await makeUser({ email: 'p1@x.test', roles: ['PARENT'] }),
    otherParent: await makeUser({ email: 'p2@x.test', roles: ['PARENT'] }),
    warden: await makeUser({ email: 'warden@x.test', roles: ['WARDEN'] }),
    student: await makeUser({ username: 's-1', roles: ['STUDENT'] }),
  }
  await prisma.gradingScale.create({ data: { version: 1, active: true, bands: { create: [{ grade: 'Mumtaz', minPercent: 85 }, { grade: 'Jayyid Jiddan', minPercent: 70 }, { grade: 'Jayyid', minPercent: 55 }, { grade: 'Maqbool', minPercent: 40 }, { grade: 'Rasib', minPercent: 0 }] } } })
  const plan = await prisma.feePlan.create({ data: { code: 'fp', name: 'Hifz', amountMinor: 150000, currency: 'INR' } })
  const m1 = await prisma.staffProfile.create({ data: { code: 'm1', displayName: 'Mentor One', title: 'Hifz Mentor', userId: users.mentor.id } })
  const m2 = await prisma.staffProfile.create({ data: { code: 'm2', displayName: 'Mentor Two', title: 'Nazira Mentor' } })
  const gA = await prisma.group.create({ data: { code: 'g-a', name: 'Halqa A', short: 'A', track: 'HIFZ', gender: 'BOYS' } })
  const gB = await prisma.group.create({ data: { code: 'g-b', name: 'Halqa B', short: 'B', track: 'NAZIRA', gender: 'GIRLS' } })
  await prisma.groupMentorAssignment.create({ data: { groupId: gA.id, staffId: m1.id } })
  await prisma.groupMentorAssignment.create({ data: { groupId: gB.id, staffId: m2.id } })
  const p1 = await prisma.guardian.create({ data: { code: 'p1', name: 'Parent One', relation: 'Father', phone: '+91 90000 00001', userId: users.parent.id } })
  const p2 = await prisma.guardian.create({ data: { code: 'p2', name: 'Parent Two', relation: 'Mother', phone: '+91 90000 00002', userId: users.otherParent.id } })
  const mk = (admissionNo: string, name: string, groupId: string, guardianId: string, extra: object = {}) =>
    prisma.student.create({ data: { admissionNo, name, gender: 'MALE', dob: d('2013-01-01'), admissionDate: d('2024-04-01'), groupId, phone: '+91 90000 00009', feePlanId: plan.id, medicalNotes: 'Asthma', guardians: { create: { guardianId, isPrimary: true } }, enrollments: { create: { groupId, startedOn: d('2024-04-01') } }, ...extra } })
  const ali = await mk('S-1', 'Ali', gA.id, p1.id, { hostelResident: true, userId: users.student.id, concessions: { create: { kind: 'SIBLING', percent: 10 } } })
  const bilal = await mk('S-2', 'Bilal', gA.id, p2.id)
  const sara = await mk('S-3', 'Sara', gB.id, p1.id, { gender: 'FEMALE' })
  return { users, plan, staff: { m1, m2 }, groups: { gA, gB }, guardians: { p1, p2 }, students: { ali, bilal, sara } }
}
