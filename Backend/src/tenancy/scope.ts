import { Prisma } from '../generated/prisma/client.js'
import { tenant } from './context.js'

/**
 * Models whose rows belong to one madrasa. Every query on them is filtered to the
 * current tenant context, and a query without a context throws, so a module can
 * never forget the scope. Keep in step with the "madrasaId" columns in the schema.
 */
export const ROOT_MODELS = new Set<string>([
  'Group', 'StaffProfile', 'Student', 'GradingScale', 'Exam', 'FeePlan', 'Receipt', 'ReceiptSequence', 'HostelRoom',
  'ReminderRule', 'MessageTemplate', 'ScheduledReportConfig', 'ReportRun', 'PaymentSettings',
])
/** Child tables: a database trigger copies "madrasaId" from the parent row (and rejects a mismatch). */
export const CHILD_MODELS = new Set<string>([
  'GroupMentorAssignment', 'StudentGuardian', 'GroupEnrollment', 'AttendanceSession', 'AttendanceRecord', 'AttendanceCorrection', 'LearningRecord',
  'LearningRecordRevision', 'GradeBand', 'ExamGroup', 'ExamSubject', 'ExamResult', 'ExamMark', 'Invoice', 'Payment', 'PaymentAllocation', 'FeeAdjustment',
  'Refund', 'RefundAllocation', 'Concession', 'HostelBed', 'BedAssignment', 'HostelRollEntry', 'ManualPaymentSubmission',
])
export const isScoped = (model: string) => ROOT_MODELS.has(model) || CHILD_MODELS.has(model)

const READ_LIKE = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany'])

export class ScopeError extends Error {}

type Data = Record<string, unknown>

function stamp(model: string, data: Data, active: string | null): Data {
  if (active === null) {
    // No single active madrasa (a parent reading across their children's madrasas):
    // child rows still get the parent's madrasa from the trigger; root rows cannot be placed.
    if (CHILD_MODELS.has(model)) return data
    throw new ScopeError(`Creating ${model} needs an active madrasa`)
  }
  if (data.madrasaId !== undefined && data.madrasaId !== active) throw new ScopeError(`${model} belongs to another madrasa`)
  return { ...data, madrasaId: active }
}

export const madrasaScope = Prisma.defineExtension({
  name: 'madrasa-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!isScoped(model)) return query(args)
        const t = tenant()
        if (!t) throw new ScopeError(`${model}.${operation} outside a madrasa context`)
        if (t.org) return query(args)
        const a = (args ?? {}) as Data
        const filter = t.ids.length === 1 ? t.ids[0] : { in: [...t.ids] }
        if (READ_LIKE.has(operation)) {
          a.where = { ...((a.where as Data | undefined) ?? {}), madrasaId: filter }
        } else if (operation === 'create') {
          a.data = stamp(model, a.data as Data, t.active)
        } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
          a.data = Array.isArray(a.data) ? (a.data as Data[]).map((d) => stamp(model, d, t.active)) : stamp(model, a.data as Data, t.active)
        } else if (operation === 'upsert') {
          a.where = { ...(a.where as Data), madrasaId: filter }
          a.create = stamp(model, a.create as Data, t.active)
        } else {
          throw new ScopeError(`${model}.${operation} is not supported on madrasa-scoped models`)
        }
        return query(a as typeof args)
      },
    },
  },
})
