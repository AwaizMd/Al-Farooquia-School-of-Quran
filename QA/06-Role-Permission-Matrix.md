# Role and permission matrix

The authoritative list is `Backend/src/modules/auth/permissions.ts`, explained in [ROLES.md](../Backend/docs/ROLES.md). What each role actually received at sign-in during testing:

| Role | Permissions held |
|---|---|
| superAdmin | `org.manage` `users.read` `users.manage` `mfa.reset` `security.manage` `audit.read` `settings.manage` `students.read` `students.write` `guardians.read` `staff.read` `staff.manage` `groups.manage` `concessions.manage` `attendance.manage` `attendance.correct` `learning.manage` `exams.manage` `fees.read` `fees.record` `fees.invoice` `fees.adjust` `fees.refund` `fees.verify` `payments.configure` `hostel.read` `hostel.manage` `accounts.read` `accounts.write` `accounts.export` `accounts.close_period` `analytics.read` `analytics.students` `kiosks.manage` `staff_attendance.read` `staff_attendance.manage` |
| madrasaAdmin | `users.read` `users.manage` `mfa.reset` `security.manage` `audit.read` `settings.manage` `students.read` `students.write` `guardians.read` `staff.read` `staff.manage` `groups.manage` `concessions.manage` `attendance.manage` `attendance.correct` `learning.manage` `exams.manage` `fees.read` `fees.record` `fees.invoice` `fees.adjust` `fees.refund` `fees.verify` `payments.configure` `hostel.read` `hostel.manage` `accounts.read` `accounts.write` `accounts.export` `accounts.close_period` `analytics.read` `analytics.students` `kiosks.manage` `staff_attendance.read` `staff_attendance.manage` |
| principal | `users.read` `audit.read` `students.read` `guardians.read` `staff.read` `attendance.correct` `fees.read` `hostel.read` `analytics.read` `analytics.students` `staff_attendance.read` |
| committee | `analytics.read` |
| ca | `fees.read` `accounts.read` `accounts.export` |
| accountant | `students.read` `guardians.read` `fees.read` `fees.record` `fees.invoice` `fees.verify` `accounts.read` `accounts.write` `accounts.export` `accounts.close_period` `staff_attendance.read` |
| mentor | none (reaches only their own or their children's records) |
| warden | `hostel.read` `hostel.manage` |
| parent | none (reaches only their own or their children's records) |
| student | none (reaches only their own or their children's records) |

**How it was tested:** for each role, every route it lacks a permission for was called and had to refuse, and row counts confirmed nothing changed. Every read route it is allowed was called with a real and a junk ID, and had to answer without a server error or a leaked secret field.

**Row-level checks:** the guard only opens the door. `rbac` then checks each role sees exactly the right students, using ten sampled students across four routes.

Roles in the brief that don't exist: Branch Admin, HR Manager, Payroll Administrator.

