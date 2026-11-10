import { z } from 'zod'

/**
 * The madrasa's own payroll rules. Nothing is deducted until an administrator turns it on,
 * so a new madrasa pays the configured salary and no rule is assumed on its behalf.
 */
export const PayrollRules = z.object({
  /** What one day of pay is worked out from. */
  dayBasis: z.enum(['CALENDAR', 'FIXED', 'WORKING']).default('CALENDAR'),
  fixedDays: z.number().int().min(1).max(31).default(30),
  deductAbsence: z.boolean().default(false),
  lateRule: z.object({
    enabled: z.boolean().default(false),
    /** Every this many late arrivals (or early departures, if counted) costs one day's pay. */
    countPerDay: z.number().int().min(1).max(31).default(3),
    countEarly: z.boolean().default(false),
  }).strict().prefault({}),
  rounding: z.enum(['NONE', 'RUPEE']).default('NONE'),
  /** The person who prepared a run cannot approve it. */
  requireSecondApprover: z.boolean().default(true),
}).strict()
export type PayrollRules = z.infer<typeof PayrollRules>

export interface ComponentInput { name: string; kind: 'EARNING' | 'DEDUCTION'; calc: 'FIXED' | 'PERCENT_OF_BASIC'; value: number }
export interface AttendanceFigures { absentDays: number; lateCount: number; earlyCount: number }
export interface SlipInput {
  basicMinor: number
  components: ComponentInput[]
  adjustments: { amountMinor: number; reason: string }[]
  attendance: AttendanceFigures
  /** No attendance deductions for this person (set on their salary). */
  exempt: boolean
  /** Days marked as paid by the reviewer: holidays, approved leave. */
  paidLeaveDays: number
  rules: PayrollRules
  calendarDays: number
  workingDays: number
}
export interface SlipLine { label: string; kind: 'EARNING' | 'DEDUCTION'; amountMinor: number }

export const daysBasis = (i: Pick<SlipInput, 'rules' | 'calendarDays' | 'workingDays'>) =>
  (i.rules.dayBasis === 'FIXED' ? i.rules.fixedDays : i.rules.dayBasis === 'WORKING' ? i.workingDays : i.calendarDays) || 1

/** Percent values are basis points (1050 = 10.5%); all money is integer paise. */
const componentAmount = (c: ComponentInput, basicMinor: number) => (c.calc === 'FIXED' ? c.value : Math.round((basicMinor * c.value) / 10_000))

export function computeSlip(i: SlipInput) {
  const lines: SlipLine[] = [{ label: 'Basic', kind: 'EARNING', amountMinor: i.basicMinor }]
  for (const c of i.components) {
    const amountMinor = componentAmount(c, i.basicMinor)
    if (amountMinor > 0) lines.push({ label: c.name, kind: c.kind, amountMinor })
  }
  const gross = lines.filter((l) => l.kind === 'EARNING').reduce((a, l) => a + l.amountMinor, 0)
  const basis = daysBasis(i)
  const dayCost = (days: number) => Math.round((gross * days) / basis)

  const absentDeductedDays = i.rules.deductAbsence && !i.exempt ? Math.max(0, i.attendance.absentDays - i.paidLeaveDays) : 0
  if (absentDeductedDays > 0) lines.push({ label: `Absent ${absentDeductedDays} day(s)`, kind: 'DEDUCTION', amountMinor: dayCost(absentDeductedDays) })

  const lateEvents = i.attendance.lateCount + (i.rules.lateRule.countEarly ? i.attendance.earlyCount : 0)
  const lateDeductedDays = i.rules.lateRule.enabled && !i.exempt ? Math.floor(lateEvents / i.rules.lateRule.countPerDay) : 0
  if (lateDeductedDays > 0) lines.push({ label: `Late or early ${lateEvents} time(s)`, kind: 'DEDUCTION', amountMinor: dayCost(lateDeductedDays) })

  for (const a of i.adjustments) lines.push({ label: `Adjustment: ${a.reason}`, kind: a.amountMinor >= 0 ? 'EARNING' : 'DEDUCTION', amountMinor: Math.abs(a.amountMinor) })

  const sum = (kind: SlipLine['kind']) => lines.filter((l) => l.kind === kind).reduce((a, l) => a + l.amountMinor, 0)
  let net = sum('EARNING') - sum('DEDUCTION')
  if (i.rules.rounding === 'RUPEE' && net % 100 !== 0) {
    const rounded = Math.round(net / 100) * 100
    lines.push({ label: 'Rounding', kind: rounded > net ? 'EARNING' : 'DEDUCTION', amountMinor: Math.abs(rounded - net) })
    net = rounded
  }
  return { lines, earningsMinor: sum('EARNING'), deductionsMinor: sum('DEDUCTION'), netMinor: net, absentDeductedDays, lateDeductedDays }
}

export const calendarDaysOf = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate()
}

export function workingDaysOf(month: string, weeklyOff: number) {
  const [y, m] = month.split('-').map(Number)
  let n = 0
  for (let d = 1; d <= calendarDaysOf(month); d++) if (new Date(Date.UTC(y!, m! - 1, d)).getUTCDay() !== weeklyOff) n++
  return n
}
