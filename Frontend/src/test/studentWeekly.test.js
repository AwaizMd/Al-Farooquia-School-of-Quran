import { describe, expect, it } from 'vitest'
import { studentWeekly } from '../services/selectors'

const lesson = (date, category, safah, performance) => ({ studentId: 'S-1', date, createdAt: date, category, safah, performance })
const state = { attendance: { '2026-11-09': { 'S-1': 'present' }, '2026-11-08': { 'S-1': 'late' }, '2026-11-02': { 'S-1': 'absent' }, '2026-08-01': { 'S-1': 'present' }, '2026-11-07': { 'S-2': 'absent' } } }
const idx = { recordsByStudent: { 'S-1': [lesson('2026-11-09', 'sabaq', 0.5, 4), lesson('2026-11-08', 'sabqi', 1, 2), lesson('2026-11-01', 'qaida', null, 3), lesson('2026-08-01', 'sabaq', 5, 5)] } }

describe('student overview charts', () => {
  const weeks = studentWeekly(state, idx, 'S-1', '2026-11-09')
  it('covers 8 weeks ending today, oldest first', () => {
    expect(weeks).toHaveLength(8)
    expect(weeks.at(-1)).toMatchObject({ from: '2026-11-03', to: '2026-11-09' })
    expect(weeks[0].from).toBe('2026-09-15')
  })
  it('counts attendance days by status, for this student only, inside the window only', () => {
    expect(weeks.at(-1)).toMatchObject({ present: 1, late: 1, absent: 0 })
    expect(weeks.at(-2).absent).toBe(1)
    expect(weeks.reduce((a, w) => a + w.present + w.late + w.absent + w.excused, 0)).toBe(3)
  })
  it('adds safah by lesson type, counts Qaida as lessons, and averages the rating', () => {
    expect(weeks.at(-1)).toMatchObject({ sabaq: 0.5, sabqi: 1, rating: 3 })
    expect(weeks.at(-2)).toMatchObject({ qaida: 1, rating: 3 })
    expect(weeks[0].rating).toBeNull() // no lessons that week: a gap, not a zero
  })
})
