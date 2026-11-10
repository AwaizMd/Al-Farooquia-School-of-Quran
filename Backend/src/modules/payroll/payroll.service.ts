import type { Request } from 'express'
import { AppError, conflict, notFound } from '../../common/errors.js'
import { institutionToday } from '../../common/clock.js'
import { prisma, type Tx } from '../../database/prisma.js'
import { lockRow } from '../../tenancy/locks.js'
import { madrasaProfile } from '../../tenancy/settings.js'
import { audit } from '../audit-logs/audit.service.js'
import { monthlySummary } from '../staff-attendance/attendance.service.js'
import { isoDate, toDate } from '../students/students.service.js'
import { calendarDaysOf, computeSlip, PayrollRules, workingDaysOf, type ComponentInput, type SlipLine } from './calc.js'

const lastDayOf = (month: string) => `${month}-${String(calendarDaysOf(month)).padStart(2, '0')}`

// ---------- Rules and pay components ----------

export async function getRules() {
  const row = await prisma.payrollConfig.findFirst()
  return PayrollRules.parse(row?.rules ?? {})
}

export async function saveRules(req: Request, rules: PayrollRules) {
  const existing = await prisma.payrollConfig.findFirst({ select: { id: true } })
  if (existing) await prisma.payrollConfig.update({ where: { id: existing.id }, data: { rules } })
  else await prisma.payrollConfig.create({ data: { rules } as never })
  await audit({ action: 'payroll.rules_changed', summary: 'Payroll rules changed', entityType: 'payroll', metadata: { rules } }, req)
  return rules
}

export const listComponents = async () => ({ items: await prisma.payComponent.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] }) })

interface ComponentBody { name: string; kind: 'EARNING' | 'DEDUCTION'; calc: 'FIXED' | 'PERCENT_OF_BASIC'; value: number; appliesToAll: boolean; active?: boolean | undefined }

export async function createComponent(req: Request, input: ComponentBody) {
  try {
    const c = await prisma.payComponent.create({ data: input as never })
    await audit({ action: 'payroll.component_created', summary: `Pay component "${input.name}" created`, entityType: 'payroll', entityId: (c as { id: string }).id }, req)
    return c
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('DUPLICATE_COMPONENT', 'A pay component with this name already exists.')
    throw err
  }
}

export async function updateComponent(req: Request, id: string, patch: Partial<ComponentBody>) {
  if (!(await prisma.payComponent.findUnique({ where: { id }, select: { id: true } }))) throw notFound()
  const c = await prisma.payComponent.update({ where: { id }, data: patch as never })
  await audit({ action: 'payroll.component_changed', summary: `Pay component "${c.name}" changed: ${Object.keys(patch).join(', ')}`, entityType: 'payroll', entityId: id }, req)
  return c
}

// ---------- Salaries (a new row for every change; old rows are never edited) ----------

const salaryView = (s: { id: string; staffId: string; effectiveFrom: Date; basicMinor: number; exemptFromDeductions: boolean; componentValues: unknown; note: string | null; createdAt: Date }) => ({
  id: s.id, staffId: s.staffId, effectiveFrom: isoDate(s.effectiveFrom), basicMinor: s.basicMinor, exemptFromDeductions: s.exemptFromDeductions, componentValues: s.componentValues, note: s.note, createdAt: s.createdAt,
})

export async function listSalaries() {
  const [staff, salaries] = await Promise.all([
    prisma.staffProfile.findMany({ where: { status: 'ACTIVE' }, orderBy: { displayName: 'asc' }, select: { id: true, code: true, displayName: true, title: true } }),
    prisma.staffSalary.findMany({ orderBy: { effectiveFrom: 'desc' } }),
  ])
  return { items: staff.map((s) => { const current = salaries.find((x) => x.staffId === s.id); return { staff: s, salary: current ? salaryView(current) : null } }) }
}

export async function salaryHistory(staffId: string) {
  if (!(await prisma.staffProfile.findUnique({ where: { id: staffId }, select: { id: true } }))) throw notFound()
  return { items: (await prisma.staffSalary.findMany({ where: { staffId }, orderBy: { effectiveFrom: 'desc' } })).map(salaryView) }
}

export async function setSalary(req: Request, staffId: string, input: { effectiveFrom: string; basicMinor: number; exemptFromDeductions: boolean; componentValues: { componentId: string; value: number }[]; note?: string | undefined }) {
  const staff = await prisma.staffProfile.findUnique({ where: { id: staffId }, select: { id: true, displayName: true } })
  if (!staff) throw notFound()
  const known = await prisma.payComponent.count({ where: { id: { in: input.componentValues.map((c) => c.componentId) } } })
  if (known !== new Set(input.componentValues.map((c) => c.componentId)).size) throw notFound()
  try {
    const s = await prisma.staffSalary.create({ data: { staffId, effectiveFrom: toDate(input.effectiveFrom), basicMinor: input.basicMinor, exemptFromDeductions: input.exemptFromDeductions, componentValues: input.componentValues, note: input.note ?? null, createdById: req.auth!.user.id } as never })
    // The amount stays out of the audit text: the activity log is read by more people than payroll is.
    await audit({ action: 'payroll.salary_set', summary: `Salary of ${staff.displayName} set from ${input.effectiveFrom}`, entityType: 'staff', entityId: staffId }, req)
    return salaryView(s as never)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('SALARY_EXISTS', 'This person already has a salary starting on that date. Choose another date.')
    throw err
  }
}

// ---------- Adjustments: the only way to change money after approval ----------

export async function listAdjustments() {
  const rows = await prisma.payrollAdjustment.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { staff: { select: { displayName: true, code: true } } } })
  return { items: rows.map((a) => ({ id: a.id, staffId: a.staffId, staff: a.staff, amountMinor: a.amountMinor, reason: a.reason, appliedRunId: a.appliedRunId, createdAt: a.createdAt })) }
}

export async function addAdjustment(req: Request, input: { staffId: string; amountMinor: number; reason: string }) {
  const staff = await prisma.staffProfile.findUnique({ where: { id: input.staffId }, select: { displayName: true } })
  if (!staff) throw notFound()
  const a = await prisma.payrollAdjustment.create({ data: { staffId: input.staffId, amountMinor: input.amountMinor, reason: input.reason, createdById: req.auth!.user.id } as never })
  await audit({ action: 'payroll.adjustment_added', summary: `Payroll adjustment for ${staff.displayName}: ${input.reason}`, entityType: 'staff', entityId: input.staffId }, req)
  return a
}

// ---------- Runs ----------

interface SlipRow { staffId: string; staffName: string; staffCode: string; title: string; basicMinor: number; earningsMinor: number; deductionsMinor: number; netMinor: number; lines: SlipLine[]; attendance: Record<string, number>; paidLeaveDays: number; note: string | null }

/** Payslips worked out from today's records. Reviewer's paid days and notes carry over. */
async function freshSlips(month: string, keep: Map<string, { paidLeaveDays: number; note: string | null }>) {
  const [rules, profile, summary, salaries, components, adjustments] = await Promise.all([
    getRules(), madrasaProfile(), monthlySummary(month),
    prisma.staffSalary.findMany({ where: { effectiveFrom: { lte: toDate(lastDayOf(month)) } }, orderBy: { effectiveFrom: 'desc' } }),
    prisma.payComponent.findMany({ where: { active: true } }),
    prisma.payrollAdjustment.findMany({ where: { appliedRunId: null } }),
  ])
  const calendarDays = calendarDaysOf(month)
  const workingDays = workingDaysOf(month, profile.weeklyOff)
  const noSalary: string[] = []
  const warnings: string[] = []
  const slips: SlipRow[] = []
  for (const row of summary.items) {
    const salary = salaries.find((s) => s.staffId === row.staff.id)
    if (!salary) { noSalary.push(row.staff.displayName); continue }
    if (row.openSessions || row.missedCheckouts) warnings.push(`${row.staff.displayName}: ${row.openSessions + row.missedCheckouts} attendance record(s) without a check-out`)
    const overrides = new Map((salary.componentValues as { componentId: string; value: number }[]).map((c) => [c.componentId, c.value]))
    const applied: ComponentInput[] = components.filter((c) => c.appliesToAll || overrides.has(c.id)).map((c) => ({ name: c.name, kind: c.kind, calc: c.calc, value: overrides.get(c.id) ?? c.value }))
    const kept = keep.get(row.staff.id)
    const paidLeaveDays = kept?.paidLeaveDays ?? 0
    const attendance = { absentDays: row.absentDays, lateCount: row.lateCount, earlyCount: row.earlyCount }
    const r = computeSlip({ basicMinor: salary.basicMinor, components: applied, adjustments: adjustments.filter((a) => a.staffId === row.staff.id), attendance, exempt: salary.exemptFromDeductions, paidLeaveDays, rules, calendarDays, workingDays })
    slips.push({
      staffId: row.staff.id, staffName: row.staff.displayName, staffCode: row.staff.code, title: row.staff.title, basicMinor: salary.basicMinor, earningsMinor: r.earningsMinor, deductionsMinor: r.deductionsMinor, netMinor: r.netMinor,
      lines: r.lines, attendance: { ...attendance, expectedDays: row.expectedDays, presentDays: row.presentDays, absentDeductedDays: r.absentDeductedDays, lateDeductedDays: r.lateDeductedDays }, paidLeaveDays, note: kept?.note ?? null,
    })
  }
  return { rules, slips, noSalary, warnings, adjustmentIds: adjustments.filter((a) => slips.some((s) => s.staffId === a.staffId)).map((a) => a.id) }
}

const RUN_INCLUDE = { payslips: { orderBy: { staffName: 'asc' } } } as const
type RunRow = NonNullable<Awaited<ReturnType<typeof findRun>>>
const findRun = (id: string) => prisma.payrollRun.findUnique({ where: { id }, include: RUN_INCLUDE })
const totalNet = (slips: { netMinor: number }[]) => slips.reduce((a, s) => a + s.netMinor, 0)
const runView = (r: RunRow, extra: object = {}) => ({
  id: r.id, month: r.month, status: r.status, preparedById: r.preparedById, approvedById: r.approvedById, approvedAt: r.approvedAt, paidOn: isoDate(r.paidOn), rules: r.rules, totalNetMinor: totalNet(r.payslips),
  payslips: r.payslips.map((s) => ({ id: s.id, staffId: s.staffId, staffName: s.staffName, staffCode: s.staffCode, title: s.title, basicMinor: s.basicMinor, earningsMinor: s.earningsMinor, deductionsMinor: s.deductionsMinor, netMinor: s.netMinor, lines: s.lines, attendance: s.attendance, paidLeaveDays: s.paidLeaveDays, note: s.note })),
  ...extra,
})

export async function listRuns() {
  const rows = await prisma.payrollRun.findMany({ orderBy: { month: 'desc' }, include: { payslips: { select: { netMinor: true } } } })
  return { items: rows.map((r) => ({ id: r.id, month: r.month, status: r.status, approvedAt: r.approvedAt, paidOn: isoDate(r.paidOn), staffCount: r.payslips.length, totalNetMinor: totalNet(r.payslips) })) }
}

export async function getRun(id: string) {
  const r = await findRun(id)
  if (!r) throw notFound()
  if (r.status !== 'DRAFT') return runView(r, { noSalary: [], warnings: [] })
  const fresh = await freshSlips(r.month, new Map(r.payslips.map((s) => [s.staffId, s])))
  return runView(r, { noSalary: fresh.noSalary, warnings: fresh.warnings, stale: isStale(r, fresh) })
}

const isStale = (r: RunRow, fresh: Awaited<ReturnType<typeof freshSlips>>) => {
  const stored = new Map(r.payslips.map((s) => [s.staffId, s.netMinor]))
  return stored.size !== fresh.slips.length || fresh.slips.some((s) => stored.get(s.staffId) !== s.netMinor)
}

export async function createRun(req: Request, month: string) {
  const fresh = await freshSlips(month, new Map())
  if (!fresh.slips.length) throw conflict('NO_SALARIES', 'Nobody has a salary for this month yet. Add salaries first.')
  try {
    const run = await prisma.payrollRun.create({ data: { month, preparedById: req.auth!.user.id, rules: fresh.rules, payslips: { create: fresh.slips } } as never })
    await audit({ action: 'payroll.run_created', summary: `Payroll draft for ${month} created for ${fresh.slips.length} staff`, entityType: 'payroll', entityId: (run as { id: string }).id }, req)
    return getRun((run as { id: string }).id)
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw conflict('RUN_EXISTS', 'A payroll for this month already exists.')
    throw err
  }
}

async function lockedDraft(tx: Tx, id: string) {
  if (!(await lockRow(tx, 'payroll_runs', id))) throw notFound()
  const r = await tx.payrollRun.findUniqueOrThrow({ where: { id }, include: RUN_INCLUDE })
  if (r.status !== 'DRAFT') throw conflict('RUN_NOT_DRAFT', 'This payroll is approved and cannot be changed. Add an adjustment for next month instead.')
  return r
}

export async function recalculate(req: Request, id: string) {
  const r = await findRun(id)
  if (!r) throw notFound()
  const fresh = await freshSlips(r.month, new Map(r.payslips.map((s) => [s.staffId, s])))
  await prisma.$transaction(async (tx) => {
    await lockedDraft(tx, id)
    await tx.payslip.deleteMany({ where: { runId: id } })
    await tx.payrollRun.update({ where: { id }, data: { rules: fresh.rules, preparedById: req.auth!.user.id, payslips: { create: fresh.slips } } as never })
    await audit({ action: 'payroll.run_recalculated', summary: `Payroll draft for ${r.month} recalculated`, entityType: 'payroll', entityId: id }, req, tx)
  })
  return getRun(id)
}

export async function reviewSlip(req: Request, id: string, slipId: string, input: { paidLeaveDays: number; note?: string | null | undefined }) {
  const r = await findRun(id)
  const slip = r?.payslips.find((s) => s.id === slipId)
  if (!r || !slip) throw notFound()
  const att = slip.attendance as { absentDays: number }
  if (input.paidLeaveDays > att.absentDays) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'paidLeaveDays', message: 'Paid days cannot be more than the days absent.' }])
  const keep = new Map(r.payslips.map((s) => [s.staffId, { paidLeaveDays: s.paidLeaveDays, note: s.note }]))
  keep.set(slip.staffId, { paidLeaveDays: input.paidLeaveDays, note: input.note ?? null })
  const fresh = await freshSlips(r.month, keep)
  await prisma.$transaction(async (tx) => {
    await lockedDraft(tx, id)
    await tx.payslip.deleteMany({ where: { runId: id } })
    await tx.payrollRun.update({ where: { id }, data: { rules: fresh.rules, payslips: { create: fresh.slips } } as never })
    await audit({ action: 'payroll.payslip_reviewed', summary: `Payslip of ${slip.staffName} for ${r.month}: ${input.paidLeaveDays} absent day(s) marked paid`, entityType: 'payroll', entityId: id, metadata: { note: input.note ?? null } }, req, tx)
  })
  return getRun(id)
}

export async function discardRun(req: Request, id: string) {
  await prisma.$transaction(async (tx) => {
    const r = await lockedDraft(tx, id)
    await tx.payslip.deleteMany({ where: { runId: id } })
    await tx.payrollRun.delete({ where: { id } })
    await audit({ action: 'payroll.run_discarded', summary: `Payroll draft for ${r.month} discarded`, entityType: 'payroll', entityId: id }, req, tx)
  })
}

export async function approveRun(req: Request, id: string) {
  const today = await institutionToday()
  const r = await findRun(id)
  if (!r) throw notFound()
  if (today < lastDayOf(r.month)) throw conflict('MONTH_NOT_OVER', 'A month can be approved from its last day onwards, once its attendance is complete.')
  const fresh = await freshSlips(r.month, new Map(r.payslips.map((s) => [s.staffId, s])))
  await prisma.$transaction(async (tx) => {
    const draft = await lockedDraft(tx, id)
    if (fresh.rules.requireSecondApprover && draft.preparedById === req.auth!.user.id) throw conflict('SAME_PERSON', 'The person who prepared this payroll cannot approve it. Ask another authorised person, or change this rule in the payroll rules.')
    // Attendance, salaries or rules changed since the figures were reviewed: never approve unseen numbers.
    if (isStale(draft, fresh)) throw conflict('RUN_STALE', 'The figures have changed since this draft was worked out. Recalculate and review it again.')
    const negative = draft.payslips.find((s) => s.netMinor < 0)
    if (negative) throw conflict('NET_NEGATIVE', `The net pay of ${negative.staffName} is below zero. Review the deductions first.`)
    await tx.payrollAdjustment.updateMany({ where: { id: { in: fresh.adjustmentIds } }, data: { appliedRunId: id } })
    await tx.payrollRun.update({ where: { id }, data: { status: 'APPROVED', approvedById: req.auth!.user.id, approvedAt: new Date() } })
    await audit({ action: 'payroll.run_approved', summary: `Payroll for ${r.month} approved for ${draft.payslips.length} staff`, entityType: 'payroll', entityId: id }, req, tx)
  })
  return getRun(id)
}

/** Records that the money was paid. The app itself moves no money and creates no bank file. */
export async function markPaid(req: Request, id: string, paidOn: string) {
  const today = await institutionToday()
  if (paidOn > today) throw new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', [{ path: 'paidOn', message: 'The date cannot be in the future.' }])
  await prisma.$transaction(async (tx) => {
    if (!(await lockRow(tx, 'payroll_runs', id))) throw notFound()
    const r = await tx.payrollRun.findUniqueOrThrow({ where: { id } })
    if (r.status !== 'APPROVED') throw conflict('RUN_NOT_APPROVED', 'Only an approved payroll that has not been paid can be marked as paid.')
    await tx.payrollRun.update({ where: { id }, data: { status: 'PAID', paidOn: toDate(paidOn) } })
    await audit({ action: 'payroll.run_paid', summary: `Payroll for ${r.month} marked as paid on ${paidOn}`, entityType: 'payroll', entityId: id }, req, tx)
  })
  return getRun(id)
}

/** A staff member's own payslips, once approved. Drafts are never shown. */
export async function myPayslips(req: Request) {
  const staff = await prisma.staffProfile.findFirst({ where: { userId: req.auth!.user.id }, select: { id: true } })
  if (!staff) return { items: [] }
  const rows = await prisma.payslip.findMany({ where: { staffId: staff.id, run: { status: { not: 'DRAFT' } } }, include: { run: { select: { month: true, status: true, paidOn: true } } }, orderBy: { run: { month: 'desc' } } })
  return { items: rows.map((s) => ({ id: s.id, month: s.run.month, status: s.run.status, paidOn: isoDate(s.run.paidOn), earningsMinor: s.earningsMinor, deductionsMinor: s.deductionsMinor, netMinor: s.netMinor, lines: s.lines })) }
}
