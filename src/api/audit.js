import { get, post } from './client'

/** Put a browser-side export or report on the server's activity log (never blocks the user). */
export const logEvent = (action, entity, description) => post('/audit/events', { action, entity, ...(description ? { description } : {}) }).catch(() => {})

const LABEL = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.login_failed': 'Failed sign-in', 'student.admitted': 'Student added', 'student.updated': 'Student record updated',
  'student.deactivated': 'Student deactivated', 'student.concession_set': 'Concession changed', 'group.mentor_assigned': 'Mentor assigned', 'staff.created': 'Mentor added',
  'attendance.marked': 'Attendance marked', 'attendance.corrected': 'Attendance corrected', 'learning.recorded': 'Sabaq recorded', 'learning.edited': 'Sabaq record edited',
  'exam.scheduled': 'Examination scheduled', 'exam.results_saved': 'Assessment results updated', 'exam.published': 'Results published', 'exam.grading_changed': 'Grading scale updated',
  'fees.payment_recorded': 'Fee payment recorded', 'fees.online_payment_confirmed': 'Online payment confirmed', 'fees.invoices_issued': 'Invoices issued', 'fees.refund': 'Refund recorded',
  'fees.invoice_adjusted': 'Invoice adjusted', 'reminders.sent_manually': 'Fee reminder sent', 'hostel.assigned': 'Hostel bed assigned', 'hostel.transferred': 'Hostel transfer',
  'hostel.released': 'Hostel bed vacated', 'hostel.roll_call': 'Hostel roll call saved', 'library.added': 'Library resource added', 'settings.updated': 'Settings updated',
  'mfa.reset_by_admin': 'Two-step verification reset', 'user.created': 'Account created', 'export.csv': 'CSV exported', 'report.previewed': 'Report previewed',
}
const roleOf = (r) => (r || '').split(',')[0].toLowerCase()

/** The server's activity log in the shape the activity screens use. */
export async function loadAudit(students) {
  const byUuid = new Map(students.map((s) => [s.uuid, s.id]))
  const r = await get('/admin/audit-logs?pageSize=100')
  return r.items.map((a) => ({
    id: a.id, ts: a.at, actor: a.actorName, role: roleOf(a.actorRole), action: LABEL[a.action] || a.action, entity: a.entityType === 'student' ? 'Student' : (a.entityType || '').replace(/_/g, ' '),
    entityId: a.entityType === 'student' ? byUuid.get(a.entityId) : undefined, description: a.summary,
  }))
}
