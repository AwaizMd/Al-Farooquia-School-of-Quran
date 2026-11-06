# Bug reports

**Date:** 6 November 2026
**Code:** branch `backend-phase-1-2`, commit `253bb66`, plus the uncommitted Sabaq-in-safah, kiosk and QA fixes in the working tree
**Environment:** Windows 11, Node 22, local PostgreSQL 17 (embedded). A separate database (`madarsa_audit`), API on port 4100, web on port 5174, headless Edge. Mail went to files. Demo data only.
**Not touched:** production (none exists yet). Development data was not used for testing.

Every bug was reproduced. Environment for all: audit stack above.

| ID | Severity | Priority | Title | Module | Status |
|---|---|---|---|---|---|
| QA2-01 | High | P1 | Overlapping attendance records double-count worked hours | Staff attendance | Fixed |
| QA2-02 | High | P1 | Warden accounts don't require MFA, against the project rule | Auth | Fixed |
| QA2-03 | Medium | P2 | A phone held up is rescanned, inflating refused and duplicate counts | Kiosk | Fixed |
| QA2-04 | Medium | P2 | Student page shows "Fee plan: undefined" to mentors | Students | Fixed |
| QA2-05 | Medium | P2 | A missing stored file gives a server error | Payments | Fixed |
| QA2-08 | Medium | P2 | A Super Admin opens on the alphabetically first madrasa | Madrasas | Fixed |
| QA2-09 | Medium | P2 | Switches for unbuilt modules look real | Madrasas | Fixed |
| QA2-06 | Low | P3 | Inverted date range returns an empty list, not an error | Staff attendance, kiosks | Fixed |
| QA2-07 | Low | P3 | A shift can start and end at the same time | Shifts | Fixed |
| QA2-10 | Low | P3 | Kiosk scan totals cut off; duplicates hidden | Kiosks | Fixed |
| QA2-11 | Low | P3 | Quick-note buttons in Record Sabaq are 28 px tall | Sabaq | Fixed |
| QA2-O01 | High | P1 | No screen for refunds, invoice adjustments, voiding or issuing | Fees | **Open** |
| QA2-O02 | Medium | P2 | No screen for MFA policy, notification preferences, correction and hostel history | Various | **Open** |
| QA2-O03 | High | P1 | Backup and restore never proven | Operations | **Open, blocked here** |
| QA2-O04 | High | P1 | Deployment, HTTPS and real mail never run | Operations | **Open** |
| QA2-O05 | Low | P3 | Small text links on phones | UI | **Open** |
| QA2-O06 | High | P1 | Kiosk not tried on a real Android phone | Kiosk | **Open, blocked here** |
| QA2-O07 | Medium | P2 | Kiosk and staff attendance pages have no Urdu | i18n | **Open** |
| QA2-O08 | Medium | P2 | The app downloads every student and lesson at startup | Web app | **Open** |

No critical bug was found.

## Details

### QA2-01: Overlapping records double-count hours
- **Role:** Madrasa or Super Admin. **Preconditions:** a staff member with a record 08:00–11:00.
- **Steps:** Staff Attendance → Add by hand, 09:00–10:00, any reason. `POST /staff-attendance/sessions`. Correcting a record onto another one did the same.
- **Expected:** refused. **Actual:** 201; 3 real hours became 240 minutes of work.
- **Frequency:** always. **Root cause:** only the "one open session" rule existed.
- **Fix:** `assertNoOverlap`, under a row lock, in `attendance.service.ts`. Answers 409 `SESSION_OVERLAP`. Records that merely touch (split shifts) are allowed.
- **Regression:** three tests in `kiosk.test.ts`; `a6-edges`.

### QA2-02: Warden MFA
- **Steps:** sign in as a Warden, or read `GET /admin/security/mfa-policy`. **Expected:** required, per `CLAUDE.md`. **Actual:** optional.
- **Root cause:** Warden was missing from `MFA_BASELINE`, and the first migration set it false.
- **Fix:** baseline, plus migration `20261106140000_warden_mfa`. **Effect: wardens must set up an authenticator at their next sign-in.**
- **Regression:** `mfa-recovery.test.ts`, `10-auth`.

### QA2-03: Repeated scans
- **Steps:** hold a used QR to the kiosk for a minute. **Expected:** one refusal. **Actual:** a refusal about every 4 seconds; 9 in under a minute.
- **Root cause:** the result screen cleared the memory of the last code. **Fix:** remember it after the screen clears, unless the code never reached the server.
- **Regression:** `kiosk-e2e` now requires at most 3 refusals.

### QA2-04: "Fee plan: undefined"
- **Steps:** sign in as a mentor, open a student. **Root cause:** mentors have no fee access, so the plan list is empty. **Fix:** hide the row. **Regression:** `a5-ui`.

### QA2-05: Missing stored file
- **Steps:** a QR or proof record whose file is gone. `GET /payments/upi-qr`. **Actual:** 500. **Expected:** 404, and a log line for the office.
- **Fix:** `readStored` in `storage.ts`. **Regression:** `payment-settings.test.ts`, `a1-matrix`.

### QA2-08: Wrong starting madrasa
- **Actual:** the Super Admin opened on Girls Campus rather than the main madrasa, and saw empty pages. **Root cause:** ordering by name. **Fix:** creation order. The switcher now also lists in that order.

### QA2-09: Unbuilt modules
- Namaz, Accounts and Biometric could be switched on and did nothing. **Fix:** they say *Not built yet* and are disabled unless already on.

### QA2-O01: No screen for money corrections
- The API for refund, adjust, void and issue is complete and tested, but no screen calls it. A wrong payment or invoice can't be corrected without a developer. Not built in this audit, because it's new screens on money that deserve your review first.

### QA2-O08: Everything is downloaded at startup
- **Evidence:** with 3,061 students and about 62,000 lessons in one madrasa, an admin's first page took 6.6 seconds on this machine with no network, made 89 API calls and used 160 MB of browser memory. A mentor took 3.5 seconds.
- **Effect:** slow on mobile data and old phones, growing every month. With today's demo size it doesn't show.
- **Root cause:** `loadActivity` and the student list page through all records, and screens filter in the browser. **Recommended fix:** load per screen, with server-side filters. It touches most screens, so it wasn't rushed here.

## Test mistakes corrected during the audit

These were faults in the tests, not the app, and are listed so the record is honest. The first XSS test wrote to a wrong column and hid the error, so it proved nothing until rewritten. The first scale test failed to add data and so measured nothing; it was fixed and rerun. Older suites still expected Razorpay, the old `ADMIN` role and the library. Running suites at once caused false MFA failures.

