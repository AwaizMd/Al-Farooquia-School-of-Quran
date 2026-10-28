// A small in-memory stand-in for the backend, built from the fictional demo
// people, returning the same shapes as the real API. Used by smoke tests only.
import { GROUPS, MENTORS, PARENTS, STUDENT_SEEDS, CONCESSIONS } from '../data/people'
import { FEE_PLANS, planForSeed } from '../data/catalog'
import { generateSeed } from '../data/generate'
import { todayISO } from '../utils/date'

const demo = generateSeed(todayISO())

const KIND = { 'Sibling concession': 'SIBLING', 'Need-based concession': 'NEED_BASED', 'Full sponsorship (Yateem fund)': 'FULL_SPONSORSHIP' }
const uuid = (code) => `00000000-0000-4000-8000-${[...code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7).toString(16).slice(-12).padStart(12, '0')}`

const groups = GROUPS.map((g) => {
  const m = MENTORS.find((x) => x.id === g.mentorId)
  return { id: uuid(g.id), code: g.id, name: g.name, short: g.short, track: g.track.toUpperCase(), room: g.room, timing: g.timing, gender: g.gender.toUpperCase(), active: true, activeStudents: 0, mentor: { id: uuid(m.id), code: m.id, displayName: m.name, title: m.role } }
})
const plans = FEE_PLANS.map((p) => ({ id: uuid(p.id), code: p.id, name: p.name, amountMinor: p.amount * 100, currency: 'INR', cycle: 'MONTHLY', covers: p.covers }))
const guardians = PARENTS.map((p) => ({ id: uuid(p.id), code: p.id, name: p.name, relation: p.relation, phone: p.phone, email: p.email, occupation: p.occupation, hasAccount: false, children: [] }))
const students = STUDENT_SEEDS.map((s) => {
  const g = groups.find((x) => x.code === s.groupId)
  const parent = PARENTS.find((p) => p.children.includes(s.id))
  const c = CONCESSIONS[s.id]
  const plan = plans.find((p) => p.code === planForSeed(s.groupId.split('-')[1] === 'hifz' ? 'hifz' : g.track.toLowerCase(), s.hostel))
  return {
    id: uuid(s.id), admissionNo: s.id, name: s.name, gender: s.gender === 'F' ? 'FEMALE' : 'MALE', dob: s.dob, status: 'ACTIVE', hostelResident: s.hostel,
    bloodGroup: 'O+', medicalNotes: null, admissionDate: s.admission, phone: parent.phone, address: 'Sample City', access: 'full',
    group: { id: g.id, code: g.code, name: g.name, short: g.short, track: g.track }, mentor: g.mentor,
    guardians: [{ id: uuid(parent.id), code: parent.id, name: parent.name, relation: parent.relation, phone: parent.phone, email: parent.email, occupation: parent.occupation, isPrimary: true }],
    feePlan: plan ?? null, concession: c ? { kind: KIND[c.type], percent: c.percent } : null,
  }
})
const staff = MENTORS.map((m) => ({ id: uuid(m.id), code: m.id, displayName: m.name, title: m.role, phone: m.phone, email: m.email, joinedOn: m.joined, status: m.status.toUpperCase(), qualification: m.qualification, specialisation: m.specialisation, hasAccount: false, groups: groups.filter((g) => g.mentor.code === m.id).map((g) => ({ id: g.id, code: g.code, name: g.name })) }))

export const PERSONAS = {
  admin: { roles: ['ADMIN'], links: {}, displayName: 'Maulana Shoaib Akhtar', visible: () => true },
  principal: { roles: ['PRINCIPAL'], links: { staff: { id: 'x', code: 'st-principal' } }, displayName: 'Mufti Abdul Qadir', visible: () => true },
  mentor: { roles: ['MENTOR'], links: { staff: { id: uuid('m1'), code: 'm1' } }, displayName: 'Qari Abdul Rahman Siddiqui', visible: (s) => s.group.code === 'g-hifz-a' },
  warden: { roles: ['WARDEN'], links: { staff: { id: 'w', code: 'st-warden' } }, displayName: 'Hafiz Naseeruddin', visible: (s) => s.hostelResident },
  parent: { roles: ['PARENT'], links: { guardian: { id: uuid('p1'), code: 'p1' } }, displayName: 'Javed Khan', visible: (s) => s.guardians.some((g) => g.code === 'p1') },
  student: { roles: ['STUDENT'], links: { student: { id: uuid('S-1001'), admissionNo: 'S-1001' } }, displayName: 'Abdullah Khan', visible: (s) => s.admissionNo === 'S-1001' },
}

const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

/** Returns a fetch implementation that answers as the given persona (or signed out). */
export function fakeFetch(personaName) {
  const p = PERSONAS[personaName]
  return (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost')
    const path = url.pathname.replace('/api/v1', '')
    if (!p) return json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } }, 401)
    const mine = students.filter(p.visible)
    if (path === '/auth/session') return json({ stage: 'full', csrfToken: 'csrf', user: { id: 'u', displayName: p.displayName, email: 'x@farooquia.demo', username: null, locale: 'en', roles: p.roles, links: p.links, mfa: { enabled: true, required: true, recoveryCodesRemaining: 10 } } })
    if (path === '/students') return json({ total: mine.length, page: 1, pageSize: 500, items: mine })
    if (path === '/groups') return json({ items: groups })
    if (path === '/staff') return json({ items: staff })
    if (path === '/fee-plans') return json({ items: plans })
    if (path === '/guardians') return json({ total: guardians.length, page: 1, pageSize: 500, items: guardians })
    if (path === '/attendance') {
      const codes = new Set(mine.map((s) => s.admissionNo))
      const days = Object.fromEntries(Object.entries(demo.attendance).map(([d, m]) => [d, Object.fromEntries(Object.entries(m).filter(([c]) => codes.has(c)))]))
      return json({ from: '', to: '', today: todayISO(), days, sessions: [] })
    }
    if (path === '/learning-records') {
      const codes = new Set(p.roles.includes('WARDEN') ? [] : mine.map((s) => s.admissionNo))
      const items = demo.sabaq.filter((r) => codes.has(r.studentId)).map((r) => ({ ...r, admissionNo: r.studentId, mentor: { code: r.mentorId }, category: r.category.toUpperCase(), tajweed: r.tajweed.toUpperCase(), prevRevision: r.prevRevision.toUpperCase(), targetStatus: r.targetStatus.toUpperCase() }))
      return json({ total: items.length, page: 1, pageSize: 1000, items })
    }
    if (path === '/exams') {
      const codes = new Set(mine.map((x) => x.group.code))
      const items = demo.exams.filter((e) => p.roles.some((r) => r === 'ADMIN' || r === 'PRINCIPAL') || e.groupIds.some((g) => codes.has(g))).map((e) => ({ id: uuid(e.id), code: e.id, title: e.title, type: e.type, track: e.track.toUpperCase(), date: e.date, status: 'PUBLISHED', groups: e.groupIds.map((g) => ({ code: g })), examiner: { code: e.examinerId }, subjects: e.subjects, grading: null }))
      return json({ items })
    }
    if (path === '/exam-results') {
      const codes = new Set(p.roles.includes('WARDEN') ? [] : mine.map((x) => x.admissionNo))
      return json({ items: demo.results.filter((r) => codes.has(r.studentId)).map((r) => ({ id: r.id, examCode: r.examId, admissionNo: r.studentId, marks: r.marks, remark: r.remark, absent: false })) })
    }
    if (path === '/library') return json({ items: [{ id: 'l1', title: 'Madd rules', category: 'Tajweed', type: 'Tajweed Guide', author: 'x', description: 'x', pages: 3, audience: 'ALL_STUDENTS', status: 'ACTIVE', uploadedAt: new Date().toISOString(), uploadedBy: 'Office', file: { name: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 }, canOpen: true }] })
    if (path === '/hostel') return json({ rooms: [{ id: 'r1', code: 'R-101', block: 'Bilal Block', floor: 'Ground', beds: [{ id: 'b1', label: 'Bed A', occupant: students.find((x) => x.hostelResident) }, { id: 'b2', label: 'Bed B', occupant: null }] }], unassigned: [] })
    if (path === '/hostel/roll-call') return json({ from: '', to: '', days: demo.hostelAttendance })
    if (path === '/notifications') return json({ items: [{ id: 'n1', title: 'Welcome', body: 'Hello', link: null, createdAt: new Date().toISOString(), readAt: null, category: 'GENERAL' }] })
    if (path === '/settings') return json({ brandName: 'Al Farooquia School of Quran', shortName: 'Al Farooquia', brandArabic: 'x', tagline: 'Madarsa Management System', address: 'x', phone: 'x', email: 'office@farooquia.demo', currency: 'INR', weeklyOff: 5, feeDueDay: 10 })
    if (path.startsWith('/reminders/')) return json(path === '/reminders/template' ? { subject: 'S', body: 'B {student} {balance}' } : { items: [] })
    if (path === '/scheduled-reports/config') return json({ enabled: true, frequency: 'MONTHLY', dayOfWeek: 6, dayOfMonth: 1, sendAt: '09:00', channels: ['EMAIL'], sections: ['attendance'] })
    if (path === '/scheduled-reports/runs') return json({ items: [] })
    if (path === '/admin/jobs') return json({ jobs: [], deliveries: {} })
    if (path === '/payments/config') return json({ provider: 'dev' })
    if (path === '/fees') {
      const ok = p.roles.some((r) => ['ADMIN', 'PRINCIPAL', 'PARENT', 'STUDENT'].includes(r))
      const codes = new Set(ok ? mine.map((x) => x.admissionNo) : [])
      const invoices = demo.invoices.filter((i) => codes.has(i.studentId)).map((i) => ({ id: i.id, number: i.id, admissionNo: i.studentId, period: i.period, plan: { code: i.planId }, status: 'ISSUED', grossMinor: i.gross * 100, discountMinor: i.discount * 100, amountMinor: i.amount * 100, adjustedMinor: 0, dueMinor: i.amount * 100, issuedOn: i.issuedOn, dueDate: i.dueDate }))
      const payments = demo.payments.filter((x) => codes.has(x.studentId)).map((x) => ({ id: x.id, receiptNo: x.receiptNo, admissionNo: x.studentId, receivedOn: x.date, method: 'CASH', recordedBy: 'Office', note: null, allocations: [{ invoiceId: x.invoiceId, amountMinor: x.amount * 100, refundedMinor: 0 }] }))
      return json({ currency: 'INR', invoices, payments })
    }
    if (path === '/grading') return json({ version: 1, bands: demo.grading })
    if (path === '/auth/sessions') return json({ items: [] })
    if (path === '/admin/users') return json({ total: 0, page: 1, pageSize: 100, items: [] })
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404)
  }
}
