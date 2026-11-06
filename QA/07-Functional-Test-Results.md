# Test results

**Date:** 6 November 2026
**Code:** branch `backend-phase-1-2`, commit `253bb66`, plus the uncommitted Sabaq-in-safah, kiosk and QA fixes in the working tree
**Environment:** Windows 11, Node 22, local PostgreSQL 17 (embedded). A separate database (`madarsa_audit`), API on port 4100, web on port 5174, headless Edge. Mail went to files. Demo data only.
**Not touched:** production (none exists yet). Development data was not used for testing.

| Suite | What it covers | Passed | Failed | Blocked |
|---|---|---:|---:|---:|
| `matrix` | Every route × every role | 34 | 0 | 0 |
| `attack` | Cross-madrasa, injection, uploads, headers | 29 | 0 | 0 |
| `pay-kiosk` | Reported payments, kiosk abuse | 23 | 0 | 0 |
| `edges` | Staff attendance boundaries | 16 | 0 | 0 |
| `rbac` | Row-level access by role | 84 | 0 | 0 |
| `academic` | Students, attendance, lessons, exams | 37 | 0 | 0 |
| `fees` | Fee ledger, receipts, refunds | 14 | 0 | 0 |
| `messaging` | Reminders, reports, delivery, worker | 18 | 0 | 0 |
| `campus` | Hostel | 8 | 0 | 0 |
| `auth` | Sign-in, sessions, passwords, MFA | 58 | 0 | 0 |
| `resilience` | Stored XSS, foreign keys, errors, load | 14 | 0 | 0 |
| `ui` | Every screen × role × width | 32 | 0 | 0 |
| `scale` | Reads on a large dataset | 11 | 0 | 0 |
| `data-perf` | Database integrity and speed | 26 | 0 | 0 |
| **Total** | | **404** | **0** | **0** |

**Nothing is failing in the final run.**

The figures are for the final run of each test. Failures found earlier are in [13](13-Bug-Reports.md). Tests for removed features (Razorpay, library) were deleted rather than counted. The older `70-browser` suite was replaced by the `ui` suite.

**Repository tests:** see [15](15-Regression-Test-Results.md).

## Every test

### Every route × every role

- Pass: anonymous: all 126 private routes answer 401
- Pass: device routes without the kiosk cookie answer 401 (register answers 4xx for no code)
- Pass: superAdmin: signs in; session lists permissions
- Pass: superAdmin: every route it lacks the permission for is refused
- Pass: superAdmin: every GET it is allowed answers without a server error, with a junk id too
- Pass: madrasaAdmin: signs in; session lists permissions
- Pass: madrasaAdmin: every route it lacks the permission for is refused
- Pass: madrasaAdmin: every GET it is allowed answers without a server error, with a junk id too
- Pass: principal: signs in; session lists permissions
- Pass: principal: every route it lacks the permission for is refused
- Pass: principal: every GET it is allowed answers without a server error, with a junk id too
- Pass: committee: signs in; session lists permissions
- Pass: committee: every route it lacks the permission for is refused
- Pass: committee: every GET it is allowed answers without a server error, with a junk id too
- Pass: ca: signs in; session lists permissions
- Pass: ca: every route it lacks the permission for is refused
- Pass: ca: every GET it is allowed answers without a server error, with a junk id too
- Pass: accountant: signs in; session lists permissions
- Pass: accountant: every route it lacks the permission for is refused
- Pass: accountant: every GET it is allowed answers without a server error, with a junk id too
- Pass: mentor: signs in; session lists permissions
- Pass: mentor: every route it lacks the permission for is refused
- Pass: mentor: every GET it is allowed answers without a server error, with a junk id too
- Pass: warden: signs in; session lists permissions
- Pass: warden: every route it lacks the permission for is refused
- Pass: warden: every GET it is allowed answers without a server error, with a junk id too
- Pass: parent: signs in; session lists permissions
- Pass: parent: every route it lacks the permission for is refused
- Pass: parent: every GET it is allowed answers without a server error, with a junk id too
- Pass: student: signs in; session lists permissions
- Pass: student: every route it lacks the permission for is refused
- Pass: student: every GET it is allowed answers without a server error, with a junk id too
- Pass: after all of it, no table other than logs changed size
- Pass: role permissions: read-only roles hold no write permission; family roles hold none

### Cross-madrasa, injection, uploads, headers

- Pass: setup: a student exists in GIRLS (inserted directly, this test is about reading it)
- Pass: a MAIN principal naming GIRLS in the header gets 404, never data
- Pass: a MAIN principal asking for a GIRLS student by id gets 404
- Pass: a parent cannot select a madrasa with no child of theirs, and cannot read a GIRLS student
- Pass: malformed X-Madrasa-Id values never reach the database as anything but a refusal
- Pass: Super Admin lists differ by selected madrasa, and never mix
- Pass: a mentor in two madrasas sees only the selected one
- Pass: a module off in GIRLS is refused there but works in MAIN
- Pass: audit log of one madrasa does not show another's entries to a madrasa admin
- Pass: Parent A cannot reach Parent B's child through any id-bearing route
- Pass: a parent cannot write academic or attendance records for their own child
- Pass: a student cannot read another student's records
- Pass: search and filter parameters treat injection text as text
- Pass: login refuses operator objects and oversized input
- Pass: JSON edge cases answer cleanly: prototype keys, huge body, nul, wrong type
- Pass: mass assignment: madrasa, ids and status in a student update are ignored or refused
- Pass: a person cannot give themselves a role or change password by updating preferences
- Pass: a madrasa admin cannot create a Super Admin or grant roles above their own
- Pass: money the client names is not trusted: office payment cannot exceed what is owed
- Pass: uploads: executable, script and mismatched files are refused by content, not by name
- Pass: uploads: oversized body refused; malformed and traversal file names answer cleanly
- Pass: a proof uploaded by one family cannot be attached or fetched by another
- Pass: the student role and staff without rights cannot report a payment
- Pass: API headers: no X-Powered-By; nosniff; frame deny or CSP
- Pass: CORS: another origin gets no permission; a state change from it is refused
- Pass: cookies: session cookie is httpOnly and SameSite
- Pass: errors carry no stack trace, SQL or file paths
- Pass: at rest: password hashes are slow hashes; tokens, recovery codes and MFA secrets are not plaintext
- Pass: the audit table refuses update and delete at the database level

### Reported payments, kiosk abuse

- Pass: setup: this child owes more than ₹200; the options come from settings
- Pass: a claim changes no balance until it is verified
- Pass: the same reference cannot be claimed twice, even with other spelling
- Pass: claims cannot exceed what is still owed, counting those already waiting
- Pass: bad dates and amounts are refused
- Pass: a parent cannot approve; a mentor cannot; a double approval credits once
- Pass: rejecting needs a reason and changes no money
- Pass: a parent cannot see another family's claim
- Pass: a fee refund cannot exceed the payment; ledger rows cannot be edited in the database
- Pass: registering takes the one-time code; the same code twice is refused; wrong codes are refused
- Pass: the QR holds no personal data: only the prefix, a signed reference and its expiry
- Pass: forged, tampered and garbage codes are refused and record nothing
- Pass: without the device cookie a good code is refused (the request is not trusted)
- Pass: a staff member's session cookie alone is not a kiosk
- Pass: 20 kiosks-at-once scans of one code record exactly one check-in
- Pass: the same request id replayed returns the first answer and records nothing new
- Pass: expired code refused; an old screenshot cannot be replayed
- Pass: a kiosk in GIRLS cannot record a person with no staff record there
- Pass: revoked staff QR and a deactivated person are refused
- Pass: PIN mode: wrong PINs are limited; the error reveals no staff data
- Pass: a revoked device stops at once; its cookie is dead; admin can issue a new one
- Pass: a mentor cannot read or change kiosks; a principal cannot correct attendance
- Pass: corrections keep the old times and need a reason; the audit log has them

### Staff attendance boundaries

- Pass: correction: check-out before check-in, and times in the future, are refused
- Pass: adding by hand: a second open session for one person answers 409, not a server error
- Pass: adding by hand: a session overlapping an existing one is refused
- Pass: correction: moving a session onto another one is refused
- Pass: reasons are required and cannot be blanks
- Pass: monthly figures: bad month refused; future month has no absences; February of a leap year works
- Pass: monthly figures equal an independent count from the database
- Pass: date ranges: inverted and enormous ranges answer cleanly
- Pass: shifts: bad times and graces refused; end before start allowed (overnight)
- Pass: settings: inconsistent combinations are refused
- Pass: a madrasa's kiosk settings do not change another madrasa's
- Pass: kiosk registration: expired code refused; a new code cancels the old one; a code for a revoked kiosk does not work
- Pass: kiosk registration: a wrong code is rate limited
- Pass: kiosk names: too long and blank refused; deactivate then activate restores it
- Pass: deactivating a person ends their code: an old code is refused at the kiosk
- Pass: after a missed check-out, the next scan the next day starts a new day, not a check-out

### Row-level access by role

- Pass: fixture sanity: Parent A has 2 children, Parent B has 3 others, no overlap
- Pass: admin: GET /students returns exactly the students in scope
- Pass: admin: GET /fees lists only fee-scoped students
- Pass: admin: GET /learning-records lists only academically scoped students
- Pass: admin: GET /attendance lists only scoped students
- Pass: admin: GET /exam-results lists only scoped students (families: published only)
- Pass: principal: GET /students returns exactly the students in scope
- Pass: principal: GET /fees lists only fee-scoped students
- Pass: principal: GET /learning-records lists only academically scoped students
- Pass: principal: GET /attendance lists only scoped students
- Pass: principal: GET /exam-results lists only scoped students (families: published only)
- Pass: mentorA: GET /students returns exactly the students in scope
- Pass: mentorA: GET /fees lists only fee-scoped students
- Pass: mentorA: GET /learning-records lists only academically scoped students
- Pass: mentorA: GET /attendance lists only scoped students
- Pass: mentorA: GET /exam-results lists only scoped students (families: published only)
- Pass: mentorB: GET /students returns exactly the students in scope
- Pass: mentorB: GET /fees lists only fee-scoped students
- Pass: mentorB: GET /learning-records lists only academically scoped students
- Pass: mentorB: GET /attendance lists only scoped students
- Pass: mentorB: GET /exam-results lists only scoped students (families: published only)
- Pass: warden: GET /students returns exactly the students in scope
- Pass: warden: GET /fees lists only fee-scoped students
- Pass: warden: GET /learning-records lists only academically scoped students
- Pass: warden: GET /attendance lists only scoped students
- Pass: warden: GET /exam-results lists only scoped students (families: published only)
- Pass: parentA: GET /students returns exactly the students in scope
- Pass: parentA: GET /fees lists only fee-scoped students
- Pass: parentA: GET /learning-records lists only academically scoped students
- Pass: parentA: GET /attendance lists only scoped students
- Pass: parentA: GET /exam-results lists only scoped students (families: published only)
- Pass: parentB: GET /students returns exactly the students in scope
- Pass: parentB: GET /fees lists only fee-scoped students
- Pass: parentB: GET /learning-records lists only academically scoped students
- Pass: parentB: GET /attendance lists only scoped students
- Pass: parentB: GET /exam-results lists only scoped students (families: published only)
- Pass: studentA: GET /students returns exactly the students in scope
- Pass: studentA: GET /fees lists only fee-scoped students
- Pass: studentA: GET /learning-records lists only academically scoped students
- Pass: studentA: GET /attendance lists only scoped students
- Pass: studentA: GET /exam-results lists only scoped students (families: published only)
- Pass: studentB: GET /students returns exactly the students in scope
- Pass: studentB: GET /fees lists only fee-scoped students
- Pass: studentB: GET /learning-records lists only academically scoped students
- Pass: studentB: GET /attendance lists only scoped students
- Pass: studentB: GET /exam-results lists only scoped students (families: published only)
- Pass: admin: per-student endpoints answer 200 in scope and 404 out of scope (10 students × 4 endpoints × id/admNo)
- Pass: principal: per-student endpoints answer 200 in scope and 404 out of scope (10 students × 4 endpoints × id/admNo)
- Pass: mentorA: per-student endpoints answer 200 in scope and 404 out of scope (10 students × 4 endpoints × id/admNo)
- Pass: mentorB: per-student endpoints answer 200 in scope and 404 out of scope (10 students × 4 endpoints × id/admNo)
- Pass: warden: per-student endpoints answer 200 in scope and 404 out of scope (10 students × 4 endpoints × id/admNo)
- Pass: parentA: per-student endpoints answer 200 in scope and 404 out of scope (10 students × 4 endpoints × id/admNo)
- Pass: parentB: per-student endpoints answer 200 in scope and 404 out of scope (10 students × 4 endpoints × id/admNo)
- Pass: studentA: per-student endpoints answer 200 in scope and 404 out of scope (10 students × 4 endpoints × id/admNo)
- Pass: studentB: per-student endpoints answer 200 in scope and 404 out of scope (10 students × 4 endpoints × id/admNo)
- Pass: search cannot reveal out-of-scope students (Parent A searching Parent B's child by name and admission no.)
- Pass: malformed ids → 404/422, never 500
- Pass: GET /admin/users: only admin/principal
- Pass: GET /admin/audit-logs: only admin/principal
- Pass: GET /admin/security/mfa-policy: only admin
- Pass: GET /guardians: only admin/principal
- Pass: GET /hostel: only admin/principal/warden
- Pass: GET /hostel/history: only admin/principal/warden
- Pass: GET /hostel/roll-call: only admin/principal/warden
- Pass: GET /reminders/rules: only admin/principal
- Pass: GET /reminders/queue: only admin/principal
- Pass: GET /reminders/log: only admin/principal
- Pass: GET /scheduled-reports/config: only admin
- Pass: GET /admin/jobs: only admin
- Pass: staff directory: families see only their children's mentors, without contact details
- Pass: audit log is readable by admin/principal only and never carries client IPs
- Pass: non-administrators cannot admit, edit or re-link students
- Pass: mentor cannot mark another halqa's register; families and warden cannot mark any
- Pass: mentor cannot record or edit lessons of another mentor's students; families cannot record any
- Pass: exam scheduling, publishing and grading are refused for the wrong roles
- Pass: families cannot write marks (exam outside or inside their child's halqa)
- Pass: only fee staff can record money, adjust, void, refund or issue invoices
- Pass: online payment: only the linked guardian, only own child, only own child's invoices
- Pass: hostel changes: warden and admin only
- Pass: warden sees hostel identity only: no learning, fees, report cards or marks of residents
- Pass: account administration is admin-only; nobody can grant themselves roles
- Pass: mass assignment: unknown fields are ignored (status, passwordHash, admissionNo, id)
- Pass: notifications: marking someone else's as read changes nothing
- Pass: correction history of attendance: staff only

### Students, attendance, lessons, exams

- Pass: admit a student: 201, sequential admission no., guardian created, persisted, audited, invoice issued
- Pass: required fields and formats are validated (422 with field paths)
- Pass: impossible calendar dates are rejected, not silently shifted (dob 2015-02-30)
- Pass: inactive halqa / unknown fee plan / unknown guardian → 422
- Pass: duplicate admission (same name + DOB) → 409 POSSIBLE_DUPLICATE; confirmDuplicate admits
- Pass: concurrent admissions get distinct admission numbers
- Pass: multiple guardians: link an existing guardian, cannot link twice, cannot remove the primary
- Pass: search, filter and pagination are consistent
- Pass: changing halqa keeps history intact (attendance, lessons, invoices unchanged; enrollment closed + opened)
- Pass: deactivating a student keeps history, hides them from the mentor's active work and frees their bed
- Pass: audit log keeps private fields out (medical notes, address)
- Pass: mentor marks today's register for own halqa; resubmitting the same register changes nothing
- Pass: absence notifies the family in-app
- Pass: mentor may change today's mark (no reason needed); history row kept
- Pass: future date → 422; impossible date → 422; duplicate student in body → 422
- Pass: mentor cannot correct an earlier day; admin needs a reason; correction is recorded
- Pass: principal (attendance.correct) can correct a past day with a reason
- Pass: concurrent submissions of one register produce one record per student
- Pass: database enforces one mark per student per day
- Pass: range query: inclusive bounds, max 120 days, inverted range rejected
- Pass: parent sees their child's marks (matches the database)
- Pass: mentor records a lesson for own student (201), family notified
- Pass: invalid progress values are rejected (ayah past surah end, wrong track category, rating 6, future, >7 days back)
- Pass: a second record the same day warns (duplicateForDay) instead of overwriting
- Pass: editing keeps the previous version (revision) and never erases history
- Pass: admin edit needs a reason; another mentor cannot edit
- Pass: parent sees the new lesson; summary counts match the database
- Pass: admin schedules a two-halqa exam (Hifz A + Hifz B, examiner = Hifz B mentor) with default subjects
- Pass: mentor of Hifz A cannot enter marks for Hifz B students in a joint exam
- Pass: marks validation: above max, negative, fractional, missing subject, unknown subject, student not in exam → 422
- Pass: mentor enters own students' marks; totals, percentages and grades match the configured scale
- Pass: families do not see unpublished results; publishing makes them visible and notifies
- Pass: report card matches stored marks for the parent
- Pass: after publication: mentor cannot change marks; admin needs a reason
- Pass: changing the grading scale creates a new version and does not regrade a published exam
- Pass: report-card URL after logout → 401; as another parent → 404
- Pass: exam with an impossible date → 422 (not 500)

### Fee ledger, receipts, refunds

- Pass: setup: invoice of ₹1,500 corrected to ₹1,000 due (adjustment needs re-auth)
- Pass: 1. no payment → outstanding ₹1,000 (API = database)
- Pass: 2. office payment of ₹400 → outstanding ₹600; receipt issued; family notified
- Pass: overpayment at the office is refused (₹700 against ₹600)
- Pass: the payment date cannot be in the future; amounts must be whole positive paise
- Pass: 7a. refund of ₹100 from the ₹400 payment → outstanding ₹700
- Pass: concurrent refunds cannot exceed the payment (two ₹300 refunds of the ₹300 left)
- Pass: confirmed payments, allocations and receipts cannot be altered in the database
- Pass: 8. a payment for another student does not change this balance
- Pass: concurrent office payments for one student never allocate the same balance twice
- Pass: 3. balance fully cleared → ₹0, invoice no longer overdue
- Pass: receipt numbers are unique and gapless within the financial year
- Pass: principal's fee report totals equal the database
- Pass: parent sees the receipt; Parent B cannot see it

### Reminders, reports, delivery, worker

- Pass: fixtures: 6 open invoices with a reachable guardian
- Pass: "send now" queues email + in-app once per day; a second press queues nothing
- Pass: a partial payment before dispatch: the reminder states the balance at send time
- Pass: balance cleared before dispatch → reminder skipped, never sent
- Pass: provider failure → delivery stays queued with back-off (≈1 min), then succeeds; recipient is the guardian
- Pass: after the last attempt a failing delivery is marked FAILED (not SENT)
- Pass: WhatsApp/SMS without consent or provider are recorded as skipped, never as sent
- Pass: the daily reminder job is idempotent (second run queues nothing new)
- Pass: disabling every stage stops reminders; template placeholders are validated
- Pass: weekly report due now runs once; a rerun does nothing (no duplicate messages)
- Pass: report content matches the database for one child, and covers the previous 7 days
- Pass: a parent with two children receives one report per child; Parent B gets none about Parent A's children
- Pass: disabled schedule does not run; not-yet-due time does not run
- Pass: report schedule rejects unknown sections and bad times
- Pass: in-app list returns only your own notifications; marking read works
- Pass: WhatsApp opt-in records consent time; opting out clears it
- Pass: no message in the outbox contains a password, TOTP secret or recovery code
- Pass: worker stores its schedules in PostgreSQL and survives a restart; work queued while it was down is sent

### Hostel

- Pass: occupancy overview equals the database
- Pass: assign a resident to a free bed, then transfer; history keeps both
- Pass: an occupied bed cannot be assigned again
- Pass: two concurrent assignments of one bed: exactly one wins
- Pass: non-resident or deactivated student cannot get a bed; bad ids → 404/422
- Pass: release a bed, then it can be reused; releasing an empty bed → 409
- Pass: the database allows one open bed per student and one occupant per bed
- Pass: roll call: residents only, once each, no future nights; earlier nights need a reason

### Sign-in, sessions, passwords, MFA

- Pass: valid credentials (parent, optional MFA off) → full session with hardened cookie
- Pass: identifier is case-insensitive and trimmed
- Pass: wrong password → 401 INVALID_CREDENTIALS
- Pass: unknown account → identical 401 (no enumeration)
- Pass: disabled account with correct password → identical 401
- Pass: timing: unknown vs wrong-password sign-in within 40% of each other
- Pass: missing fields → 400 VALIDATION_FAILED
- Pass: malformed JSON → 400 BAD_JSON (no stack trace)
- Pass: repeated failures on one account → 429 with Retry-After, correct password also held back
- Pass: per-IP limit: 31st sign-in from one address in 15 min → 429
- Pass: logout revokes the session server-side; old cookie no longer works
- Pass: protected APIs without a session → 401 (sample of 12)
- Pass: forged / garbage session cookie → 401
- Pass: idle-expired staff session (31 min) → 401 and revoked
- Pass: absolute-expired session → 401
- Pass: "sign out other devices" revokes the others but keeps this one
- Pass: a user cannot revoke someone else's session by id (treated as missing)
- Pass: state change without X-CSRF-Token → 403 CSRF_FAILED
- Pass: wrong CSRF token → 403
- Pass: cross-site Origin → 403 even with a valid token
- Pass: form-encoded body (what a cross-site form can send) → 415
- Pass: CORS: a foreign origin gets no Access-Control-Allow-Origin
- Pass: security headers on API responses
- Pass: forgot-password: same 202 body for known and unknown email; mail only for known
- Pass: reset with an invalid token → 400 INVALID_TOKEN
- Pass: password policy: too short / too common → 422 with field message
- Pass: successful reset signs out every session, then the token cannot be reused
- Pass: expired reset token → 400
- Pass: a new reset link invalidates the previous one
- Pass: change password requires the current one and signs out other devices
- Pass: email provider failure: forgot-password still answers 202 (no enumeration, no crash)
- Pass: password-only session (PRE_MFA) cannot reach any protected API
- Pass: wrong code → 400; missing code → 422; correct code → full session
- Pass: TOTP replay: the same code cannot complete a second sign-in
- Pass: 5 wrong codes end the attempt (session revoked)
- Pass: expired pre-MFA session (5 min) → 401
- Pass: mandatory role cannot turn MFA off
- Pass: administrator cannot lower the MFA baseline for ADMIN/PRINCIPAL/MENTOR
- Pass: optional role: enrolling needs recent re-auth; QR shown once; MFA then required at next sign-in
- Pass: enrollment that expired (10 min) → 410
- Pass: recovery code signs in once; the same code is rejected the second time
- Pass: optional role can turn MFA off again (needs password + code)
- Pass: strictest role wins: PARENT + MENTOR must enroll
- Pass: Principal and Mentor cannot reset someone's MFA (403)
- Pass: admin without a fresh re-auth → 403 REAUTH_REQUIRED; missing reason → 422
- Pass: admin cannot reset their own MFA through the admin route
- Pass: EMAIL_LINK reset: old authenticator and sessions revoked at once; email has a link, never a secret or QR
- Pass: recovery link + wrong password → 401 and the link is not burned
- Pass: someone else's credentials with the link → rejected, link not burned
- Pass: link + own password → enrollment-only session; QR shown only now; old authenticator rejected; new one activates
- Pass: recovery link reuse → 400
- Pass: expired recovery link → 400
- Pass: concurrent resets of one user leave exactly one pending recovery request
- Pass: IN_PERSON ticket works only with the user's password, then the user re-enrolls
- Pass: recovery notification failure → reported as failed and audited
- Pass: recovery actions are in the audit log
- Pass: an administrator cannot read anyone's TOTP secret (API and storage)
- Pass: policy: every staff and organization role required; family roles optional

### Stored XSS, foreign keys, errors, load

- Pass: stored XSS: a student name and lesson comment with HTML/script render as text and never execute
- Pass: foreign keys: records cannot point at missing parents (database level)
- Pass: deleting a student with history is refused by the database (history preserved)
- Pass: migrations are fully applied and re-running them changes nothing
- Pass: server errors never leak internals (stack, SQL, paths)
- Pass: load: admin students — 10 concurrent, 100 requests, no errors, p95 < 1.5 s
- Pass: load: admin fees — 10 concurrent, 100 requests, no errors, p95 < 1.5 s
- Pass: load: admin attendance (60 days) — 10 concurrent, 100 requests, no errors, p95 < 1.5 s
- Pass: load: admin lessons (90 days) — 10 concurrent, 100 requests, no errors, p95 < 1.5 s
- Pass: load: admin exam results — 10 concurrent, 100 requests, no errors, p95 < 1.5 s
- Pass: load: admin hostel — 10 concurrent, 100 requests, no errors, p95 < 1.5 s
- Pass: load: parent fees — 10 concurrent, 100 requests, no errors, p95 < 1.5 s
- Pass: load: mentor students — 10 concurrent, 100 requests, no errors, p95 < 1.5 s
- Pass: load: health — 10 concurrent, 100 requests, no errors, p95 < 1.5 s

### Every screen × role × width

- Pass: admin @ phone: every menu screen
- Pass: admin @ tablet: every menu screen
- Pass: admin @ desktop: every menu screen
- Pass: madrasaAdmin @ phone: every menu screen
- Pass: madrasaAdmin @ tablet: every menu screen
- Pass: madrasaAdmin @ desktop: every menu screen
- Pass: principal @ phone: every menu screen
- Pass: principal @ tablet: every menu screen
- Pass: principal @ desktop: every menu screen
- Pass: committee @ phone: every menu screen
- Pass: committee @ tablet: every menu screen
- Pass: committee @ desktop: every menu screen
- Pass: ca @ phone: every menu screen
- Pass: ca @ tablet: every menu screen
- Pass: ca @ desktop: every menu screen
- Pass: accountant @ phone: every menu screen
- Pass: accountant @ tablet: every menu screen
- Pass: accountant @ desktop: every menu screen
- Pass: mentor @ phone: every menu screen
- Pass: mentor @ tablet: every menu screen
- Pass: mentor @ desktop: every menu screen
- Pass: warden @ phone: every menu screen
- Pass: warden @ tablet: every menu screen
- Pass: warden @ desktop: every menu screen
- Pass: parent @ phone: every menu screen
- Pass: parent @ tablet: every menu screen
- Pass: parent @ desktop: every menu screen
- Pass: student @ phone: every menu screen
- Pass: student @ tablet: every menu screen
- Pass: student @ desktop: every menu screen
- Pass: admin: a keyboard user can reach sign-in fields and every dialog closes with Escape
- Pass: Urdu switches the page to right-to-left

### Reads on a large dataset

- Pass: measure: Students, first page
- Pass: measure: Students, last page
- Pass: measure: Students, all (no paging asked)
- Pass: measure: Students search
- Pass: measure: Lesson records
- Pass: measure: Lesson records, mentor
- Pass: measure: Fees overview
- Pass: measure: Principal: students
- Pass: measure: Parent: own children
- Pass: measure: Audit log
- Pass: measure: Audit log, deep

### Database integrity and speed

- Pass: every foreign key column in the schema has a real target (no orphans) — checked by PostgreSQL constraints being valid
- Pass: every campus table has madrasaId NOT NULL with a foreign key
- Pass: foreign keys without a supporting index (slow deletes and joins)
- Pass: fee ledger: each invoice's paid amount equals its allocations, and balances are never negative
- Pass: fee totals shown to a parent equal the ledger computed independently
- Pass: all money columns are integers, never floats
- Pass: no duplicates: one attendance record per student per day; one open session per person
- Pass: duplicate admission numbers and fee invoices for a period are prevented by the database
- Pass: migrations match the schema: no drift on a fresh database
- Pass: setup: enlarge history to a realistic size in the audit database only
- Pass: measure: Sign in (password, argon2id)
- Pass: measure: Session check
- Pass: measure: Students list
- Pass: measure: Students search
- Pass: measure: Attendance list
- Pass: measure: Lesson records
- Pass: measure: Fees overview
- Pass: measure: Exams
- Pass: measure: Audit log, first page
- Pass: measure: Audit log, deep page
- Pass: measure: Staff attendance, month
- Pass: measure: Kiosk dashboard
- Pass: measure: Parent: child fees
- Pass: measure: Mentor: students
- Pass: concurrency: 100 parallel reads across roles stay correct
- Pass: slowest SQL checked for a sequential scan on big tables

