export const FEE_PLANS = [
  { id: 'fp-hifz', name: 'Hifz — Day Scholar', amount: 1500, cycle: 'Monthly', covers: 'Tuition, Mushaf & stationery' },
  { id: 'fp-nazira', name: 'Nazira / Qaida — Day Scholar', amount: 800, cycle: 'Monthly', covers: 'Tuition & reading material' },
  { id: 'fp-alim', name: 'Alimiyyah — Day Scholar', amount: 1200, cycle: 'Monthly', covers: 'Tuition & textbooks' },
  { id: 'fp-res', name: 'Residential (Hostel)', amount: 3500, cycle: 'Monthly', covers: 'Tuition, boarding & three meals' },
]

export const planForSeed = (track, hostel) => {
  if (hostel) return 'fp-res'
  if (track === 'hifz') return 'fp-hifz'
  if (track === 'alim') return 'fp-alim'
  return 'fp-nazira'
}

export const HOSTEL_ROOMS = [
  { id: 'R-101', block: 'Bilal Block', floor: 'Ground', beds: 4 },
  { id: 'R-102', block: 'Bilal Block', floor: 'Ground', beds: 4 },
  { id: 'R-103', block: 'Bilal Block', floor: 'Ground', beds: 4 },
  { id: 'R-104', block: 'Bilal Block', floor: 'Ground', beds: 4 },
  { id: 'R-201', block: 'Umar Block', floor: 'First', beds: 4 },
  { id: 'R-202', block: 'Umar Block', floor: 'First', beds: 4 },
  { id: 'R-203', block: 'Umar Block', floor: 'First', beds: 3 },
  { id: 'R-204', block: 'Umar Block', floor: 'First', beds: 3 },
]

// Initial bed assignments: room → student IDs by bed order.
export const BED_SEED = {
  'R-101': ['S-1002', 'S-1003', 'S-1005', 'S-1007'],
  'R-102': ['S-1006', 'S-1009', 'S-1012'],
  'R-103': ['S-1010', 'S-1013'],
  'R-201': ['S-1029', 'S-1030', 'S-1031', 'S-1032'],
  'R-202': ['S-1018'],
}

export const LIBRARY = [
  { id: 'L-01', title: 'Noorani Qaida — Practice Workbook', category: 'Nazira', type: 'Worksheet', author: 'Faculty (sample)', uploaded: -60, access: 'All students', pages: 8, file: '/samples/noorani-qaida-sample.pdf', description: 'Letter recognition, joining and Harakat drills arranged lesson by lesson with space for the mentor\'s initials.' },
  { id: 'L-02', title: 'Tajweed Essentials: Noon Sakinah & Tanween', category: 'Tajweed', type: 'Tajweed Guide', author: 'Qari Salman Nadwi (sample)', uploaded: -42, access: 'All students', pages: 6, file: '/samples/tajweed-noon-sakinah-sample.pdf', description: 'Izhar, Idgham, Iqlab and Ikhfa explained with short examples and a self-check table.' },
  { id: 'L-03', title: 'Makharij al-Huruf Chart', category: 'Tajweed', type: 'Study Notes', author: 'Faculty (sample)', uploaded: -90, access: 'All students', pages: 2, description: 'Points of articulation of the Arabic letters grouped by throat, tongue, lips and nasal passage.' },
  { id: 'L-04', title: 'Hifz Daily Planner — Sabaq, Sabqi, Manzil', category: 'Hifz', type: 'Worksheet', author: 'Qari Abdul Rahman Siddiqui (sample)', uploaded: -20, access: 'Hifz groups', pages: 4, description: 'A printable weekly tracker so students and parents can follow the three-part daily revision routine.' },
  { id: 'L-05', title: 'Mutashabihat in Juz 1–5', category: 'Hifz', type: 'Study Notes', author: 'Hafiz Muhammad Imran Ansari (sample)', uploaded: -12, access: 'Hifz groups', pages: 14, description: 'Similar-sounding ayahs that are commonly confused, listed side by side with memory cues.' },
  { id: 'L-06', title: 'Rules of Madd — Quick Reference', category: 'Tajweed', type: 'Tajweed Guide', author: 'Ustadha Ayesha Siddiqa (sample)', uploaded: -33, access: 'All students', pages: 3, description: 'Madd Tabee\'i, Muttasil, Munfasil, Lazim and \'Arid with counts and colour-coded examples.' },
  { id: 'L-07', title: 'Arabic Grammar Primer (Nahw Mir excerpt notes)', category: 'Arabic', type: 'Study Notes', author: 'Mufti Zubair Ahmed Qasmi (sample)', uploaded: -55, access: 'Alimiyyah', pages: 22, description: 'Class notes on Ism, Fi\'l and Harf with i\'rab practice sentences.' },
  { id: 'L-08', title: 'Arabic Vocabulary from Juz Amma', category: 'Arabic', type: 'Worksheet', author: 'Maulana Yusuf Qasmi (sample)', uploaded: -8, access: 'All students', pages: 10, description: 'Frequently repeated words in the last Juz with meanings, for building understanding alongside recitation.' },
  { id: 'L-09', title: 'Essential Masail of Taharah & Salah', category: 'Islamic Studies', type: 'PDF Book', author: 'Faculty (sample)', uploaded: -75, access: 'All students', pages: 30, description: 'Simple question-and-answer notes on wudu, ghusl and the conditions of salah for young students.' },
  { id: 'L-10', title: 'Seerah for Young Learners — Part 1', category: 'Islamic Studies', type: 'PDF Book', author: 'Faculty (sample)', uploaded: -28, access: 'All students', pages: 40, description: 'The Makkan period told in short chapters with review questions at the end of each.' },
  { id: 'L-11', title: 'Forty Hadith — Memorisation Cards', category: 'Islamic Studies', type: 'Study Notes', author: 'Mufti Zubair Ahmed Qasmi (sample)', uploaded: -15, access: 'Alimiyyah', pages: 20, description: 'One hadith per card with Arabic text, translation and a key lesson.' },
  { id: 'L-12', title: 'Daily Duas Booklet', category: 'General Learning', type: 'PDF Book', author: 'Faculty (sample)', uploaded: -100, access: 'All students', pages: 12, description: 'Morning, evening, eating, travel and sleeping duas with transliteration.' },
  { id: 'L-13', title: 'Waqf Signs in the Mushaf', category: 'Tajweed', type: 'Tajweed Guide', author: 'Qari Abdul Rahman Siddiqui (sample)', uploaded: -5, access: 'All students', pages: 2, description: 'Meaning of each stopping sign and how mentors expect students to apply them in Nazira.' },
  { id: 'L-14', title: 'Recitation Practice: Surah Al-Mulk (audio guide)', category: 'Hifz', type: 'Audio Guide', author: 'Faculty (sample)', uploaded: -3, access: 'Hifz groups', pages: null, description: 'Listening plan for slow, measured recitation practice. Audio is not bundled with this demo.' },
  { id: 'L-15', title: 'Mentor Handbook: Assessing Sabaq', category: 'General Learning', type: 'PDF Book', author: 'Academic Committee (sample)', uploaded: -120, access: 'Staff only', pages: 18, description: 'Shared rubric for performance, fluency and Tajweed ratings so all halqas assess consistently.' },
]
