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
  admin: { roles: ['SUPER_ADMIN', 'MADRASA_ADMIN'], links: {}, displayName: 'Maulana Shoaib Akhtar', visible: () => true },
  accountant: { roles: ['ACCOUNTANT'], links: {}, displayName: 'Mohammed Salman', visible: () => true },
  ca: { roles: ['CA'], links: {}, displayName: 'CA Rizwan Hussain', visible: () => false },
  committee: { roles: ['COMMITTEE_MEMBER'], links: {}, displayName: 'Haji Abdul Kareem', visible: () => false },
  principal: { roles: ['PRINCIPAL'], links: { staff: { id: 'x', code: 'st-principal' } }, displayName: 'Mufti Abdul Qadir', visible: () => true },
  mentor: { roles: ['MENTOR'], links: { staff: { id: uuid('m1'), code: 'm1' } }, displayName: 'Qari Abdul Rahman Siddiqui', visible: (s) => s.group.code === 'g-hifz-a' },
  warden: { roles: ['WARDEN'], links: { staff: { id: 'w', code: 'st-warden' } }, displayName: 'Hafiz Naseeruddin', visible: (s) => s.hostelResident },
  parent: { roles: ['PARENT'], links: { guardian: { id: uuid('p1'), code: 'p1' } }, displayName: 'Javed Khan', visible: (s) => s.guardians.some((g) => g.code === 'p1') },
  student: { roles: ['STUDENT'], links: { student: { id: uuid('S-1001'), admissionNo: 'S-1001' } }, displayName: 'Abdullah Khan', visible: (s) => s.admissionNo === 'S-1001' },
}

const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

const ADMIN_PERMS = ['users.read', 'users.manage', 'mfa.reset', 'security.manage', 'audit.read', 'settings.manage', 'students.read', 'students.write', 'guardians.read', 'staff.read', 'staff.manage', 'groups.manage', 'concessions.manage', 'attendance.manage', 'attendance.correct', 'learning.manage', 'exams.manage', 'fees.read', 'fees.record', 'fees.invoice', 'fees.adjust', 'fees.refund', 'fees.verify', 'payments.configure', 'hostel.read', 'hostel.manage', 'accounts.read', 'accounts.write', 'accounts.export', 'accounts.close_period', 'analytics.read', 'analytics.students', 'kiosks.manage', 'staff_attendance.read', 'staff_attendance.manage', 'payroll.read', 'payroll.manage', 'payroll.approve', 'halaqa.read', 'halaqa.manage', 'site.manage']
const PERMS = {
  SUPER_ADMIN: ['org.manage', ...ADMIN_PERMS], MADRASA_ADMIN: ADMIN_PERMS,
  PRINCIPAL: ['halaqa.read', 'halaqa.manage', 'halaqa.attendance', 'mureeds.read', 'mureeds.manage', 'mureeds.private_notes', 'site.manage', 'site.publish', 'applications.read', 'applications.decide', 'users.read', 'audit.read', 'students.read', 'guardians.read', 'staff.read', 'attendance.correct', 'fees.read', 'hostel.read', 'analytics.read', 'analytics.students', 'staff_attendance.read'],
  COMMITTEE_MEMBER: ['analytics.read'], CA: ['fees.read', 'accounts.read', 'accounts.export'],
  ACCOUNTANT: ['students.read', 'guardians.read', 'fees.read', 'fees.record', 'fees.invoice', 'fees.verify', 'accounts.read', 'accounts.write', 'accounts.export', 'accounts.close_period', 'staff_attendance.read', 'payroll.read', 'payroll.manage'],
  MENTOR: ['halaqa.attendance'], STUDENT: [], PARENT: [], WARDEN: ['hostel.read', 'hostel.manage'],
}
const FEATURES = { HOSTEL: true, FEES: true, ACCOUNTS: false, NAMAZ_TRACKING: false, STAFF_ATTENDANCE: true, ASSESSMENTS: true, SCHEDULED_REPORTS: true, BIOMETRIC: false, PAYROLL: true, HALAQA: true, PUBLIC_WEBSITE: true }
export const MADRASAS = [
  { id: '00000000-0000-4000-8000-00000000aa01', code: 'MAIN', name: 'Al Farooquia School of Quran', shortName: 'Al Farooquia' },
  { id: '00000000-0000-4000-8000-00000000aa02', code: 'GIRLS', name: 'Al Farooquia Girls Campus', shortName: 'Girls Campus' },
]

/** Returns a fetch implementation that answers as the given persona (or signed out). */
export function fakeFetch(personaName) {
  const p = PERSONAS[personaName]
  return (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost')
    const path = url.pathname.replace('/api/v1', '')
    if (!p) return json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } }, 401)
    const mine = students.filter(p.visible)
    const perms = [...new Set(p.roles.flatMap((r) => PERMS[r]))]
    // Staff of the admin persona work in two madrasas (the switcher shows); everyone else in one.
    const madrasas = (personaName === 'admin' ? MADRASAS : MADRASAS.slice(0, 1)).map((m) => ({ ...m, roles: p.roles }))
    if (path === '/auth/session') return json({ stage: 'full', csrfToken: 'csrf', user: { id: 'u', displayName: p.displayName, email: 'x@farooquia.demo', username: null, locale: 'en', roles: p.roles, links: p.links, mfa: { enabled: true, required: true, recoveryCodesRemaining: 10 } }, madrasa: { ...MADRASAS[0], features: FEATURES }, madrasas, permissions: perms })
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
      const items = demo.exams.filter((e) => perms.includes('students.read') || e.groupIds.some((g) => codes.has(g))).map((e) => ({ id: uuid(e.id), code: e.id, title: e.title, type: e.type, track: e.track.toUpperCase(), date: e.date, status: 'PUBLISHED', groups: e.groupIds.map((g) => ({ code: g })), examiner: { code: e.examinerId }, subjects: e.subjects, grading: null }))
      return json({ items })
    }
    if (path === '/exam-results') {
      const codes = new Set(p.roles.includes('WARDEN') ? [] : mine.map((x) => x.admissionNo))
      return json({ items: demo.results.filter((r) => codes.has(r.studentId)).map((r) => ({ id: r.id, examCode: r.examId, admissionNo: r.studentId, marks: r.marks, remark: r.remark, absent: false })) })
    }
    if (path === '/admin/audit-logs') return json({ total: 1, page: 1, pageSize: 100, items: [{ id: 'a1', at: new Date().toISOString(), actorName: 'Office', actorRole: 'MADRASA_ADMIN', action: 'fees.payment_recorded', entityType: 'student', entityId: mine[0]?.id, summary: 'Receipt NR-2026-0001' }] })
    if (path === '/hostel') return json({ rooms: [{ id: 'r1', code: 'R-101', block: 'Bilal Block', floor: 'Ground', beds: [{ id: 'b1', label: 'Bed A', occupant: students.find((x) => x.hostelResident) }, { id: 'b2', label: 'Bed B', occupant: null }] }], unassigned: [] })
    if (path === '/hostel/roll-call') return json({ from: '', to: '', days: demo.hostelAttendance })
    if (path === '/notifications') return json({ items: [{ id: 'n1', title: 'Welcome', body: 'Hello', link: null, createdAt: new Date().toISOString(), readAt: null, category: 'GENERAL' }] })
    if (path === '/settings') return json({ brandName: 'Al Farooquia School of Quran', shortName: 'Al Farooquia', brandArabic: 'x', tagline: 'Madarsa Management System', address: 'x', phone: 'x', email: 'office@farooquia.demo', currency: 'INR', weeklyOff: 5, feeDueDay: 10 })
    if (path.startsWith('/reminders/')) return json(path === '/reminders/template' ? { subject: 'S', body: 'B {student} {balance}' } : { items: [] })
    if (path === '/scheduled-reports/config') return json({ enabled: true, frequency: 'MONTHLY', dayOfWeek: 6, dayOfMonth: 1, sendAt: '09:00', channels: ['EMAIL'], sections: ['attendance'] })
    if (path === '/scheduled-reports/runs') return json({ items: [] })
    if (path === '/admin/jobs') return json({ jobs: [], deliveries: {} })

    if (path === '/payments/options') return json({ bank: { accountName: 'Al Farooquia Trust', bankName: 'Test Bank', accountNumber: '123456789012', ifsc: 'TEST0001234', branch: null, accountType: 'Current', instructions: 'Write the admission number in the remarks.', referenceHint: null, proofRequired: false }, upi: null })
    if (path === '/payments/submissions') return json({ total: 1, page: 1, pageSize: 50, items: [{ id: 'sub1', code: 'MP-SUB1', student: { id: mine[0]?.id, admissionNo: mine[0]?.admissionNo, name: mine[0]?.name, group: mine[0]?.group }, method: 'BANK_TRANSFER', invoiceIds: [], amountMinor: 50000, currency: 'INR', paidOn: todayISO(), reference: 'UTR123456789', note: null, proof: null, status: 'PENDING_VERIFICATION', reviewNote: null, reviewedAt: null, reviewedBy: null, submittedBy: 'Javed Khan', createdAt: new Date().toISOString(), approvedAmountMinor: null, payment: null }] })
    if (path === '/admin/payment-settings') return json({ bank: { enabled: false, accountName: null, bankName: null, accountNumber: null, ifsc: null, branch: null, accountType: null, instructions: null, referenceHint: null, proofRequired: false, ready: false, problems: ['Enter the bank name.'] }, upi: { enabled: false, hasQr: false, upiId: null, payeeName: null, instructions: null, proofRequired: false, ready: false, problems: ['Upload the Madarsa’s UPI QR code.'] }, updatedAt: null })
    if (path.startsWith('/fees/students/')) return json({
      student: { id: 's1', admissionNo: decodeURIComponent(path.split('/').pop()), name: 'x' }, currency: 'INR', totals: { dueMinor: 150050, paidMinor: 50000, balanceMinor: 100050, overdueMinor: 0 },
      invoices: [
        { id: 'i1', number: 'INV-1', period: '2026-10', status: 'ISSUED', amountMinor: 150050, adjustedMinor: 0, dueMinor: 150050, paidMinor: 50000, balanceMinor: 100050, dueDate: '2026-10-10', overdue: false, voidable: false, adjustments: [{ amountMinor: 1000, kind: 'WAIVER', reason: 'Hardship approved', createdAt: '2026-10-02T00:00:00Z' }] },
        { id: 'i2', number: 'INV-2', period: '2026-11', status: 'ISSUED', amountMinor: 150000, adjustedMinor: 0, dueMinor: 150000, paidMinor: 0, balanceMinor: 150000, dueDate: '2026-11-10', overdue: false, voidable: true, adjustments: [] },
      ],
      payments: [{ id: 'pay1', receiptNo: 'NR-2026-0001', receivedOn: '2026-10-05', method: 'CASH', amountMinor: 50000, refundableMinor: 30000, unallocatedMinor: 0, currency: 'INR', allocations: [], refunds: [{ id: 'r1', amountMinor: 20000, reason: 'Paid twice by mistake', status: 'COMPLETED', createdAt: '2026-10-06T00:00:00Z' }] }],
    })
    if (path === '/halaqa/dashboard') return json({ totalHalaqas: 1, activeHalaqas: 1, totalParticipants: 1, inactiveParticipants: 0, totalMureeds: personaName === 'principal' ? 1 : null, upcomingSessions: 0, completedSessions: 0, attendance30Days: { present: 0, absent: 0, excused: 0 }, recentActivity: [], nextSessions: [] })
    if (path === '/halaqa') return json({ items: [{ id: 'h1', name: 'Tafseer Circle', category: { id: 'c1', name: 'Tafseer' }, teacher: null, frequency: 'WEEKLY', meetingDays: [5], status: 'ACTIVE', attendanceRules: { allowQr: true, teacherWindowDays: 2, excusedCounts: false }, activeMembers: 1, isPublic: false }] })
    if (path === '/halaqa/categories') return json({ items: [{ id: 'c1', name: 'Tafseer', active: true }] })
    if (path === '/halaqa/participants') return json({ total: 1, page: 1, pageSize: 50, items: [{ id: 'p1', fullName: 'Quiet Person', status: 'ACTIVE', halaqas: [], isMureed: personaName === 'principal' }] })
    if (path === '/halaqa/sessions' || path === '/halaqa/messages') return json({ items: [] })
    if (path === '/site/items' || path === '/site/domains' || path === '/site/assets') return json({ items: [] })
    if (path === '/site/settings') return json({ siteName: '', siteNameAr: '', tagline: '', logoAssetId: null, colors: { primary: '#155C46', accent: '#B8893B' }, contact: { address: '', phone: '', email: '', mapUrl: '', hours: '' }, languages: ['en'], privacyNotice: '', consentText: 'x', duplicateWindowDays: 30, retentionDays: 0, notifyApplicants: false, showSeats: false, forms: Object.fromEntries(['ADMISSION', 'HALAQA', 'MUREED', 'EVENT', 'ENQUIRY'].map((k) => [k, { enabled: false, fields: [], allowDocuments: false, instructions: '' }])) })
    if (path === '/applications') return perms.includes('applications.read') ? json({ total: 1, page: 1, pageSize: 200, items: [{ id: 'a1', reference: 'APP-TESTREF123', type: 'MUREED', status: 'PENDING', applicantName: 'Seeker Person', phone: null, email: null, target: null, createdAt: new Date().toISOString() }] }) : json({ error: { code: 'FORBIDDEN', message: 'No' } }, 403)
    if (path === '/applications/stats') return perms.includes('applications.read') ? json({ total: 1, pending: 1, infoRequested: 0, approved: 0, rejected: 0, closed: 0, newEnquiries: 0, openByType: { MUREED: 1 } }) : json({ error: { code: 'FORBIDDEN', message: 'No' } }, 403)
    if (path === '/payroll/runs') return json({ items: [{ id: 'run1', month: '2026-10', status: 'DRAFT', approvedAt: null, paidOn: null, staffCount: 1, totalNetMinor: 2950000 }] })
    if (path === '/payroll/runs/run1') return json({ id: 'run1', month: '2026-10', status: 'DRAFT', rules: {}, totalNetMinor: 2950000, noSalary: ['Hafiz Imran'], warnings: [], stale: false, payslips: [{ id: 'sl1', staffId: 'x', staffName: 'Qari Abdul', staffCode: 'st-1', title: 'Mentor', basicMinor: 3000000, earningsMinor: 3000000, deductionsMinor: 50000, netMinor: 2950000, lines: [{ label: 'Basic', kind: 'EARNING', amountMinor: 3000000 }, { label: 'Advance', kind: 'DEDUCTION', amountMinor: 50000 }], attendance: { absentDays: 2, lateCount: 0, earlyCount: 0, expectedDays: 26, presentDays: 24 }, paidLeaveDays: 0, note: null }] })
    if (path === '/payroll/salaries') return json({ items: [{ staff: { id: 'x', code: 'st-1', displayName: 'Qari Abdul', title: 'Mentor' }, salary: null }] })
    if (path === '/payroll/components' || path === '/payroll/adjustments' || path === '/payroll/me') return json({ items: [] })
    if (path === '/payroll/rules') return json({ dayBasis: 'CALENDAR', fixedDays: 30, deductAbsence: false, lateRule: { enabled: false, countPerDay: 3, countEarly: false }, rounding: 'NONE', requireSecondApprover: true })
    if (path === '/fees') {
      const ok = perms.includes('fees.read') || p.roles.some((r) => ['PARENT', 'STUDENT'].includes(r))
      const codes = new Set(ok ? mine.map((x) => x.admissionNo) : [])
      const invoices = demo.invoices.filter((i) => codes.has(i.studentId)).map((i) => ({ id: i.id, number: i.id, admissionNo: i.studentId, period: i.period, plan: { code: i.planId }, status: 'ISSUED', grossMinor: i.gross * 100, discountMinor: i.discount * 100, amountMinor: i.amount * 100, adjustedMinor: 0, dueMinor: i.amount * 100, issuedOn: i.issuedOn, dueDate: i.dueDate }))
      const payments = demo.payments.filter((x) => codes.has(x.studentId)).map((x) => ({ id: x.id, receiptNo: x.receiptNo, admissionNo: x.studentId, receivedOn: x.date, method: 'CASH', recordedBy: 'Office', note: null, allocations: [{ invoiceId: x.invoiceId, amountMinor: x.amount * 100, refundedMinor: 0 }] }))
      return json({ currency: 'INR', invoices, payments })
    }
    if (path === '/grading') return json({ version: 1, bands: demo.grading })
    if (path === '/auth/sessions') return json({ items: [] })
    if (path === '/kiosks') return json({ from: todayISO(), to: todayISO(), branches: ['Boys Wing'], totals: { registered: 1, active: 1, offline: 0, deactivated: 0, scans: 3, successful: 2, failed: 1, duplicates: 1, lastSyncAt: null }, items: [{ id: 'k1', name: 'Main Gate', branch: 'Boys Wing', location: null, status: 'ACTIVE', online: true, allowedIps: [], settings: {}, lastSeenAt: new Date().toISOString(), lastScanAt: new Date().toISOString(), scans: 3, successful: 2, failed: 1, duplicates: 1 }] })
    if (path === '/kiosk-settings') { const effective = { mode: 'AUTO', checkInWindow: null, checkOutWindow: null, multipleSessions: false, duplicateWindowSeconds: 60, maxSessionHours: 20, pinRequired: false, highSecurity: false, qr: { dynamic: true, static: false, refreshSeconds: 60, ttlSeconds: 75 }, ui: { instructions: 'Show your attendance QR code to the camera.', successSeconds: 4, errorSeconds: 4, screenDimSeconds: 120, fullScreen: true, cameraFacing: 'environment' } }; return json({ organization: {}, madrasa: {}, effective }) }
    if (path === '/staff-attendance') return json({ from: todayISO(), to: todayISO(), total: 1, page: 1, pageSize: 200, items: [{ id: 's1', date: todayISO(), staff: { id: 'st1', code: 'm1', displayName: 'Qari Abdul Rahman Siddiqui', title: 'Mentor' }, shift: { id: 'sh1', name: 'Day' }, checkInAt: new Date().toISOString(), checkOutAt: null, status: 'OPEN', source: 'KIOSK', lateMinutes: 12, earlyMinutes: 0, workedMinutes: null, corrected: false }] })
    if (path === '/staff-attendance/summary') return json({ month: todayISO().slice(0, 7), weeklyOff: 5, items: [{ staff: { id: 'st1', code: 'm1', displayName: 'Qari Abdul Rahman Siddiqui', title: 'Mentor' }, exempt: false, expectedDays: 5, presentDays: 4, absentDays: 1, lateCount: 1, lateMinutes: 12, earlyCount: 0, earlyMinutes: 0, workedMinutes: 1440, missedCheckouts: 0, openSessions: 0 }] })
    if (path === '/staff-shifts') return json({ shifts: [{ id: 'sh1', name: 'Day', startTime: '08:00', endTime: '14:00', graceLateMinutes: 10, graceEarlyMinutes: 0, active: true, staffCount: 1 }], staff: [{ id: 'st1', code: 'm1', displayName: 'Qari Abdul Rahman Siddiqui', title: 'Mentor', hasAccount: true, attendanceExempt: false, shiftIds: ['sh1'] }] })
    if (path === '/staff-attendance/me/qr') return json({ kind: 'dynamic', expiresAt: new Date(Date.now() + 75000).toISOString(), refreshSeconds: 60, qrDataUrl: 'data:image/png;base64,iVBORw0KGgo=', pin: { required: false, set: false }, staff: { displayName: p.displayName, code: 'm1' } })
    if (path === '/staff-attendance/me') return json({ month: todayISO().slice(0, 7), items: [] })
    if (path === '/admin/users') return json({ total: 0, page: 1, pageSize: 100, items: [] })
    if (path === '/org/madrasas' && perms.includes('org.manage')) return json({ items: MADRASAS.map((m) => ({ ...m, active: true, students: 12, staff: 4, features: FEATURES })) })
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404)
  }
}
