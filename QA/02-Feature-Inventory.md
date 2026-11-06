# Feature inventory and coverage matrix

Status means what was actually found. *Built and tested* means its behaviour was checked, not just that the screen opened.

| Feature | Who uses it | Status | Evidence (suite) |
|---|---|---|---|
| Sign-in, sessions, passwords, MFA, recovery | All | Built and tested | auth, attack |
| Invitations and account activation | Admins | Built and tested | fixtures, auth |
| Madrasas, settings, module switches | Super Admin | Built and tested | attack, matrix |
| Madrasa isolation | All | Built and tested | attack, repo isolation tests |
| Student admission, profile, guardians, halqa moves | Admin | Built and tested | academic |
| Mentors and staff records | Admin | Built, partly tested | rbac, ui |
| Student attendance and corrections | Mentor, Admin | Built and tested | academic |
| Sabaq, Sabqi, Manzil records in safah | Mentor | Built and tested | academic, repo tests |
| Exams, marks, grading, report cards | Mentor, Admin | Built and tested | academic |
| Fee plans, invoices, office payments, receipts | Accountant | Built and tested | fees |
| Refund, adjust, void | Accountant, Admin | API tested. **No screen.** | fees |
| Bank transfer and UPI reports, verification, proofs | Parent, Accountant | Built and tested | pay-kiosk, attack |
| Payment settings, UPI QR | Admin | Built and tested | repo tests, a1 |
| Fee reminders, scheduled progress reports | Admin | Built; real mail not tested | messaging |
| Notifications (in-app and email outbox) | All | Built; real mail not tested | messaging |
| Hostel: rooms, beds, roll call | Warden | Built and tested | campus |
| Audit log | Admin | Built and tested | attack, resilience |
| Parent portal | Parent | Built and tested | rbac, attack, ui |
| Student portal | Student | Built and tested | rbac, attack, ui |
| Urdu and right-to-left | All | Built; language quality not reviewed | ui |
| Staff shifts, attendance, corrections, monthly figures | Admin | Built and tested | edges, repo tests |
| Android kiosk: registration, scanning, offline, revocation | Kiosk | Built. Tested with a simulated camera, **not on a real phone.** | kiosk e2e, pay-kiosk |
| Personal QR code and PIN | Staff | Built and tested | pay-kiosk, kiosk admin |
| Courses and classes (CR-01 step 2) |  | **Not built** |  |
| Holiday calendar (step 3) |  | **Not built** |  |
| Cheque and cash extras, statement import (step 4) |  | **Not built** |  |
| Namaz and holiday Salah (step 5) |  | **Not built** |  |
| Accounts and CA module (step 6) |  | **Not built** |  |
| Principal, Committee and Sadar dashboards, parent graphs (step 7) |  | **Not built**; mockups only |  |
| Custom admission fields (step 8) |  | **Not built** |  |
| Salary, payroll, bank files, slips |  | **Not built**, no rules given |  |
| HR: leave, departments, documents |  | **Not built** |  |
| Digital library, payment gateway |  | Removed on purpose |  |

## Screens

`/login`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/mfa-recovery`, `/`, `/dashboard`, `/students`, `/students/new`, `/students/:id`, `/students/:id/edit`, `/mentors`, `/mentors/:id`, `/attendance`, `/sabaq/new`, `/sabaq`, `/journey`, `/progress-report`, `/exams`, `/exams/:id`, `/report-card/:id`, `/fees`, `/reminders`, `/payment-settings`, `/payment-verification`, `/hostel`, `/reports`, `/audit`, `/notifications`, `/settings`, `/admin/users`, `/kiosks`, `/staff-attendance`, `/my-attendance`, `/organization`, `/account/security`, `*`

Each role's menu was walked at phone, tablet and desktop width: see [12](12-UI-UX-Review.md).

## Background jobs

`fees-issue-monthly`, `fees-reminders`, `progress-reports`, `staff-attendance-housekeeping`, `deliver-notifications`

## API routes, from the code

The guard is the permission on the route. Routes marked `requireAuth` need a signed-in person, and then check the record itself (row-level scope).

| Method | Path | Guard | Needs recent password |
|---|---|---|---|
| GET | `/exams` | requireAuth |  |
| POST | `/exams` | requireAuth |  |
| GET | `/exam-results` | requireAuth |  |
| GET | `/exams/:ref/results` | requireAuth |  |
| PUT | `/exams/:ref/results` | requireAuth |  |
| POST | `/exams/:ref/publish` | exams.manage |  |
| GET | `/grading` | requireAuth |  |
| PUT | `/grading` | exams.manage |  |
| GET | `/report-cards/:studentRef` | requireAuth |  |
| POST | `/audit/events` | requireAuth |  |
| POST | `/auth/login` | public or device |  |
| POST | `/auth/logout` | public or device |  |
| GET | `/auth/session` | authenticated |  |
| POST | `/auth/reauthenticate` | requireAuth |  |
| POST | `/auth/mfa/verify` | requireStage |  |
| POST | `/auth/mfa/recovery-code` | requireStage |  |
| POST | `/auth/mfa/enrollment` | public or device |  |
| POST | `/auth/mfa/enrollment/confirm` | public or device |  |
| DELETE | `/auth/mfa` | requireAuth | yes |
| POST | `/auth/mfa/recovery-codes` | requireAuth | yes |
| POST | `/auth/mfa/recovery/start` | public or device |  |
| POST | `/auth/password/forgot` | public or device |  |
| POST | `/auth/password/reset` | public or device |  |
| POST | `/auth/password/change` | requireAuth |  |
| POST | `/auth/invite/accept` | public or device |  |
| GET | `/auth/sessions` | requireAuth |  |
| DELETE | `/auth/sessions/:id` | requireAuth |  |
| POST | `/auth/sessions/revoke-others` | requireAuth |  |
| GET | `/fees` | requireAuth |  |
| GET | `/fees/students/:ref` | requireAuth |  |
| POST | `/fees/payments` | fees.record |  |
| POST | `/fees/invoices/issue` | fees.invoice |  |
| POST | `/fees/invoices/:id/adjustments` | fees.adjust | yes |
| POST | `/fees/invoices/:id/void` | fees.adjust | yes |
| POST | `/fees/payments/:id/refunds` | fees.refund | yes |
| POST | `/payments/proofs` | requireAuth |  |
| POST | `/payments/submissions` | requireAuth |  |
| GET | `/payments/submissions` | requireAuth |  |
| GET | `/payments/submissions/:id` | requireAuth |  |
| GET | `/payments/submissions/:id/proof` | requireAuth |  |
| PATCH | `/payments/submissions/:id` | requireAuth |  |
| POST | `/payments/submissions/:id/approve` | fees.verify |  |
| POST | `/payments/submissions/:id/reject` | fees.verify |  |
| POST | `/payments/submissions/:id/request-info` | fees.verify |  |
| GET | `/health/live` | public or device |  |
| GET | `/health/ready` | public or device |  |
| GET | `/hostel` | hostel.read |  |
| POST | `/hostel/beds/:id/assign` | hostel.manage |  |
| POST | `/hostel/beds/:id/release` | hostel.manage |  |
| GET | `/hostel/history` | hostel.read |  |
| POST | `/hostel/roll-call` | hostel.manage |  |
| GET | `/hostel/roll-call` | hostel.read |  |
| POST | `/kiosk/device/register` | public or device |  |
| GET | `/kiosk/device/status` | public or device |  |
| POST | `/kiosk/device/scan` | public or device |  |
| POST | `/kiosk/device/reset` | public or device |  |
| POST | `/kiosk/device/forget` | public or device |  |
| GET | `/kiosks` | kiosks.manage |  |
| POST | `/kiosks` | kiosks.manage | yes |
| PATCH | `/kiosks/:id` | kiosks.manage |  |
| POST | `/kiosks/:id/registration-code` | kiosks.manage | yes |
| POST | `/kiosks/:id/deactivate` | kiosks.manage |  |
| POST | `/kiosks/:id/activate` | kiosks.manage | yes |
| POST | `/kiosks/:id/revoke` | kiosks.manage |  |
| GET | `/kiosks/:id/scans` | kiosks.manage |  |
| GET | `/kiosk-settings` | kiosks.manage |  |
| PUT | `/kiosk-settings` | kiosks.manage |  |
| PUT | `/kiosk-settings/organization` | org.manage |  |
| POST | `/attendance` | requireAuth |  |
| GET | `/attendance` | requireAuth |  |
| GET | `/attendance/:studentId/:date/corrections` | requireAuth |  |
| GET | `/learning-records` | requireAuth |  |
| POST | `/learning-records` | requireAuth |  |
| PATCH | `/learning-records/:id` | requireAuth |  |
| GET | `/learning-records/:id/revisions` | requireAuth |  |
| GET | `/notifications` | requireAuth |  |
| POST | `/notifications/read` | requireAuth |  |
| GET | `/notifications/preferences` | requireAuth |  |
| PUT | `/notifications/preferences` | requireAuth |  |
| GET | `/reminders/rules` | fees.read,fees.invoice |  |
| PUT | `/reminders/rules` | fees.invoice,fees.read |  |
| GET | `/reminders/template` | fees.read,fees.invoice |  |
| PUT | `/reminders/template` | fees.invoice,fees.read |  |
| GET | `/reminders/queue` | fees.read,fees.invoice |  |
| POST | `/reminders/invoices/:id/send` | fees.invoice |  |
| GET | `/scheduled-reports/config` | settings.manage,settings.manage |  |
| PUT | `/scheduled-reports/config` | settings.manage,settings.manage |  |
| GET | `/scheduled-reports/runs` | settings.manage |  |
| GET | `/admin/jobs` | settings.manage,settings.manage |  |
| POST | `/admin/jobs/:name/run` | settings.manage |  |
| GET | `/reminders/log` | fees.read |  |
| GET | `/settings` | requireAuth |  |
| PUT | `/settings` | settings.manage |  |
| GET | `/madrasa` | requireAuth |  |
| PUT | `/madrasa/config` | settings.manage |  |
| GET | `/org/permissions` | org.manage |  |
| GET | `/org` | org.manage |  |
| PUT | `/org` | org.manage |  |
| GET | `/org/madrasas` | org.manage |  |
| POST | `/org/madrasas` | org.manage | yes |
| PATCH | `/org/madrasas/:id` | org.manage | yes |
| PUT | `/org/madrasas/:id/features` | org.manage |  |
| GET | `/admin/payment-settings` | payments.configure |  |
| PUT | `/admin/payment-settings` | payments.configure | yes |
| PUT | `/admin/payment-settings/upi-qr` | payments.configure | yes |
| DELETE | `/admin/payment-settings/upi-qr` | payments.configure | yes |
| GET | `/payments/options` | requireAuth |  |
| GET | `/payments/upi-qr` | requireAuth |  |
| GET | `/staff-attendance/me/qr` | requireAuth |  |
| GET | `/staff-attendance/me` | requireAuth |  |
| PUT | `/staff-attendance/me/pin` | requireAuth | yes |
| GET | `/staff-attendance` | staff_attendance.read |  |
| GET | `/staff-attendance/summary` | staff_attendance.read |  |
| POST | `/staff-attendance/sessions/:id/correct` | staff_attendance.manage |  |
| GET | `/staff-attendance/sessions/:id/corrections` | staff_attendance.read |  |
| POST | `/staff-attendance/sessions` | staff_attendance.manage |  |
| GET | `/staff-shifts` | staff_attendance.read |  |
| POST | `/staff-shifts` | staff_attendance.manage |  |
| PATCH | `/staff-shifts/:id` | staff_attendance.manage |  |
| PUT | `/staff-attendance/staff/:id/arrangement` | staff_attendance.manage |  |
| POST | `/staff-attendance/staff/:id/revoke-qr` | staff_attendance.manage |  |
| GET | `/students` | requireAuth |  |
| GET | `/students/:ref` | requireAuth |  |
| POST | `/students` | students.write |  |
| PATCH | `/students/:ref` | students.write |  |
| POST | `/students/:ref/guardians` | students.write |  |
| DELETE | `/students/:ref/guardians/:guardianId` | students.write |  |
| GET | `/groups` | requireAuth |  |
| PUT | `/groups/:id/mentor` | groups.manage |  |
| GET | `/staff` | requireAuth |  |
| POST | `/staff` | staff.manage |  |
| POST | `/staff/:id/status` | staff.manage |  |
| GET | `/guardians` | guardians.read |  |
| GET | `/fee-plans` | requireAuth |  |
| GET | `/admin/users` | users.read |  |
| GET | `/admin/users/:id` | users.read |  |
| POST | `/admin/users` | users.manage | yes |
| POST | `/admin/users/:id/invite` | users.manage |  |
| PUT | `/admin/users/:id/roles` | users.manage | yes |
| POST | `/admin/users/:id/status` | users.manage | yes |
| POST | `/admin/users/:id/mfa/reset` | mfa.reset | yes |
| GET | `/admin/security/mfa-policy` | security.manage |  |
| PUT | `/admin/security/mfa-policy` | security.manage | yes |
| GET | `/admin/audit-logs` | audit.read |  |

