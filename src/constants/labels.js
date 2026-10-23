export const ROLE_LABELS = {
  admin: 'Admin',
  mentor: 'Mentor',
  student: 'Student',
  parent: 'Parent',
}

export const TRACKS = {
  hifz: { label: 'Hifz', long: 'Hifz (Memorisation)' },
  nazira: { label: 'Nazira', long: 'Nazira (Reading)' },
  qaida: { label: 'Qaida', long: 'Noorani Qaida (Foundation)' },
  alim: { label: 'Alimiyyah', long: 'Alimiyyah / Islamic Studies' },
}

// Sabaq record categories. `tracks` lists which learning tracks normally use it.
export const SABAQ_CATEGORIES = {
  sabaq: { label: 'Hifz · Sabaq', short: 'Sabaq', hint: 'New lesson memorised today', tracks: ['hifz'], usesAyah: true },
  sabqi: { label: 'Hifz · Sabqi', short: 'Sabqi', hint: 'Revision of recent lessons', tracks: ['hifz'], usesAyah: true },
  manzil: { label: 'Manzil', short: 'Manzil', hint: 'Revision of older memorised portions', tracks: ['hifz', 'alim'], usesAyah: true },
  nazira: { label: 'Nazira', short: 'Nazira', hint: 'Reading practice from the Mushaf', tracks: ['nazira', 'alim'], usesAyah: true },
  qaida: { label: 'Noorani Qaida', short: 'Qaida', hint: 'Foundation lesson (letters & joining)', tracks: ['qaida'], usesAyah: false },
}

export const RATINGS = {
  5: { label: 'Excellent', short: 'Excellent', tone: 'green' },
  4: { label: 'Very Good', short: 'V. good', tone: 'green' },
  3: { label: 'Good', short: 'Good', tone: 'gold' },
  2: { label: 'Needs Improvement', short: 'Needs work', tone: 'amber' },
  1: { label: 'Weak', short: 'Weak', tone: 'red' },
}

export const TAJWEED = {
  good: { label: 'Rules applied well', tone: 'green' },
  fair: { label: 'Minor slips', tone: 'gold' },
  weak: { label: 'Needs focused work', tone: 'red' },
}

export const PREV_REVISION = {
  done: 'Revised fully',
  partial: 'Partly revised',
  not: 'Not revised',
}

export const TARGET_STATUS = {
  met: { label: 'Target met', tone: 'green' },
  partial: { label: 'Partly met', tone: 'amber' },
  missed: { label: 'Target missed', tone: 'red' },
}

export const ATTENDANCE = {
  present: { label: 'Present', short: 'P', tone: 'green' },
  late: { label: 'Late', short: 'L', tone: 'amber' },
  absent: { label: 'Absent', short: 'A', tone: 'red' },
  excused: { label: 'Excused', short: 'E', tone: 'blue' },
}

export const LEARNING_STATUS = {
  'on-track': { label: 'On track', tone: 'green' },
  revision: { label: 'Needs revision', tone: 'amber' },
  attention: { label: 'Needs attention', tone: 'red' },
  none: { label: 'No recent record', tone: 'neutral' },
}

export const FEE_STATUS = {
  paid: { label: 'Paid', tone: 'green' },
  partial: { label: 'Part paid', tone: 'amber' },
  due: { label: 'Due', tone: 'gold' },
  overdue: { label: 'Overdue', tone: 'red' },
  waived: { label: 'Sponsored', tone: 'blue' },
}

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Online (Demo)']

export const RESOURCE_CATEGORIES = ['Hifz', 'Nazira', 'Tajweed', 'Arabic', 'Islamic Studies', 'General Learning']
export const RESOURCE_TYPES = ['PDF Book', 'Study Notes', 'Tajweed Guide', 'Worksheet', 'Audio Guide']
