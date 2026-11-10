import { Router } from 'express'
import { z } from 'zod'
import { doc } from '../../docs/route.js'
import { requireAuth, requirePermission, requireRecentAuth } from '../../middleware/auth.js'
import { IsoDate, body } from '../../middleware/validate.js'
import { PayrollRules } from './calc.js'
import * as payroll from './payroll.service.js'

export const payrollRouter = Router()
const T = 'Payroll'
const Id = z.string().uuid()
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-11.')
const MAX_MINOR = 100_000_000
const Reason = z.string().trim().min(5).max(300)

// ---------- Rules and components ----------

doc('get', '/payroll/rules', T, 'This madrasa’s payroll rules', { auth: 'payroll.read' })
payrollRouter.get('/payroll/rules', requirePermission('payroll.read'), async (_req, res) => {
  res.json(await payroll.getRules())
})
doc('put', '/payroll/rules', T, 'Change the payroll rules', { body: PayrollRules, auth: 'payroll.manage + recent re-authentication' })
payrollRouter.put('/payroll/rules', requirePermission('payroll.manage'), requireRecentAuth(), async (req, res) => {
  res.json(await payroll.saveRules(req, body(req, PayrollRules)))
})

const ComponentFields = {
  name: z.string().trim().min(2).max(60),
  kind: z.enum(['EARNING', 'DEDUCTION']),
  calc: z.enum(['FIXED', 'PERCENT_OF_BASIC']),
  /** Paise when fixed; basis points when a percent (1050 = 10.5%). */
  value: z.number().int().min(0).max(MAX_MINOR),
  appliesToAll: z.boolean().default(false),
}
const percentOk = (x: { calc?: string | undefined; value?: number | undefined }) => x.calc !== 'PERCENT_OF_BASIC' || x.value === undefined || x.value <= 10_000
const percentMsg = { path: ['value'], message: 'A percentage cannot be more than 100.' }
const NewComponent = z.object(ComponentFields).strict().refine(percentOk, percentMsg)
const EditComponent = z.object({ ...ComponentFields, appliesToAll: z.boolean(), active: z.boolean() }).partial().strict().refine(percentOk, percentMsg)
doc('get', '/payroll/components', T, 'Earnings and deductions the madrasa has defined', { auth: 'payroll.read' })
payrollRouter.get('/payroll/components', requirePermission('payroll.read'), async (_req, res) => {
  res.json(await payroll.listComponents())
})
doc('post', '/payroll/components', T, 'Define an earning or deduction', { body: NewComponent, auth: 'payroll.manage' })
payrollRouter.post('/payroll/components', requirePermission('payroll.manage'), async (req, res) => {
  res.status(201).json(await payroll.createComponent(req, body(req, NewComponent)))
})
doc('patch', '/payroll/components/:id', T, 'Change an earning or deduction', { body: EditComponent, auth: 'payroll.manage' })
payrollRouter.patch('/payroll/components/:id', requirePermission('payroll.manage'), async (req, res) => {
  res.json(await payroll.updateComponent(req, Id.parse(req.params.id), body(req, EditComponent)))
})

// ---------- Salaries ----------

const Salary = z.object({
  effectiveFrom: IsoDate,
  basicMinor: z.number().int().min(0).max(MAX_MINOR),
  exemptFromDeductions: z.boolean().default(false),
  componentValues: z.array(z.object({ componentId: Id, value: z.number().int().min(0).max(MAX_MINOR) }).strict()).max(50).default([]),
  note: z.string().trim().max(300).optional(),
}).strict()
doc('get', '/payroll/salaries', T, 'Current salary of every active staff member', { auth: 'payroll.read' })
payrollRouter.get('/payroll/salaries', requirePermission('payroll.read'), async (_req, res) => {
  res.json(await payroll.listSalaries())
})
doc('get', '/payroll/staff/:id/salaries', T, 'A person’s salary history', { auth: 'payroll.read' })
payrollRouter.get('/payroll/staff/:id/salaries', requirePermission('payroll.read'), async (req, res) => {
  res.json(await payroll.salaryHistory(Id.parse(req.params.id)))
})
doc('post', '/payroll/staff/:id/salaries', T, 'Set a salary from a date (history is kept)', { body: Salary, auth: 'payroll.manage + recent re-authentication' })
payrollRouter.post('/payroll/staff/:id/salaries', requirePermission('payroll.manage'), requireRecentAuth(), async (req, res) => {
  res.status(201).json(await payroll.setSalary(req, Id.parse(req.params.id), body(req, Salary)))
})

// ---------- Adjustments ----------

const Adjustment = z.object({ staffId: Id, amountMinor: z.number().int().min(-MAX_MINOR).max(MAX_MINOR).refine((n) => n !== 0, 'The amount cannot be zero.'), reason: Reason }).strict()
doc('get', '/payroll/adjustments', T, 'Adjustments, applied and waiting', { auth: 'payroll.read' })
payrollRouter.get('/payroll/adjustments', requirePermission('payroll.read'), async (_req, res) => {
  res.json(await payroll.listAdjustments())
})
doc('post', '/payroll/adjustments', T, 'Add or take away an amount in the next payroll', { body: Adjustment, auth: 'payroll.manage + recent re-authentication' })
payrollRouter.post('/payroll/adjustments', requirePermission('payroll.manage'), requireRecentAuth(), async (req, res) => {
  res.status(201).json(await payroll.addAdjustment(req, body(req, Adjustment)))
})

// ---------- Runs ----------

const NewRun = z.object({ month: Month }).strict()
const Review = z.object({ paidLeaveDays: z.number().int().min(0).max(31), note: z.string().trim().max(300).nullable().optional() }).strict()
const Paid = z.object({ paidOn: IsoDate }).strict()
doc('get', '/payroll/runs', T, 'Payroll months', { auth: 'payroll.read' })
payrollRouter.get('/payroll/runs', requirePermission('payroll.read'), async (_req, res) => {
  res.json(await payroll.listRuns())
})
doc('post', '/payroll/runs', T, 'Work out a draft for a month', { body: NewRun, auth: 'payroll.manage' })
payrollRouter.post('/payroll/runs', requirePermission('payroll.manage'), async (req, res) => {
  res.status(201).json(await payroll.createRun(req, body(req, NewRun).month))
})
doc('get', '/payroll/runs/:id', T, 'One month with its payslips', { auth: 'payroll.read' })
payrollRouter.get('/payroll/runs/:id', requirePermission('payroll.read'), async (req, res) => {
  res.json(await payroll.getRun(Id.parse(req.params.id)))
})
doc('post', '/payroll/runs/:id/recalculate', T, 'Work a draft out again from the latest records', { auth: 'payroll.manage' })
payrollRouter.post('/payroll/runs/:id/recalculate', requirePermission('payroll.manage'), async (req, res) => {
  res.json(await payroll.recalculate(req, Id.parse(req.params.id)))
})
doc('patch', '/payroll/runs/:id/payslips/:slipId', T, 'Mark absent days as paid (holidays, approved leave)', { body: Review, auth: 'payroll.manage' })
payrollRouter.patch('/payroll/runs/:id/payslips/:slipId', requirePermission('payroll.manage'), async (req, res) => {
  res.json(await payroll.reviewSlip(req, Id.parse(req.params.id), Id.parse(req.params.slipId), body(req, Review)))
})
doc('delete', '/payroll/runs/:id', T, 'Discard a draft', { auth: 'payroll.manage' })
payrollRouter.delete('/payroll/runs/:id', requirePermission('payroll.manage'), async (req, res) => {
  await payroll.discardRun(req, Id.parse(req.params.id))
  res.status(204).end()
})
doc('post', '/payroll/runs/:id/approve', T, 'Approve a draft', { auth: 'payroll.approve + recent re-authentication' })
payrollRouter.post('/payroll/runs/:id/approve', requirePermission('payroll.approve'), requireRecentAuth(), async (req, res) => {
  res.json(await payroll.approveRun(req, Id.parse(req.params.id)))
})
doc('post', '/payroll/runs/:id/paid', T, 'Record that an approved payroll was paid', { body: Paid, auth: 'payroll.approve + recent re-authentication' })
payrollRouter.post('/payroll/runs/:id/paid', requirePermission('payroll.approve'), requireRecentAuth(), async (req, res) => {
  res.json(await payroll.markPaid(req, Id.parse(req.params.id), body(req, Paid).paidOn))
})

doc('get', '/payroll/me', T, 'My approved payslips')
payrollRouter.get('/payroll/me', requireAuth, async (req, res) => {
  res.json(await payroll.myPayslips(req))
})
