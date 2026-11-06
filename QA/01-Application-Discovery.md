# Application discovery

**Date:** 6 November 2026
**Code:** branch `backend-phase-1-2`, commit `253bb66`, plus the uncommitted Sabaq-in-safah, kiosk and QA fixes in the working tree
**Environment:** Windows 11, Node 22, local PostgreSQL 17 (embedded). A separate database (`madarsa_audit`), API on port 4100, web on port 5174, headless Edge. Mail went to files. Demo data only.
**Not touched:** production (none exists yet). Development data was not used for testing.

## What the application is

| Part | Technology | Size |
|---|---|---|
| API and worker | Express 5, TypeScript, Prisma 7, PostgreSQL 17, pg-boss, Zod 4 | 144 routes, 67 tables, 37 enums, 5 scheduled jobs |
| Web app | React 18, Vite 7, Tailwind 3, Recharts | 37 routes, 40 page files |
| Kiosk | Separate lightweight page, `kiosk.html` | 18 KB, plus a QR decoder loaded only when the phone needs it |
| Deployment | systemd and Caddy, no Docker | Written, never run |

The audit brief expects a MongoDB-style stack in places. This system uses PostgreSQL, so NoSQL tests were reduced to checking that operator objects are refused.

## What the brief assumes that doesn't exist

| In the brief | In the code |
|---|---|
| Salary, payroll, salary slips, bank files, reconciliation | Not built |
| HR manager, departments, staff documents, leave | Not built. Staff records and shifts exist. |
| Accounts, ledger, trial balance, balance sheet | Not built. Permissions exist, with nothing behind them. |
| Namaz and holiday tracking | Not built (CR-01 step 5) |
| Digital library | Removed on purpose in CR-01 |
| Branches as records | No. A kiosk has a free-text branch name; a madrasa is the campus unit. |
| Half-day, leave and holiday attendance | Attendance has its own statuses; no holiday calendar yet |
| Payment gateway | Removed on purpose in CR-01 |
| Parent self-registration | No. Accounts are created by invitation. |
| Account deletion | No. Accounts are deactivated, which keeps history. |
| Static QR download and printing | No. A static QR can be shown on the QR page if enabled. |
| WhatsApp and SMS | Not connected |

These are recorded as **not built**, never as passed.

## Frontend and backend compared

- **Buttons with no backend:** none. Every frontend call has a matching route.
- **Placeholder text, TODOs, empty click handlers:** none.
- **Dummy data in the live app:** none. `Frontend/src/data` holds Quran reference data and name helpers; the demo data comes from the seed script, which refuses to run in production.

**Backend features with no screen:**

| API | Effect |
|---|---|
| Refund, adjust or void an invoice; issue invoices by hand | **The office can't correct money from the app** (QA2-O01). Monthly issue runs on a schedule. |
| MFA policy | Can be changed only through the API |
| Notification preferences | Families can't choose from the app |
| Lesson revision history, attendance correction history, staff correction history, hostel history | Kept and audited, but can't be viewed |
| `/report-cards/:ref` | Unused: the report card page builds from exam results. Both tested. |
| `/org/permissions`, `/kiosk/device/forget`, health | Used by operators or not needed on screen |

**Settings with no effect:** the Namaz, Accounts and Biometric module switches. They now say *Not built yet* and can't be turned on (QA2-09). Six permissions (`accounts.*`, `analytics.*`) aren't checked by anything yet.

