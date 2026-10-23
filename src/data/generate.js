// Builds one coherent demo dataset. Every dashboard figure is derived from these
// records at runtime, so the numbers always agree with each other.
import { createRng } from '../utils/random'
import { addDays, weekday, monthKey, addMonths, diffDays } from '../utils/date'
import { DEFAULT_SETTINGS, ADMIN_USER } from '../constants/config'
import { GROUPS, MENTORS, PARENTS, STUDENT_SEEDS, CONCESSIONS, AREAS } from './people'
import { FEE_PLANS, planForSeed, HOSTEL_ROOMS, BED_SEED, LIBRARY } from './catalog'
import { surahByNumber, juzOf } from './quran'

const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

export const SUBJECTS = {
  hifz: [{ name: 'Sabaq Recitation', max: 25 }, { name: 'Sabqi', max: 25 }, { name: 'Manzil', max: 25 }, { name: 'Tajweed', max: 25 }],
  nazira: [{ name: 'Reading Fluency', max: 30 }, { name: 'Tajweed', max: 30 }, { name: 'Makharij', max: 20 }, { name: 'Duas & Masail', max: 20 }],
  qaida: [{ name: 'Letter Recognition', max: 30 }, { name: 'Makharij', max: 30 }, { name: 'Joining & Harakat', max: 25 }, { name: 'Duas', max: 15 }],
  alim: [{ name: 'Nahw (Grammar)', max: 50 }, { name: 'Fiqh', max: 50 }, { name: 'Hadith', max: 50 }, { name: 'Seerah', max: 50 }],
}

export const DEFAULT_GRADING = [
  { grade: 'Mumtaz', arabic: 'ممتاز', min: 85, meaning: 'Excellent' },
  { grade: 'Jayyid Jiddan', arabic: 'جيد جدا', min: 70, meaning: 'Very good' },
  { grade: 'Jayyid', arabic: 'جيد', min: 55, meaning: 'Good' },
  { grade: 'Maqbool', arabic: 'مقبول', min: 40, meaning: 'Pass' },
  { grade: 'Rasib', arabic: 'راسب', min: 0, meaning: 'Re-test needed' },
]

export const DEFAULT_REMINDER_SCHEDULE = [
  { id: 'before', label: 'Before the due date', offset: -3, enabled: true },
  { id: 'on', label: 'On the due date', offset: 0, enabled: true },
  { id: 'after3', label: '3 days after the due date', offset: 3, enabled: true },
  { id: 'after7', label: '7 days after the due date', offset: 7, enabled: true },
]

export const DEFAULT_REMINDER_TEMPLATE =
  'Assalamu Alaikum {guardian}. This is a gentle reminder from {madarsa} that the {period} fee for {student} is due on {dueDate}. Outstanding balance: {balance}. JazakAllahu khairan.'

const COMMENTS = {
  5: ['Excellent, firm memorisation with clear makharij. Keep this pace.', 'Very confident recitation. Ready for the next portion.', 'Strong lesson. Recite it in Sunnah salah today to keep it firm.'],
  4: ['Good lesson with one small hesitation. Revise once more after Asr.', 'Well prepared. Pay attention to the length of madd.', 'Good effort; previous lesson was also firm.'],
  3: ['Acceptable, but needed prompting twice. Revise three times before tomorrow.', 'Some confusion between similar ayahs. Read them side by side tonight.', 'Fair recitation. Build fluency by reading slowly from the Mushaf first.'],
  2: ['Lesson was not firm. Repeat the same portion tomorrow and revise at home.', 'Many prompts needed. Please give extra time to revision tonight.', 'Ghunnah and madd were missed often; practise with the mentor tomorrow.'],
  1: ['Lesson not prepared. The same portion will be repeated; please ensure home revision.', 'Struggled throughout. A short one-to-one session has been planned.'],
}
const QAIDA_COMMENTS = {
  5: ['Read every letter with correct makharij. Nearly ready for the next lesson.'],
  4: ['Good reading; a little slow when joining letters. Practise the last line at home.'],
  3: ['Confuses similar letters (ث / س). Repeat this page twice at home.'],
  2: ['Harakat are still mixed up. Same lesson tomorrow with extra practice.'],
  1: ['Needs a lot of support on this lesson. Please read with the child for 10 minutes daily.'],
}

const TRAIT = {
  strong: { mistakes: [0, 2], hifz: [5, 7], nazira: [12, 18], qaidaStep: 0.35, partial: 0.03, missed: 0, score: [0.82, 0.96] },
  steady: { mistakes: [1, 4], hifz: [4, 6], nazira: [8, 14], qaidaStep: 0.25, partial: 0.1, missed: 0.03, score: [0.64, 0.84] },
  struggling: { mistakes: [2, 7], hifz: [2, 4], nazira: [5, 9], qaidaStep: 0.12, partial: 0.22, missed: 0.12, score: [0.42, 0.66] },
}

const perfFromMistakes = (m) => (m <= 1 ? 5 : m <= 2 ? 4 : m <= 4 ? 3 : m <= 6 ? 2 : 1)

function lengthFactor(surah) {
  if (surah >= 50) return 2
  if (surah >= 26) return 1.5
  return 1
}

function advance(pos, count) {
  // Move a reading position forward; wraps into the next surah when a surah is complete.
  let { surah, ayah } = pos
  ayah += count
  while (surah <= 114 && ayah > surahByNumber(surah).ayahs) {
    ayah -= surahByNumber(surah).ayahs
    surah += 1
  }
  if (surah > 114) return { surah: 114, ayah: 6 }
  return { surah, ayah }
}

export const plannedRangeFrom = (pos, n) => {
  const s = surahByNumber(pos.surah)
  return { surah: pos.surah, fromAyah: pos.ayah, toAyah: Math.min(pos.ayah + n - 1, s.ayahs) }
}

export const rangeText = ({ surah, fromAyah, toAyah }) => `${surahByNumber(surah).name} ${fromAyah}–${toAyah}`

export function generateSeed(today) {
  const rng = createRng(20261022)
  const settings = { ...DEFAULT_SETTINGS }
  const between = ([a, b]) => rng.int(a, b)

  // ---- School days (weekly off excluded, today always included) ----
  const schoolDays = []
  for (let d = today; schoolDays.length < 30; d = addDays(d, -1)) {
    if (d === today || weekday(d) !== settings.weeklyOff) schoolDays.unshift(d)
  }
  const yesterday = schoolDays[schoolDays.length - 2]
  const sabaqDays = schoolDays.slice(-24)

  // ---- Students ----
  const groupOf = (id) => GROUPS.find((g) => g.id === id)
  const bloods = ['A+', 'B+', 'O+', 'AB+', 'O-', 'B-']
  const students = STUDENT_SEEDS.map((s, i) => {
    const g = groupOf(s.groupId)
    const parent = PARENTS.find((p) => p.children.includes(s.id))
    return {
      id: s.id,
      name: s.name,
      gender: s.gender,
      dob: s.dob,
      groupId: s.groupId,
      track: g.track,
      guardianId: parent.id,
      admissionDate: s.admission,
      phone: parent.phone,
      address: `${12 + i * 3}, ${AREAS[i % AREAS.length]}, Sample City`,
      hostel: s.hostel,
      feePlanId: planForSeed(g.track, s.hostel),
      concession: CONCESSIONS[s.id] || null,
      status: 'active',
      bloodGroup: bloods[i % bloods.length],
      medical: i % 9 === 4 ? 'Mild asthma — inhaler kept with hostel warden' : '',
    }
  })
  const seedOf = Object.fromEntries(STUDENT_SEEDS.map((s) => [s.id, s]))

  // ---- Class attendance ----
  const attendance = {}
  const forcedToday = { 'S-1001': 'present', 'S-1004': 'present', 'S-1006': 'absent', 'S-1009': 'absent', 'S-1023': 'excused' }
  for (const day of schoolDays) {
    attendance[day] = {}
    for (const st of students) {
      if (day === today && st.groupId === 'g-nazira-a') continue // not yet marked today
      if (st.admissionDate > day) continue
      const seed = seedOf[st.id]
      let status = 'present'
      const r = rng.next()
      const recent = diffDays(today, day) <= 8
      if (seed.absentee && recent) status = r < 0.4 ? 'absent' : r < 0.5 ? 'late' : 'present'
      else if (r < 0.03) status = 'absent'
      else if (r < 0.05) status = 'excused'
      else if (r < (seed.trait === 'struggling' ? 0.13 : 0.08)) status = 'late'
      if (day === today && forcedToday[st.id]) status = forcedToday[st.id]
      if (day === yesterday && st.id === 'S-1009') status = 'absent'
      if (day === yesterday && st.id === 'S-1006') status = 'present'
      attendance[day][st.id] = status
    }
  }

  // ---- Sabaq / learning records ----
  const sabaq = []
  let sbN = 1
  const skipToday = new Set(['S-1001', 'S-1004', 'S-1027'])
  const tajFor = (trait) => {
    const r = rng.next()
    if (trait === 'strong') return r < 0.85 ? 'good' : 'fair'
    if (trait === 'steady') return r < 0.5 ? 'good' : r < 0.92 ? 'fair' : 'weak'
    return r < 0.15 ? 'good' : r < 0.6 ? 'fair' : 'weak'
  }
  const prevFor = (trait) => {
    const r = rng.next()
    if (trait === 'strong') return r < 0.92 ? 'done' : 'partial'
    if (trait === 'steady') return r < 0.75 ? 'done' : r < 0.95 ? 'partial' : 'not'
    return r < 0.4 ? 'done' : r < 0.78 ? 'partial' : 'not'
  }

  for (const st of students) {
    const seed = seedOf[st.id]
    const t = TRAIT[seed.trait]
    const mentorId = groupOf(st.groupId).mentorId
    let pos = seed.start ? { surah: seed.start[0], ayah: seed.start[1] } : null
    let lesson = seed.qaida || 1
    let dayIndex = 0
    for (const day of sabaqDays) {
      const status = attendance[day]?.[st.id]
      if (!status || status === 'absent' || status === 'excused') continue
      if (day === today && skipToday.has(st.id)) continue
      dayIndex++
      const base = { studentId: st.id, mentorId, date: day, createdAt: `${day}T${String(8 + (sbN % 4)).padStart(2, '0')}:${String(sbN % 60).padStart(2, '0')}:00` }
      const r = rng.next()
      const targetStatus = r < t.missed ? 'missed' : r < t.missed + t.partial ? 'partial' : 'met'
      let mistakes = between(t.mistakes)
      if (targetStatus === 'missed') mistakes = Math.max(mistakes, 6)
      let performance = clamp(perfFromMistakes(mistakes) + (rng.chance(0.15) ? -1 : 0), 1, 5)
      if (targetStatus === 'partial') performance = Math.min(performance, 3)
      const prevRevision = prevFor(seed.trait)
      const common = {
        performance,
        mistakes,
        fluency: clamp(performance + (rng.chance(0.3) ? -1 : 0), 1, 5),
        tajweed: tajFor(seed.trait),
        prevRevision,
        revisionQuality: clamp(performance + (prevRevision === 'not' ? -2 : prevRevision === 'partial' ? -1 : 0), 1, 5),
        targetStatus,
        followUp: performance <= 2 || prevRevision === 'not',
      }

      if (st.track === 'qaida') {
        const lessonNow = lesson
        if (targetStatus === 'met' && rng.chance(t.qaidaStep)) lesson = Math.min(17, lesson + 1)
        sabaq.push({ id: `SB-${sbN++}`, ...base, ...common, category: 'qaida', qaidaLesson: lessonNow, surah: null, fromAyah: null, toAyah: null, juz: null,
          comments: rng.pick(QAIDA_COMMENTS[performance]), nextTarget: lesson > lessonNow ? `Qaida Lesson ${lesson}` : `Repeat Qaida Lesson ${lessonNow}` })
        continue
      }

      if (st.track === 'alim') {
        const s = rng.int(2, 66)
        const sur = surahByNumber(s)
        const len = Math.min(sur.ayahs, rng.int(25, 45))
        const from = rng.int(1, sur.ayahs - len + 1)
        const next = surahByNumber(s + 1)
        sabaq.push({ id: `SB-${sbN++}`, ...base, ...common, category: 'manzil', surah: s, fromAyah: from, toAyah: from + len - 1, juz: juzOf(s, from),
          comments: rng.pick(COMMENTS[performance]), nextTarget: `Manzil: ${next.name} 1–${Math.min(next.ayahs, 40)}` })
        continue
      }

      // Hifz or Nazira — forward progression
      const nBase = between(st.track === 'hifz' ? t.hifz : t.nazira)
      const n = Math.round(nBase * lengthFactor(pos.surah))
      const planned = plannedRangeFrom(pos, n)
      let covered = planned
      if (targetStatus === 'partial') covered = { ...planned, toAyah: planned.fromAyah + Math.max(0, Math.floor((planned.toAyah - planned.fromAyah) / 2)) }
      if (targetStatus !== 'missed') pos = advance({ surah: covered.surah, ayah: covered.toAyah }, 1)
      const nextPlan = plannedRangeFrom(pos, n)
      sabaq.push({ id: `SB-${sbN++}`, ...base, ...common, category: st.track === 'hifz' ? 'sabaq' : 'nazira', ...covered, juz: juzOf(covered.surah, covered.fromAyah),
        comments: rng.pick(COMMENTS[performance]), nextTarget: `${targetStatus === 'missed' ? 'Repeat: ' : ''}${rangeText(nextPlan)}` })

      if (st.track !== 'hifz') continue
      // Hifz students also revise: Sabqi and Manzil on alternate days.
      const rev = { ...base, createdAt: base.createdAt.replace(/:00$/, ':30'), mistakes: between(t.mistakes), tajweed: tajFor(seed.trait), prevRevision: 'done', targetStatus: 'met', revisionQuality: null }
      rev.performance = clamp(perfFromMistakes(rev.mistakes), 1, 5)
      rev.fluency = rev.performance
      rev.followUp = rev.performance <= 2
      let range = null
      let category = dayIndex % 2 === 0 ? 'manzil' : 'sabqi'
      if (category === 'manzil') {
        if (covered.surah > 2) {
          const s = rng.int(2, covered.surah - 1)
          const sur = surahByNumber(s)
          const len = Math.min(sur.ayahs, rng.int(20, 40))
          const from = rng.int(1, sur.ayahs - len + 1)
          range = { surah: s, fromAyah: from, toAyah: from + len - 1 }
        } else if (covered.fromAyah > 41) {
          const from = rng.int(1, covered.fromAyah - 40)
          range = { surah: 2, fromAyah: from, toAyah: from + 19 }
        } else category = 'sabqi'
      }
      if (category === 'sabqi') {
        if (covered.fromAyah > 1) range = { surah: covered.surah, fromAyah: Math.max(1, covered.fromAyah - n * 3), toAyah: covered.fromAyah - 1 }
        else {
          const prev = surahByNumber(covered.surah - 1)
          range = { surah: prev.number, fromAyah: Math.max(1, prev.ayahs - 14), toAyah: prev.ayahs }
        }
      }
      sabaq.push({ id: `SB-${sbN++}`, ...rev, category, ...range, juz: juzOf(range.surah, range.fromAyah),
        comments: rng.pick(COMMENTS[rev.performance]), nextTarget: category === 'sabqi' ? 'Continue Sabqi of the last five lessons' : 'Next Manzil portion as per weekly plan' })
    }
  }

  // ---- Fees ----
  const cur = monthKey(today)
  const months = [addMonths(cur, -3), addMonths(cur, -2), addMonths(cur, -1), cur]
  const dueDay = String(settings.feeDueDay).padStart(2, '0')
  const invoices = []
  const payments = []
  const clampDate = (d) => (d > today ? today : d)
  for (const st of students) {
    const plan = FEE_PLANS.find((p) => p.id === st.feePlanId)
    const pctOff = st.concession?.percent || 0
    if (pctOff >= 100) continue
    const discount = Math.round((plan.amount * pctOff) / 100 / 10) * 10
    const amount = plan.amount - discount
    const payer = seedOf[st.id].payer
    months.forEach((m, mi) => {
      if (`${m}-28` < st.admissionDate) return
      const inv = { id: `INV-${m}-${st.id}`, studentId: st.id, period: m, planId: plan.id, gross: plan.amount, discount, amount, issuedOn: `${m}-01`, dueDate: m === cur ? addDays(today, 6) : `${m}-${dueDay}` }
      invoices.push(inv)
      const isCur = mi === 3
      const pay = (amt, dayRange) => {
        const day = String(rng.int(dayRange[0], dayRange[1])).padStart(2, '0')
        payments.push({ studentId: st.id, invoiceId: inv.id, amount: amt, date: clampDate(`${m}-${day}`), method: rng.pick(['Cash', 'UPI', 'UPI', 'Bank Transfer']), recordedBy: 'Office (Accounts)' })
      }
      if (payer === 'prompt') pay(amount, [2, 9])
      else if (payer === 'late') { if (!isCur) pay(amount, [8, 24]) }
      else if (payer === 'partial') isCur ? pay(Math.round(amount / 2 / 10) * 10, [3, 12]) : pay(amount, [3, 12])
      else if (payer === 'partial-prev') { if (mi < 2) pay(amount, [4, 10]); else if (mi === 2) pay(amount - 500, [6, 14]) }
      else if (payer === 'overdue') { if (mi === 0) pay(amount, [10, 26]) }
    })
  }
  payments.sort((a, b) => a.date.localeCompare(b.date))
  payments.forEach((p, i) => {
    p.id = `PAY-${1001 + i}`
    p.receiptNo = `NR-${p.date.slice(0, 4)}-${String(i + 1).padStart(4, '0')}`
  })

  const reminderLog = []
  for (const st of students) {
    if (seedOf[st.id].payer !== 'overdue' && seedOf[st.id].payer !== 'partial-prev') continue
    const prevInv = invoices.find((i) => i.studentId === st.id && i.period === months[2])
    if (!prevInv) continue
    ;['on', 'after3', 'after7'].forEach((stage, k) => {
      const sentOn = addDays(prevInv.dueDate, [0, 3, 7][k])
      if (sentOn <= today) reminderLog.push({ id: `RM-${reminderLog.length + 1}`, studentId: st.id, invoiceId: prevInv.id, stage, sentOn, channel: 'WhatsApp (simulated)' })
    })
  }

  // ---- Examinations ----
  const hifzGroups = ['g-hifz-a', 'g-hifz-b']
  const naziraGroups = ['g-nazira-a', 'g-nazira-b']
  const prevMonthName = new Date(`${months[2]}-15T00:00:00`).toLocaleDateString('en-GB', { month: 'long' })
  const exams = [
    { id: 'EX-1', title: `${prevMonthName} Monthly Test`, type: 'Monthly Test', track: 'hifz', groupIds: hifzGroups, date: addDays(today, -24), examinerId: 'm1' },
    { id: 'EX-2', title: `${prevMonthName} Monthly Test`, type: 'Monthly Test', track: 'nazira', groupIds: naziraGroups, date: addDays(today, -23), examinerId: 'm3' },
    { id: 'EX-3', title: `${prevMonthName} Monthly Test`, type: 'Monthly Test', track: 'qaida', groupIds: ['g-qaida'], date: addDays(today, -23), examinerId: 'm5' },
    { id: 'EX-4', title: 'First Quarterly Examination', type: 'Term Exam', track: 'alim', groupIds: ['g-alim'], date: addDays(today, -18), examinerId: 'm6' },
    { id: 'EX-5', title: 'Oral Makharij Check', type: 'Oral Assessment', track: 'qaida', groupIds: ['g-qaida'], date: addDays(today, -1), examinerId: 'm5' },
    { id: 'EX-6', title: 'Juz Review Test', type: 'Hifz Juz Test', track: 'hifz', groupIds: ['g-hifz-a'], date: addDays(today, 4), examinerId: 'm1' },
    { id: 'EX-7', title: 'Tajweed Oral Assessment', type: 'Oral Assessment', track: 'nazira', groupIds: naziraGroups, date: addDays(today, 8), examinerId: 'm4' },
    { id: 'EX-8', title: 'Half-Yearly Examination', type: 'Term Exam', track: 'hifz', groupIds: hifzGroups, date: addDays(today, 20), examinerId: 'm2' },
    { id: 'EX-9', title: 'Half-Yearly Examination', type: 'Term Exam', track: 'alim', groupIds: ['g-alim'], date: addDays(today, 22), examinerId: 'm6' },
  ].map((e) => ({ ...e, subjects: SUBJECTS[e.track] }))

  const results = []
  const REMARKS = {
    high: ['Excellent preparation and confident delivery.', 'Very firm; keep up the daily Manzil.', 'Outstanding effort this month.'],
    mid: ['Good overall; revise weaker portions before the next test.', 'Steady progress. Tajweed needs a little more care.', 'Satisfactory; aim for more fluency.'],
    low: ['Needs more home revision. Mentor will give extra practice.', 'Several portions were weak; a re-test is advised.', 'Basic rules need reinforcement before moving ahead.'],
  }
  for (const ex of exams.filter((e) => e.date < addDays(today, -2))) {
    for (const st of students.filter((s) => ex.groupIds.includes(s.groupId) && s.admissionDate <= ex.date)) {
      const t = TRAIT[seedOf[st.id].trait]
      const marks = {}
      let total = 0, max = 0
      ex.subjects.forEach((sub) => {
        const f = t.score[0] + rng.next() * (t.score[1] - t.score[0])
        marks[sub.name] = Math.round(sub.max * f)
        total += marks[sub.name]
        max += sub.max
      })
      const ratio = total / max
      results.push({ id: `RS-${results.length + 1}`, examId: ex.id, studentId: st.id, marks, remark: rng.pick(ratio >= 0.8 ? REMARKS.high : ratio >= 0.6 ? REMARKS.mid : REMARKS.low) })
    }
  }

  // ---- Hostel ----
  const beds = []
  HOSTEL_ROOMS.forEach((room) => {
    for (let i = 0; i < room.beds; i++) {
      beds.push({ id: `${room.id}-${'ABCD'[i]}`, roomId: room.id, label: `Bed ${'ABCD'[i]}`, studentId: BED_SEED[room.id]?.[i] || null })
    }
  })
  const hostelAttendance = {}
  const assigned = beds.filter((b) => b.studentId).map((b) => b.studentId)
  schoolDays.slice(-8, -1).forEach((day) => {
    hostelAttendance[day] = {}
    assigned.forEach((sid) => {
      let s = rng.chance(0.04) ? 'leave' : 'present'
      if (day === yesterday && sid === 'S-1006') s = 'absent'
      if (day === yesterday && sid === 'S-1009') s = 'present'
      hostelAttendance[day][sid] = s
    })
  })

  // ---- Library ----
  const library = LIBRARY.map((r) => ({ ...r, uploaded: addDays(today, r.uploaded), uploadedBy: 'Academic Office' }))

  // ---- Notifications ----
  const notifications = [
    { id: 'N-1', audience: [{ role: 'admin' }], title: 'New admission awaiting hostel bed', body: 'Yahya Chaudhry and Rayyan Patel are hostel residents without a bed assignment.', date: addDays(today, -1), link: '/hostel', read: false },
    { id: 'N-2', audience: [{ role: 'admin' }], title: 'Quarterly exam marks submitted', body: 'Mufti Zubair Ahmed Qasmi entered marks for Alimiyyah Year 1.', date: addDays(today, -17), link: '/exams/EX-4', read: true },
    { id: 'N-3', audience: [{ role: 'admin' }, { role: 'mentor', id: 'm5' }], title: 'Marks pending: Oral Makharij Check', body: 'The Qaida oral assessment was held yesterday. Marks have not been entered yet.', date: today, link: '/exams/EX-5', read: false },
    { id: 'N-4', audience: [{ role: 'mentor', id: 'm1' }], title: 'Juz Review Test in 4 days', body: 'Hifz Halqa A — prepare students for the Juz review.', date: addDays(today, -1), link: '/exams/EX-6', read: false },
    { id: 'N-5', audience: [{ role: 'mentor' }, { role: 'student' }], title: 'New resource: Waqf Signs in the Mushaf', body: 'A short Tajweed guide was added to the Digital Library.', date: addDays(today, -5), link: '/library', read: false },
    { id: 'N-6', audience: [{ role: 'parent', id: 'p1' }], title: 'Monthly fee is due soon', body: 'The current month fee for Abdullah and Maryam is due within a week.', date: today, link: '/fees', read: false },
    { id: 'N-7', audience: [{ role: 'parent', id: 'p1' }, { role: 'student', id: 'S-1001' }], title: 'Juz Review Test scheduled', body: 'Hifz Halqa A has a Juz Review Test in 4 days.', date: addDays(today, -1), link: '/exams', read: false },
    { id: 'N-8', audience: [{ role: 'student', id: 'S-1001' }], title: 'Mentor feedback added', body: 'Qari Abdul Rahman left feedback on your latest Sabaq.', date: addDays(today, -1), link: '/sabaq', read: true },
  ]

  // ---- Audit trail (derived from the generated records so it is consistent) ----
  const audit = []
  const push = (e) => audit.push({ id: `AU-${audit.length + 1}`, ...e })
  const mentorName = (id) => MENTORS.find((m) => m.id === id).name
  const recentPays = payments.filter((p) => diffDays(today, p.date) <= 4)
  recentPays.forEach((p) => {
    const st = students.find((s) => s.id === p.studentId)
    push({ ts: `${p.date}T11:${String(10 + (audit.length % 40)).padStart(2, '0')}:00`, actor: 'Office (Accounts)', role: 'admin', action: 'Fee payment recorded', entity: st.name, entityId: st.id, description: `Receipt ${p.receiptNo} · ${p.method} · ${p.amount}` })
  })
  ;[yesterday, today].forEach((day) => {
    GROUPS.forEach((g) => {
      const marked = students.some((s) => s.groupId === g.id && attendance[day]?.[s.id])
      if (!marked) return
      push({ ts: `${day}T07:${String(5 + GROUPS.indexOf(g) * 4).padStart(2, '0')}:00`, actor: mentorName(g.mentorId), role: 'mentor', action: 'Attendance marked', entity: g.name, entityId: g.id, description: `Daily attendance submitted for ${g.name}` })
      const count = sabaq.filter((r) => r.date === day && students.find((s) => s.id === r.studentId).groupId === g.id).length
      if (count) push({ ts: `${day}T12:${String(10 + GROUPS.indexOf(g) * 5).padStart(2, '0')}:00`, actor: mentorName(g.mentorId), role: 'mentor', action: 'Sabaq recorded', entity: g.name, entityId: g.id, description: `${count} learning records saved` })
    })
  })
  push({ ts: `${addDays(today, -2)}T10:20:00`, actor: ADMIN_USER.name, role: 'admin', action: 'Student record updated', entity: 'Yahya Chaudhry', entityId: 'S-1019', description: 'Admission completed; marked as hostel resident' })
  push({ ts: `${addDays(today, -3)}T09:45:00`, actor: ADMIN_USER.name, role: 'admin', action: 'Mentor assigned', entity: 'Hifz Halqa B', entityId: 'g-hifz-b', description: 'Hafiz Muhammad Imran Ansari confirmed as mentor' })
  audit.sort((a, b) => b.ts.localeCompare(a.ts))

  return {
    version: 2,
    seededOn: today,
    settings,
    session: null,
    groups: GROUPS.map((g) => ({ ...g })),
    mentors: MENTORS.map((m) => ({ ...m })),
    parents: PARENTS.map((p) => ({ ...p, children: [...p.children] })),
    students,
    attendance,
    hostelAttendance,
    sabaq,
    feePlans: FEE_PLANS.map((p) => ({ ...p })),
    invoices,
    payments,
    reminderSchedule: DEFAULT_REMINDER_SCHEDULE.map((r) => ({ ...r })),
    reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
    reminderLog,
    exams,
    results,
    grading: DEFAULT_GRADING.map((g) => ({ ...g })),
    rooms: HOSTEL_ROOMS.map((r) => ({ ...r })),
    beds,
    library,
    notifications,
    audit,
  }
}
