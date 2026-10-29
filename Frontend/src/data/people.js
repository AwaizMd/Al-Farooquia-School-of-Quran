// Fictional people and groups for the demo. All names, phone numbers and emails are invented.

export const GROUPS = [
  { id: 'g-hifz-a', name: 'Hifz Halqa A', short: 'Hifz A', track: 'hifz', mentorId: 'm1', room: 'Hall 1', timing: 'After Fajr – 12:30 pm', gender: 'Boys' },
  { id: 'g-hifz-b', name: 'Hifz Halqa B', short: 'Hifz B', track: 'hifz', mentorId: 'm2', room: 'Hall 2', timing: 'After Fajr – 12:30 pm', gender: 'Boys' },
  { id: 'g-nazira-a', name: 'Nazira Halqa A', short: 'Nazira A', track: 'nazira', mentorId: 'm3', room: 'Room 4', timing: '4:00 pm – 6:30 pm', gender: 'Boys' },
  { id: 'g-nazira-b', name: 'Nazira Halqa B', short: 'Nazira B', track: 'nazira', mentorId: 'm4', room: 'Girls Wing 1', timing: '4:00 pm – 6:30 pm', gender: 'Girls' },
  { id: 'g-qaida', name: 'Noorani Qaida', short: 'Qaida', track: 'qaida', mentorId: 'm5', room: 'Room 2', timing: '4:00 pm – 6:00 pm', gender: 'Mixed' },
  { id: 'g-alim', name: 'Alimiyyah Year 1', short: 'Alim 1', track: 'alim', mentorId: 'm6', room: 'Darsgah 1', timing: '8:00 am – 2:00 pm', gender: 'Boys' },
]

export const MENTORS = [
  { id: 'm1', name: 'Qari Abdul Rahman Siddiqui', role: 'Senior Hifz Mentor', phone: '+00 90000 10001', email: 'mentor@farooquia.demo', joined: '2016-06-12', status: 'active', qualification: 'Hafiz, Qari (Hafs)', specialisation: 'Hifz & Tajweed' },
  { id: 'm2', name: 'Hafiz Muhammad Imran Ansari', role: 'Hifz Mentor', phone: '+00 90000 10002', email: 'imran.ansari@farooquia.demo', joined: '2019-04-02', status: 'active', qualification: 'Hafiz, Alim', specialisation: 'Hifz' },
  { id: 'm3', name: 'Maulana Yusuf Qasmi', role: 'Nazira Mentor', phone: '+00 90000 10003', email: 'yusuf.qasmi@farooquia.demo', joined: '2018-07-20', status: 'active', qualification: 'Alim, Fazil', specialisation: 'Nazira & Arabic' },
  { id: 'm4', name: 'Ustadha Ayesha Siddiqa', role: 'Nazira Mentor (Girls)', phone: '+00 90000 10004', email: 'ayesha.siddiqa@farooquia.demo', joined: '2020-01-15', status: 'active', qualification: 'Alimah, Qariah', specialisation: 'Nazira & Tajweed' },
  { id: 'm5', name: 'Qari Salman Nadwi', role: 'Qaida Mentor', phone: '+00 90000 10005', email: 'salman.nadwi@farooquia.demo', joined: '2021-08-09', status: 'active', qualification: 'Qari, Nadwi graduate', specialisation: 'Foundation Tajweed' },
  { id: 'm6', name: 'Mufti Zubair Ahmed Qasmi', role: 'Alimiyyah Teacher', phone: '+00 90000 10006', email: 'zubair.qasmi@farooquia.demo', joined: '2015-03-01', status: 'active', qualification: 'Mufti, Alim', specialisation: 'Fiqh & Hadith' },
  { id: 'm7', name: 'Hafiz Tariq Mehmood', role: 'Hifz Mentor (Relief)', phone: '+00 90000 10007', email: 'tariq.mehmood@farooquia.demo', joined: '2022-02-10', status: 'inactive', qualification: 'Hafiz', specialisation: 'Hifz revision' },
]

export const PARENTS = [
  { id: 'p1', name: 'Javed Khan', relation: 'Father', phone: '+00 91111 20001', email: 'parent@farooquia.demo', occupation: 'Pharmacist', children: ['S-1001', 'S-1020'] },
  { id: 'p2', name: 'Rashid Shaikh', relation: 'Father', phone: '+00 91111 20002', email: 'rashid.shaikh@family.demo', occupation: 'Textile trader', children: ['S-1008', 'S-1021', 'S-1025'] },
  { id: 'p3', name: 'Naeem Ansari', relation: 'Father', phone: '+00 91111 20003', email: 'naeem.ansari@family.demo', occupation: 'Teacher', children: ['S-1002', 'S-1023'] },
  { id: 'p4', name: 'Farhan Qureshi', relation: 'Father', phone: '+00 91111 20004', email: 'farhan.q@family.demo', occupation: 'Engineer', children: ['S-1003', 'S-1016', 'S-1024'] },
  { id: 'p5', name: 'Shabana Ahmed', relation: 'Mother', phone: '+00 91111 20005', email: 'shabana.a@family.demo', occupation: 'Homemaker', children: ['S-1004'] },
  { id: 'p6', name: 'Kamran Siddiqui', relation: 'Father', phone: '+00 91111 20006', email: 'kamran.s@family.demo', occupation: 'Accountant', children: ['S-1005', 'S-1022'] },
  { id: 'p7', name: 'Asif Mirza', relation: 'Father', phone: '+00 91111 20007', email: 'asif.mirza@family.demo', occupation: 'Driver', children: ['S-1006', 'S-1028'] },
  { id: 'p8', name: 'Iqbal Malik', relation: 'Father', phone: '+00 91111 20008', email: 'iqbal.malik@family.demo', occupation: 'Farmer', children: ['S-1007'] },
  { id: 'p9', name: 'Shahid Khan', relation: 'Father', phone: '+00 91111 20009', email: 'shahid.khan@family.demo', occupation: 'Shopkeeper', children: ['S-1009'] },
  { id: 'p10', name: 'Altaf Hussain', relation: 'Father', phone: '+00 91111 20010', email: 'altaf.h@family.demo', occupation: 'Electrician', children: ['S-1010'] },
  { id: 'p11', name: 'Yunus Patel', relation: 'Father', phone: '+00 91111 20011', email: 'yunus.patel@family.demo', occupation: 'Businessman', children: ['S-1011', 'S-1026'] },
  { id: 'p12', name: 'Rizwan Raza', relation: 'Father', phone: '+00 91111 20012', email: 'rizwan.raza@family.demo', occupation: 'Tailor', children: ['S-1012'] },
  { id: 'p13', name: 'Saleem Pathan', relation: 'Father', phone: '+00 91111 20013', email: 'saleem.p@family.demo', occupation: 'Contractor', children: ['S-1013'] },
  { id: 'p14', name: 'Zeenat Ali', relation: 'Mother', phone: '+00 91111 20014', email: 'zeenat.ali@family.demo', occupation: 'Nurse', children: ['S-1014'] },
  { id: 'p15', name: 'Tanveer Shaikh', relation: 'Father', phone: '+00 91111 20015', email: 'tanveer.s@family.demo', occupation: 'Mechanic', children: ['S-1015'] },
  { id: 'p16', name: 'Ruksana Javed', relation: 'Guardian (Aunt)', phone: '+00 91111 20016', email: 'ruksana.j@family.demo', occupation: 'Tailoring', children: ['S-1017'] },
  { id: 'p17', name: 'Mushtaq Mansoori', relation: 'Father', phone: '+00 91111 20017', email: 'mushtaq.m@family.demo', occupation: 'Baker', children: ['S-1018'] },
  { id: 'p18', name: 'Nadeem Chaudhry', relation: 'Father', phone: '+00 91111 20018', email: 'nadeem.c@family.demo', occupation: 'Clerk', children: ['S-1019'] },
  { id: 'p19', name: 'Akhtar Rizvi', relation: 'Father', phone: '+00 91111 20019', email: 'akhtar.r@family.demo', occupation: 'Daily wage', children: ['S-1027'] },
  { id: 'p20', name: 'Wasim Syed', relation: 'Father', phone: '+00 91111 20020', email: 'wasim.syed@family.demo', occupation: 'Doctor', children: ['S-1029'] },
  { id: 'p21', name: 'Habibullah Nadwi', relation: 'Father', phone: '+00 91111 20021', email: 'habib.n@family.demo', occupation: 'Imam', children: ['S-1030'] },
  { id: 'p22', name: 'Sarfaraz Lodhi', relation: 'Father', phone: '+00 91111 20022', email: 'sarfaraz.l@family.demo', occupation: 'Transport', children: ['S-1031'] },
  { id: 'p23', name: 'Anwar Baig', relation: 'Father', phone: '+00 91111 20023', email: 'anwar.baig@family.demo', occupation: 'Retired', children: ['S-1032'] },
]

// `start` is the learning position at the beginning of the generated history.
// `trait` shapes generated ratings; `payer` shapes generated fee history.
export const STUDENT_SEEDS = [
  // Hifz Halqa A
  { id: 'S-1001', name: 'Abdullah Khan', gender: 'M', dob: '2013-03-14', groupId: 'g-hifz-a', start: [3, 52], trait: 'steady', payer: 'partial-prev', hostel: false, admission: '2023-04-10' },
  { id: 'S-1002', name: 'Ibrahim Ansari', gender: 'M', dob: '2012-11-02', groupId: 'g-hifz-a', start: [2, 150], trait: 'strong', payer: 'prompt', hostel: true, admission: '2023-04-10' },
  { id: 'S-1003', name: 'Usman Qureshi', gender: 'M', dob: '2012-07-21', groupId: 'g-hifz-a', start: [9, 12], trait: 'steady', payer: 'prompt', hostel: true, admission: '2022-04-05' },
  { id: 'S-1004', name: 'Bilal Ahmed', gender: 'M', dob: '2013-09-30', groupId: 'g-hifz-a', start: [2, 28], trait: 'struggling', payer: 'late', hostel: false, admission: '2024-06-17' },
  { id: 'S-1005', name: 'Zaid Siddiqui', gender: 'M', dob: '2011-12-08', groupId: 'g-hifz-a', start: [18, 20], trait: 'strong', payer: 'prompt', hostel: true, admission: '2021-04-12' },
  { id: 'S-1006', name: 'Talha Mirza', gender: 'M', dob: '2013-01-19', groupId: 'g-hifz-a', start: [4, 40], trait: 'struggling', payer: 'overdue', hostel: true, absentee: true, admission: '2023-07-03' },
  { id: 'S-1007', name: 'Huzaifa Malik', gender: 'M', dob: '2012-05-25', groupId: 'g-hifz-a', start: [12, 1], trait: 'steady', payer: 'prompt', hostel: true, admission: '2022-04-05' },
  // Hifz Halqa B
  { id: 'S-1008', name: 'Muhammad Hamza Shaikh', gender: 'M', dob: '2012-10-11', groupId: 'g-hifz-b', start: [2, 200], trait: 'steady', payer: 'late', hostel: false, admission: '2023-04-10' },
  { id: 'S-1009', name: 'Owais Khan', gender: 'M', dob: '2012-02-17', groupId: 'g-hifz-b', start: [6, 50], trait: 'struggling', payer: 'overdue', hostel: true, absentee: true, admission: '2023-01-09' },
  { id: 'S-1010', name: 'Saad Hussain', gender: 'M', dob: '2011-06-03', groupId: 'g-hifz-b', start: [25, 1], trait: 'strong', payer: 'prompt', hostel: true, admission: '2020-04-15' },
  { id: 'S-1011', name: 'Rayyan Patel', gender: 'M', dob: '2012-08-28', groupId: 'g-hifz-b', start: [10, 1], trait: 'steady', payer: 'prompt', hostel: true, admission: '2026-09-28' },
  { id: 'S-1012', name: 'Ahmad Raza', gender: 'M', dob: '2012-04-09', groupId: 'g-hifz-b', start: [20, 1], trait: 'steady', payer: 'partial', hostel: true, admission: '2021-07-19' },
  { id: 'S-1013', name: 'Umar Farooq Pathan', gender: 'M', dob: '2011-09-14', groupId: 'g-hifz-b', start: [36, 1], trait: 'strong', payer: 'prompt', hostel: true, admission: '2020-04-15' },
  // Nazira Halqa A (Boys)
  { id: 'S-1014', name: 'Faizan Ali', gender: 'M', dob: '2015-02-02', groupId: 'g-nazira-a', start: [2, 1], trait: 'steady', payer: 'prompt', hostel: false, admission: '2025-04-07' },
  { id: 'S-1015', name: 'Arham Shaikh', gender: 'M', dob: '2014-12-12', groupId: 'g-nazira-a', start: [7, 1], trait: 'strong', payer: 'late', hostel: false, admission: '2024-04-08' },
  { id: 'S-1016', name: 'Ayaan Qureshi', gender: 'M', dob: '2015-06-06', groupId: 'g-nazira-a', start: [3, 1], trait: 'steady', payer: 'prompt', hostel: false, admission: '2025-04-07' },
  { id: 'S-1017', name: 'Hassan Javed', gender: 'M', dob: '2014-10-23', groupId: 'g-nazira-a', start: [2, 101], trait: 'struggling', payer: 'sponsored', hostel: false, admission: '2024-08-12' },
  { id: 'S-1018', name: 'Anas Mansoori', gender: 'M', dob: '2014-03-29', groupId: 'g-nazira-a', start: [16, 1], trait: 'steady', payer: 'partial', hostel: true, admission: '2023-04-10' },
  { id: 'S-1019', name: 'Yahya Chaudhry', gender: 'M', dob: '2014-07-07', groupId: 'g-nazira-a', start: [11, 1], trait: 'steady', payer: 'prompt', hostel: true, admission: '2026-10-05' },
  // Nazira Halqa B (Girls)
  { id: 'S-1020', name: 'Maryam Khan', gender: 'F', dob: '2015-08-19', groupId: 'g-nazira-b', start: [5, 1], trait: 'strong', payer: 'late', hostel: false, admission: '2024-04-08' },
  { id: 'S-1021', name: 'Fatima Zahra Shaikh', gender: 'F', dob: '2014-05-15', groupId: 'g-nazira-b', start: [4, 1], trait: 'steady', payer: 'prompt', hostel: false, admission: '2023-04-10' },
  { id: 'S-1022', name: 'Aisha Siddiqui', gender: 'F', dob: '2014-09-09', groupId: 'g-nazira-b', start: [18, 1], trait: 'steady', payer: 'prompt', hostel: false, admission: '2023-04-10' },
  { id: 'S-1023', name: 'Khadija Ansari', gender: 'F', dob: '2015-01-27', groupId: 'g-nazira-b', start: [2, 50], trait: 'struggling', payer: 'late', hostel: false, admission: '2025-04-07' },
  { id: 'S-1024', name: 'Zainab Qureshi', gender: 'F', dob: '2014-04-04', groupId: 'g-nazira-b', start: [24, 1], trait: 'strong', payer: 'prompt', hostel: false, admission: '2022-04-05' },
  // Noorani Qaida
  { id: 'S-1025', name: 'Muaz Shaikh', gender: 'M', dob: '2018-11-11', groupId: 'g-qaida', qaida: 8, trait: 'steady', payer: 'prompt', hostel: false, admission: '2025-04-07' },
  { id: 'S-1026', name: 'Hafsa Patel', gender: 'F', dob: '2018-06-20', groupId: 'g-qaida', qaida: 5, trait: 'strong', payer: 'prompt', hostel: false, admission: '2026-04-06' },
  { id: 'S-1027', name: 'Sufiyan Rizvi', gender: 'M', dob: '2019-01-08', groupId: 'g-qaida', qaida: 3, trait: 'struggling', payer: 'partial', hostel: false, admission: '2026-04-06' },
  { id: 'S-1028', name: 'Ruqayyah Mirza', gender: 'F', dob: '2018-03-03', groupId: 'g-qaida', qaida: 11, trait: 'steady', payer: 'late', hostel: false, admission: '2025-04-07' },
  // Alimiyyah Year 1 (Huffaz — daily Manzil revision)
  { id: 'S-1029', name: 'Ammar Syed', gender: 'M', dob: '2009-05-18', groupId: 'g-alim', start: [1, 1], trait: 'strong', payer: 'prompt', hostel: true, admission: '2026-04-06' },
  { id: 'S-1030', name: 'Hamdan Nadwi', gender: 'M', dob: '2009-09-01', groupId: 'g-alim', start: [1, 1], trait: 'steady', payer: 'prompt', hostel: true, admission: '2026-04-06' },
  { id: 'S-1031', name: 'Abdur Rehman Lodhi', gender: 'M', dob: '2008-12-24', groupId: 'g-alim', start: [1, 1], trait: 'steady', payer: 'late', hostel: true, admission: '2026-04-06' },
  { id: 'S-1032', name: 'Mohammad Arif Baig', gender: 'M', dob: '2009-02-13', groupId: 'g-alim', start: [1, 1], trait: 'struggling', payer: 'prompt', hostel: true, admission: '2026-04-06' },
]

export const CONCESSIONS = {
  'S-1020': { type: 'Sibling concession', percent: 10 },
  'S-1021': { type: 'Sibling concession', percent: 10 },
  'S-1025': { type: 'Sibling concession', percent: 10 },
  'S-1027': { type: 'Need-based concession', percent: 50 },
  'S-1017': { type: 'Full sponsorship (Yateem fund)', percent: 100 },
}

export const AREAS = ['Green Park', 'Old City', 'Station Road', 'Lake View', 'Market Street', 'Hill Colony', 'Riverside']
