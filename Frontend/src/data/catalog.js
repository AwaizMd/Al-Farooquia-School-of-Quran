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

