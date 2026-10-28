import { get } from './client'

// Converts API people records into the shapes the existing screens use.
// Screens keep human-readable codes as ids (admission number, staff/guardian/
// halqa codes); the database id travels along as `uuid` for API calls.

const GENDER = { MALE: 'M', FEMALE: 'F' }
const GROUP_GENDER = { BOYS: 'Boys', GIRLS: 'Girls', MIXED: 'Mixed' }
export const CONCESSION_LABEL = { SIBLING: 'Sibling concession', NEED_BASED: 'Need-based concession', FULL_SPONSORSHIP: 'Full sponsorship (Yateem fund)' }

async function all(path) {
  const items = []
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const r = await get(`${path}${sep}page=${page}&pageSize=500`)
    items.push(...r.items)
    if (items.length >= r.total || r.items.length === 0) return items
  }
}

export function toStudent(s) {
  const primary = s.guardians.find((g) => g.isPrimary) || s.guardians[0]
  return {
    id: s.admissionNo,
    uuid: s.id,
    access: s.access,
    name: s.name,
    gender: GENDER[s.gender],
    dob: s.dob,
    groupId: s.group.code,
    track: s.group.track.toLowerCase(),
    guardianId: primary?.code,
    guardianIds: s.guardians.map((g) => g.code),
    admissionDate: s.admissionDate ?? null,
    phone: s.phone ?? primary?.phone ?? '',
    address: s.address ?? '',
    hostel: s.hostelResident,
    feePlanId: s.feePlan?.code ?? null,
    concession: s.concession ? { type: CONCESSION_LABEL[s.concession.kind], percent: s.concession.percent, kind: s.concession.kind } : null,
    status: s.status === 'ACTIVE' ? 'active' : 'inactive',
    bloodGroup: s.bloodGroup ?? '',
    medical: s.medicalNotes ?? '',
  }
}

const toGuardian = (g, children) => ({ id: g.code, uuid: g.id, name: g.name, relation: g.relation, phone: g.phone, email: g.email ?? '', occupation: g.occupation ?? '', hasAccount: g.hasAccount, children })

export const toGroup = (g) => ({ id: g.code, uuid: g.id, name: g.name, short: g.short, track: g.track.toLowerCase(), mentorId: g.mentor?.code ?? null, room: g.room ?? '', timing: g.timing ?? '', gender: GROUP_GENDER[g.gender], activeStudents: g.activeStudents })

export const toMentor = (m) => ({ id: m.code, uuid: m.id, name: m.displayName, role: m.title, phone: m.phone ?? '', email: m.email ?? '', joined: m.joinedOn ?? '', status: m.status === 'ACTIVE' ? 'active' : 'inactive', qualification: m.qualification ?? '', specialisation: m.specialisation ?? '', hasAccount: m.hasAccount })

/** Everything about people the signed-in account may see, ready for the store. */
export async function loadPeople(user) {
  const canListGuardians = user?.roles?.some((r) => r === 'ADMIN' || r === 'PRINCIPAL')
  const [students, groups, staff, plans, guardians] = await Promise.all([
    all('/students'),
    get('/groups').then((r) => r.items),
    get('/staff').then((r) => r.items),
    get('/fee-plans').then((r) => r.items),
    canListGuardians ? all('/guardians') : Promise.resolve(null),
  ])
  const mapped = students.map(toStudent)
  const childrenOf = (code) => mapped.filter((s) => s.guardianIds.includes(code)).map((s) => s.id)
  let parents
  if (guardians) parents = guardians.map((g) => toGuardian(g, childrenOf(g.code)))
  else {
    const byCode = new Map()
    for (const s of students) for (const g of s.guardians) byCode.set(g.code, g)
    parents = [...byCode.values()].map((g) => toGuardian(g, childrenOf(g.code)))
  }
  return {
    students: mapped,
    parents,
    groups: groups.map(toGroup),
    mentors: staff.map(toMentor),
    feePlans: plans.map((p) => ({ id: p.code, uuid: p.id, name: p.name, amount: p.amountMinor / 100, cycle: p.cycle === 'MONTHLY' ? 'Monthly' : p.cycle, covers: p.covers ?? '' })),
  }
}

const lower = (v) => (typeof v === 'string' ? v.toLowerCase() : v)

/** API lesson record -> the shape the Sabaq screens use. */
export const toLesson = (r) => ({
  id: r.id, uuid: r.id, studentId: r.admissionNo, mentorId: r.mentor?.code ?? null, date: r.date, createdAt: r.createdAt,
  category: lower(r.category), surah: r.surah, fromAyah: r.fromAyah, toAyah: r.toAyah, juz: r.juz, qaidaLesson: r.qaidaLesson,
  performance: r.performance, mistakes: r.mistakes, fluency: r.fluency, tajweed: lower(r.tajweed), prevRevision: lower(r.prevRevision),
  revisionQuality: r.revisionQuality, targetStatus: lower(r.targetStatus), comments: r.comments, nextTarget: r.nextTarget, followUp: r.followUp, edited: r.edited,
})

/** Attendance (last 60 days) and lesson records (last 90 days) the account may see. */
export async function loadActivity() {
  const [attendance, lessons] = await Promise.all([
    get('/attendance'),
    (async () => {
      const items = []
      for (let page = 1; ; page++) {
        const r = await get(`/learning-records?page=${page}&pageSize=1000`)
        items.push(...r.items)
        if (items.length >= r.total || r.items.length === 0) return items
      }
    })(),
  ])
  return { attendance: attendance.days, today: attendance.today, sabaq: lessons.map(toLesson) }
}

/** Exams, results and the current grading scale the account may see. */
export async function loadExams() {
  const [exams, results, grading] = await Promise.all([get('/exams'), get('/exam-results'), get('/grading')])
  return {
    exams: exams.items.map((e) => ({
      id: e.code, uuid: e.id, title: e.title, type: e.type, track: e.track.toLowerCase(), groupIds: e.groups.map((g) => g.code), date: e.date,
      examinerId: e.examiner?.code ?? null, subjects: e.subjects.map((s) => ({ name: s.name, max: s.max })), status: e.status, published: e.status === 'PUBLISHED', grading: e.grading,
    })),
    results: results.items.map((r) => ({ id: r.id, examId: r.examCode, studentId: r.admissionNo, marks: r.marks, remark: r.remark ?? '', absent: r.absent })),
    grading: grading.bands,
  }
}
