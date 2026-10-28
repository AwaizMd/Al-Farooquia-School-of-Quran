// A small in-memory stand-in for the backend, built from the fictional demo
// people, returning the same shapes as the real API. Used by smoke tests only.
import { GROUPS, MENTORS, PARENTS, STUDENT_SEEDS, CONCESSIONS } from '../data/people'
import { FEE_PLANS, planForSeed } from '../data/catalog'

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
    if (path === '/auth/sessions') return json({ items: [] })
    if (path === '/admin/users') return json({ total: 0, page: 1, pageSize: 100, items: [] })
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404)
  }
}
