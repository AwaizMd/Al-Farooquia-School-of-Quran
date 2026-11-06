# Production readiness

## Final status: NOT READY — high-risk issues remain

The parts that exist are in good shape: nothing critical was found in them, and every defect found is fixed. It's not ready because the system has never been deployed, backups have never been restored, the kiosk has never run on a real phone, the office cannot make money corrections from the screens, and most of what you plan to use it for (payroll, accounts, namaz, holidays) isn't built.

**Date:** 6 November 2026
**Code:** branch `backend-phase-1-2`, commit `253bb66`, plus the uncommitted Sabaq-in-safah, kiosk and QA fixes in the working tree
**Environment:** Windows 11, Node 22, local PostgreSQL 17 (embedded). A separate database (`madarsa_audit`), API on port 4100, web on port 5174, headless Edge. Mail went to files. Demo data only.
**Not touched:** production (none exists yet). Development data was not used for testing.

## Assessment

| # | Area | Result | Why |
|---|---|---|---|
| 1 | Functional completeness | **Not met** | Payroll, HR, leave, bank payments, accounts, namaz, holidays, courses and classes aren't built (see [02](02-Feature-Inventory.md)). |
| 2 | Business logic accuracy | Met for what exists | Fees, attendance, exams and hostel rules checked through the API and the database. |
| 3 | Financial calculation accuracy | Met for fees | Whole paise only; totals equal the ledger; concurrent payments and approvals credit once. Payroll and accounts don't exist. |
| 4 | Attendance reliability | Met, on simulated hardware | One check-in from 20 simultaneous scans. Overlapping records now refused (QA2-01). Absent days are an upper limit until holidays and leave exist. |
| 5 | QR kiosk security | Met on tests | Forged, replayed, revoked and cross-madrasa codes all refused. A rotating QR can't prove the person is physically there. |
| 6 | Payroll correctness | **Not testable** | Not built. No rules have been given. |
| 7 | Accounting integrity | **Not testable** | Not built. |
| 8 | Multi-madrasa isolation | Met | API and database triggers both hold; 404 across madrasas. |
| 9 | Role permissions | Met | Every route checked against every role: 34 checks passed. |
| 10 | Data integrity | Met | Constraints, triggers, append-only ledger and audit log verified. |
| 11 | Application security | Met on local tests | Injection, XSS, uploads, mass assignment and sessions held. No outside penetration test. HTTPS and production headers not run. |
| 12 | Performance | **Partly met** | Each request is fast, even with 3,000 students. But the app downloads everything at startup: 6.6 seconds for an admin on this machine with large data (QA2-O08). |
| 13 | Mobile usability | Mostly met | No sideways scroll on any screen. Small text links remain (QA2-O05). Not tried on real phones. |
| 14 | Error handling | Met | No server error on any route with junk input. |
| 15 | Backup and recovery | **Not met** | Documented, but never run: `pg_dump` isn't available here. |
| 16 | Operational monitoring | **Not met** | Health endpoints exist. No alerting has been set up, and no deployment has run. |

## What must happen before real use

1. **Deploy to a staging server** with HTTPS, and run the setup in [DEPLOYMENT.md](../Backend/docs/DEPLOYMENT.md). It has never been run.
2. **Back up and restore** on that server, and confirm the restored copy works.
3. **Try the kiosk on a real Android phone**, following [KIOSK.md](../Backend/docs/KIOSK.md).
4. **Add screens for refunds, invoice corrections and invoice issuing** (QA2-O01). Today these work only through the API.
5. **Connect real email,** and test delivery. WhatsApp and SMS aren't connected.
6. **Decide and build what you need for the first term,** from CR-01 steps 2 to 8 and payroll.

## Decisions needed from you

- Payroll rules: salary structures, deductions, exemptions and approval. Nothing can be built or tested until these exist.
- What refunds should do to a part-paid invoice (the current order is by due date).
- Whether the kiosk needs Urdu, photos or a logo.
- What staff with no smartphone should do.

