# QA audit report: Madarsa Management System

**Date:** 30 October 2026
**Branch:** `backend-phase-1-2`, commits `48d35ae` and `5167db5`

**Test environment:**
- A separate database (`madarsa_qa`) on the local PostgreSQL 17, so testing never touched the development or test databases.
- A QA copy of the API on port 4100 and of the web app on port 5174, with their own secrets, email outbox and file storage.
- Synthetic data only. Email went to files on disk. Payments used the development gateway, which signs its webhooks like a real one but moves no money.

## A. Executive summary

- **It starts and builds.** The API, background worker and web app start. Typecheck, lint, the backend and frontend builds and `npm audit` (0 known vulnerabilities in either project) are all clean. All migrations are applied, and the schema matches them.
- **The core journeys work.** I tested each of the six roles through the real API and in a real browser (headless Edge), including access control, MFA and lost-phone recovery, fees and online payments, reminders and scheduled reports, hostel and library. In the final run every check passed:

  | Test set | Passed |
  |---|---|
  | Backend automated tests | 152 of 152 |
  | Frontend automated tests | 11 of 11 |
  | End-to-end checks against the running system | 374 of 374 |

- **Defects found:** 11. All are fixed, and all but one have a regression test.

  | Severity | Count | Areas |
  |---|---|---|
  | High | 4 | double refunds, lost online payments, shifted timestamps, the test runner hiding failures |
  | Medium | 4 | MFA policy, joint-exam marks, late-month invoices, stale reminder amounts |
  | Low | 3 | error handling for malformed input, impossible dates, the mentor list |

  The regression tests for D1, D2 and D4–D10 were shown to fail on the code before the fix. D3, the test-runner fix, was checked with a deliberately failing test instead. The D11 test wasn't run against the old code.
- **No confirmed security vulnerabilities remain open.** No access-control bypass was found: 86 role and row-level checks pass, including Parent A versus Parent B isolation.
- **Docker was removed** at your request. Deployment is now documented for systemd and Caddy, with PostgreSQL installed on the server.
- **Readiness: staging candidate** (see H). The core functions are verified in a test environment. Before production, the live providers (email, Razorpay), the deployment on a real server and a review with real data are still needed.

## B. Feature-by-feature results

Status meanings:
- **PASS:** executed, with the expected result verified.
- **PARTIAL:** some behaviours verified, coverage incomplete.
- **BLOCKED:** needs a credential or environment that isn't available.
- **NOT TESTED:** no meaningful test was run.

The evidence for each row is in the end-to-end results and the backend tests.

| Module | Feature | Status | Evidence | Defects | Remaining work |
|---|---|---|---|---|---|
| Sign-in | Valid, wrong, unknown, disabled and invited accounts; identical errors and timing | PASS | auth suite: same message and code; median timing within 40% | — | — |
| Sign-in | Per-account and per-IP rate limits, `Retry-After` | PASS | 9th failed attempt → 429; 31st per-IP attempt → 429 | D1 | — |
| Sessions | Logout, idle and absolute expiry, revoke other devices, cookie flags, no token in responses | PASS | revoked cookie → 401; `HttpOnly` and `SameSite=Lax` set | D1 | `Secure`/`__Host-` cookie is only checked in config, not over HTTPS |
| CSRF / CORS / headers | Missing or wrong token, foreign Origin, form body; CSP, HSTS, `nosniff`, `no-store` | PASS | 403/415 responses; headers present | — | Caddy headers not tested (no server) |
| Passwords | Forgot (no enumeration), reset, expiry, reuse, policy, sessions revoked, change | PASS | same 202 body; reused token → 400; old session → 401 | — | Real SMTP delivery BLOCKED |
| MFA policy | Mandatory for Admin, Principal, Mentor; optional for others; strictest role wins | PASS | PARENT + MENTOR account → must enroll | D2 | — |
| MFA enrollment | QR shown once, pending until verified, expiry (410), restart, recent re-auth | PASS | credential stays PENDING until a valid code | — | — |
| MFA sign-in | Wrong or missing code, replay, 5-failure lockout, expired pre-MFA session, no API access before MFA | PASS | concurrent reuse of one code → 200 + 400 | — | — |
| Recovery codes | Single use, hashed at rest | PASS | second use → 400; no plaintext in the database | — | — |
| Lost-device recovery | Admin only, recent re-auth, reason, single-use link, password required, old device rejected, sessions revoked, audit, notifications | PASS | 14 checks; email contains no secret or QR | — | — |
| Students | Admit, validate, duplicate check, concurrent admission numbers, guardians, search, pages, change halqa with history, deactivate, private fields kept out of audit | PASS | academic suite (12 checks) | D5, D7 | — |
| Attendance | Mark, resubmit, today's change, past-day correction with reason, Principal correction, future and impossible dates, concurrency, unique index, ranges, parent view, absence notice | PASS | academic suite (10 checks) | D5 | Weekly/monthly summaries are calculated in the web app; spot-checked on the dashboard only |
| Lessons (Sabaq) | Record, validation (ayahs, track, ratings, dates, 7-day limit), duplicate warning, revision history, reason for office edits, parent view | PASS | academic suite (6 checks) | — | — |
| Exams | Schedule, marks validation, grades against the scale, absent students, publication, families blocked before publication, published results fixed, new scale version, report card = stored marks | PASS | academic suite (10 checks) | D6 | Report cards print from the browser; PDF output not checked |
| Fees | ₹1,000 scenario (0 / 400 / 600 / duplicate / failed / pending / refund / other student), overpayment, receipts gapless, immutable rows, concurrent payments, report totals = database | PASS | fees suite (16 checks) | D7, D8 | — |
| Online payments | Server-set amount, signature, wrong provider, amount and currency mismatch, failed, unknown order, 10 concurrent duplicate webhooks → 1 payment, out-of-order events, retry after a crash, gateway refund | PASS | fees suite (12 checks) | D9 | Live Razorpay BLOCKED (no account) |
| Fee reminders | Send now once a day, live balance, cleared → skipped, provider failure → back-off → sent, max attempts → FAILED, WhatsApp/SMS skipped, idempotent job, stages off, template validation | PASS | messaging suite (8 checks) | D10 | Real SMTP BLOCKED |
| Progress reports | Weekly run once, rerun = no-op, content = database, period, one per child, no leak to other parents, disabled/not due, validation | PASS | messaging suite (5 checks) | — | Monthly run only covered by backend tests |
| Notifications | Own only, mark read, WhatsApp consent recorded and cleared, no secrets in any message | PASS | messaging suite; outbox scanned | — | WhatsApp/SMS not built (BLOCKED) |
| Background worker | Schedules stored in PostgreSQL, survive restart, work queued while down is sent | PASS | worker restarted; queued email sent | — | — |
| Hostel | Occupancy = database, assign, transfer, occupied bed, concurrent assignment (exactly 1 wins), non-resident, release and reuse, unique indexes, roll call rules | PASS | campus suite (8 checks) | D5 | — |
| Library | Upload (content check), no overwrite, wrong type, fake PDF, HTML, empty, oversized, bad filename header, safe download headers, staff-only hidden, track restriction, archived, URL after logout, no direct file paths | PASS | campus suite (9 checks) | D4 | Malware scanning not configured; S3 storage not run |
| Access control | All 6 roles: list endpoints exactly scoped, per-record 200/404, search, gated endpoints, write refusals, mass assignment, self-escalation, Parent A/B isolation | PASS | rbac suite (86 checks) | D6 | — |
| Dashboards | Admin KPIs (students, residents, present, absent) = database; outstanding fees = server; mentor count; parent shows only own children | PASS | browser suite | D11 | Other dashboards checked for rendering, not each figure |
| Web app | Every menu page for every role at 1280 px and 390 px: no error screens, console errors, failed requests or sideways scrolling; forbidden pages refused; sign-out and deep link; Urdu right-to-left; keyboard focus on sign-in | PASS | 101 checks, 134 screenshots | D11 | See G (tablet, other browsers, form submissions in the browser) |
| Security | XSS stored and rendered, NUL/escape handling, no internals in errors, foreign keys, history cannot be deleted, secrets in logs or git | PASS | resilience suite; log scan found 0 secrets | D4 | No external penetration test |
| Resilience | Database outage → readiness 503, generic 500s; automatic recovery | PASS | readiness back to 200 five seconds after the database returned | — | — |
| Performance | 9 endpoints × 100 requests at 10 concurrent users | PASS | 0 errors; slowest p95 359 ms (90 days of lessons, 615 KB) | — | Not tested beyond 10 concurrent users or on server hardware |
| Deployment | systemd units, Caddyfile, backups | NOT TESTED | written, never run | — | Needs a Linux server |

## C. Test execution summary

**Commands and results (final run):**

| Where | Commands | Result |
|---|---|---|
| `Backend/` | `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build`, `npm audit`, `npx prisma migrate status` | all exit 0 |
| root | `npx vitest run`, `npx vite build`, `npm audit` | all exit 0 |
| root | lint | not run: the web app has no lint configuration |

**How the numbers reconcile:**
- **Backend automated tests:** 152 = 140 existing + 12 new regression tests. Every test ran; none were skipped.
- **Frontend automated tests:** 11, all run.
- **End-to-end checks:** 374. One check is one recorded test, and many of them loop over sub-cases. For example, one access-control check covers 10 students × 3 endpoints × 2 ways of referring to a record, for one role.

  | Suite | Checks |
  |---|---|
  | fixtures | 15 |
  | auth | 58 |
  | rbac | 86 |
  | academic | 37 |
  | fees | 28 |
  | messaging | 18 |
  | campus | 17 |
  | browser | 101 |
  | resilience | 14 |
  | **Total (all passed in the final run)** | **374** |

- **Not run:** nothing in the suites above was skipped. Items that couldn't be tested are listed in G.

**Earlier failures and limitations:**
- **Earlier runs failed for test-side reasons too:** mistakes in my harness, TOTP codes reused across test processes (correctly refused by the server), the QA API restarting mid-run, and a lack of memory caused by Docker Desktop. These were fixed or rerun; they aren't app defects.
- **Browser coverage:** headless Edge only, at 1280 × 800 and 390 × 844.

## D. Defect register

All defects below are fixed. "Shown failing" means the regression test was run against the code before the fix and failed, then passed after it.

| ID | Severity | Defect | Root cause | Fix | Regression test | Retest |
|---|---|---|---|---|---|---|
| D1 | High | Timestamps were stored hours off when the PostgreSQL server's time zone isn't UTC. A locked-out user was told to wait 5 h 45 min (`Retry-After: 20700`) instead of at most 15 min, and the retry delay for failed messages was wrong. | The Prisma Postgres adapter sends times without an offset; the server reads them in its own time zone (here Asia/Calcutta) | Every database connection uses `TimeZone=UTC` (`src/database/prisma.ts`) | `tests/integration/timestamps.test.ts`; the test database now runs in Asia/Kolkata | Shown failing, now passes. Back-off measured at about 60 s. |
| D2 | Medium | The MFA policy API could make MFA optional for Admin, Principal or Mentor | No minimum in `setMfaPolicy` | `MFA_BASELINE` refuses with 422 | `mfa-recovery.test.ts` | Shown failing, now passes |
| D3 | High (CI) | `npm test` exited 0 even when tests failed | `async-exit-hook` (from `embedded-postgres`) calls `process.exit(0)` on `beforeExit` | `tests/globalSetup.ts` keeps vitest's failure code | Throwaway failing test | Failing run exits 1, passing run exits 0 |
| D4 | Low | A NUL character in a path, query or body, or an undecodable `%`-escape, gave a 500 error, including on sign-in without an account | PostgreSQL rejects NUL in text; Express `URIError` wasn't mapped | `rejectNulBytes` middleware; `URIError` → 400 | `auth.test.ts` "malformed input" | Shown failing, now passes |
| D5 | Low | 2015-02-30 was silently stored as 2 March, and 2026-13-45 gave a 500 on exam, fee and hostel routes | `Date.parse` accepts overflowing days; three routes had no validity check | Shared `IsoDate` schema with a calendar round-trip check, used by all routes | `students.test.ts` | Shown failing, now passes |
| D6 | Medium | In a joint exam, a mentor who wasn't the examiner could enter marks for students of another mentor's halqa | The permission check allowed teaching *any* of the exam's halqas, then accepted every student of every halqa | Non-examiner mentors may mark only students of halqas they teach | `assessments.test.ts` | Shown failing, now passes |
| D7 | Medium | Students admitted on the 29th–31st were never invoiced for that month, which breaks the "bill the current month in full" rule | Admission cut-off hard-coded to day 28 | Uses the last day of the billing month | `fees.test.ts` | Shown failing, now passes |
| D8 | High | Two refunds sent at the same moment could exceed the payment: ₹700 was refunded on a ₹400 payment | The refundable amount was checked before taking the lock, from a stale read | Check and reserve inside the locked transaction. Online refunds are reserved before the gateway call and released if it declines. | `fees.test.ts`: concurrent refunds, declined refund | Shown failing, now passes. Black-box: 1 of 2 concurrent refunds succeeds. |
| D9 | High | If processing a gateway confirmation failed, for example on a brief database error, the gateway's retry was answered "duplicate" and the family's money was never credited | The event was recorded before processing; any repeat counted as a duplicate | A repeat is reprocessed unless the first attempt finished. Safe because processing locks the attempt and one payment per attempt is enforced. | `fees.test.ts` | Shown failing, now passes. Black-box: a forced failure, then the retry credits exactly once. |
| D10 | Medium | A fee reminder stated the balance when it was queued, so after a partial payment it said ₹498 when ₹398 was owed | The amount was rendered into the message at queue time | The balance is filled in from the live invoice at send time, including on retries | `notifications.test.ts` | Shown failing, now passes |
| D11 | Low | The Principal's and Warden's staff records appeared, were counted ("8 active" instead of 6) and could be assigned as mentors | The web app treated every staff record as a mentor | The staff API marks teaching staff (`teaches`); the web app lists only those | `people-access.test.ts`; browser check | Passes; the Mentors page shows 6 active |

**Change made at your request (not a defect):** Docker was removed. The Dockerfile, `.dockerignore` and compose file are deleted, and `deploy/madarsa-api.service`, `deploy/madarsa-worker.service` and a rewritten `docs/DEPLOYMENT.md` replace them.

## E. Security findings

**Confirmed vulnerabilities, all fixed:**
- **D8 and D9 (High):** payment integrity. Money could be over-refunded, or an online payment lost.
- **D2 (Medium):** MFA could be made optional for mandatory roles.
- **D6 (Medium):** a mentor could change marks of students outside their halqas.

None of these exposed data to other families. Every access-control check that would show such exposure passed:
- Parent A cannot see or pay for Parent B's children by URL, id, admission number, search, list, fee, report-card or payment endpoint.
- Mentors see only their halqas, and wardens only hostel fields.
- Nobody can grant themselves roles, and unknown fields are ignored.

**Verified controls:**
- Brute-force limits; sessions revoked on logout, password change, reset, role change and MFA reset.
- CSRF defences, no CORS for foreign origins, security headers.
- MFA: replay protection, secrets encrypted at rest, an administrator can't read anyone's secret, recovery messages contain no enrollment material.
- Library: content-type checks, generated storage keys, no overwrite, every download authorised.
- Stored HTML and scripts render as text (XSS attempt didn't execute).
- Errors are generic, with no stack traces or SQL.
- No passwords, TOTP secrets, cookies, CSRF tokens or link tokens in the 15 MB QA log.
- No secrets in git history; `npm audit` clean.

**Weaknesses still open (no exploit shown):**
- **Account lockout:** anyone who knows a user's sign-in name can lock that account for 15 minutes with 8 wrong passwords. This is a standard trade-off.
- **Shared network:** the per-IP limit (30 sign-ins per 15 minutes) could block a whole school behind one shared IP address. Set `TRUST_PROXY` correctly in production.
- **Uploads:** not scanned for malware. Files are checked by content but not scanned.
- **No independent penetration test** has been done.

## F. External integrations

| Integration | Status |
|---|---|
| Payment gateway | Tested with the development gateway, which uses real HMAC-signed webhooks. The Razorpay signature check is covered by a unit test. **Live/sandbox Razorpay: BLOCKED** (no account). |
| Email | Tested by writing messages to disk and by forcing send failures. **Real SMTP: BLOCKED** (no provider). |
| WhatsApp / SMS | Not built. Messages for these channels are recorded as skipped, never as sent (verified). |
| File storage | Local disk tested. **S3: NOT TESTED** (no bucket). |
| Background jobs | pg-boss verified: schedules stored in PostgreSQL, survive a restart, idempotent jobs, retries with back-off. |
| Monitoring | Health endpoints verified, including during a database outage. External error reporting and alerts aren't configured. |

## G. Remaining risks and what's needed to finish testing

| Item | Status | Needed |
|---|---|---|
| Razorpay | BLOCKED | A Razorpay test-mode account and keys; then run checkout, webhooks and refunds end to end |
| Email delivery | BLOCKED | An SMTP provider with SPF/DKIM set up; send a test of every message type |
| Deployment (systemd, Caddy, backups, HTTPS, Caddy security headers) | NOT TESTED | A Linux server and a staging domain; follow `DEPLOYMENT.md`, then rerun the end-to-end suite against it |
| S3 storage, malware scanning | NOT TESTED | A bucket; a decision on ClamAV or the provider's scanning |
| Tablet width, Firefox, Safari, real phones | NOT TESTED | Manual checks on real devices (only desktop and phone widths in Edge were automated) |
| Form submissions *through the browser* (add student, pay fees, record a lesson) | PARTIAL | The same actions were tested through the API, and the pages were checked for rendering. Click-through checks of each form are still to do. |
| Screen readers, colour contrast | PARTIAL | Automated label checks found no unlabeled inputs or nameless buttons. Screen-reader testing and contrast measurement weren't done. |
| Load above 10 concurrent users | NOT TESTED | Production-like hardware |
| Real data | NOT TESTED | An import or entry of the Madarsa's records, then a review of every dashboard figure against them |

**Smaller observations, not fixed:**
- **Library file names:** non-English letters in uploaded file names become `_`, so an Urdu file name loses its text. The title is unaffected.
- **Admin label:** the Admin's sidebar label says "Muhtamim (Principal)", which is confusing now that Principal is a separate role.
- **Lessons response size:** the lessons endpoint returns up to 90 days in one response (615 KB today). This is fine at this size, but it will grow.
- **Message throughput:** the worker sends 50 messages a minute, so a report run for every family takes a few minutes.
- **Missed reports:** a scheduled report is skipped if the worker is down for its whole scheduled day. There's no catch-up.
- **Possible early-morning dating (found by reading the code, not by a test):** changing a student's halqa, and the mentor's 1-day lesson-edit window, use the UTC date. Between midnight and 05:30 India time they may therefore count the previous day.

## H. Production readiness

**3. Staging candidate.** The core functions and security controls are verified in an isolated test environment, and every defect found is fixed with a regression test. Production needs the items in G first:
- the live email and payment providers,
- the deployment on a real server,
- a review with the Madarsa's real data.

This audit doesn't certify the system or guarantee that it's free of other defects.
