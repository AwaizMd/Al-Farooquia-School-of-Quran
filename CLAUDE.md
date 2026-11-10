# Madarsa Management System (MMS): project rules

This file is the single source of truth for how this project is built. If code and
this file disagree, fix one of them in the same change. Change requests (CR) amend
it; the latest CR wins where they conflict.

## Repository

| Path | What |
|---|---|
| `Backend/` | Express 5 + TypeScript API and pg-boss worker, Prisma 7 (PostgreSQL 17), Zod 4, Vitest |
| `Frontend/` | React 18 + Vite 7 + Tailwind 3 + Recharts SPA, talks only to `/api/v1` |
| `public-website/` | Next.js public website (SEO). Separate app, **no database of its own**: reads and writes only through `/api/v1/public` |
| `deploy/` | systemd units + Caddy. **No Docker** (owner's decision). |
| `Backend/docs/` | Architecture, roles & permissions, payments, accounts, security, deployment |

The CR documents mention NestJS, `packages/shared`, shadcn and S3. They map onto this
repository as follows (do not introduce those frameworks):

| CR term | Here |
|---|---|
| NestJS guard | Express middleware in `Backend/src/middleware/` |
| `@RequiresFeature(...)` | `requireFeature('HOSTEL')` middleware |
| `packages/shared` permission matrix | `Backend/src/modules/auth/permissions.ts` (authoritative); the frontend mirrors it only to hide navigation |
| shadcn charts | Recharts via `Frontend/src/components/charts/` |
| S3 | `Backend/src/integrations/storage` (local disk in dev, S3-compatible in production) |

## Non-negotiable rules

- **Authorization happens on the server.** Every route declares its permission
  (`requirePermission`) and every record read goes through a row-level scope
  (`policies/`). The frontend hides things for convenience only.
- **Madrasa isolation** (CR-01 §1): every campus table has `madrasaId`. Scoped Prisma
  models can only be queried inside a madrasa context (`src/tenancy/`); a query on a
  scoped model without one throws. Org-wide aggregate code is wrapped in `asOrg()`
  and must say why. A record of another madrasa is answered with **404**, never 403.
  The client's `X-Madrasa-Id` header is only a *selection*, validated against the
  caller's memberships on every request.
- **Money** is integer minor units (paise). Never floats, never trust an amount the
  client computed. The fee ledger is append-only: corrections are reversals/refunds.
  Accounts journal entries are immutable once posted; debits must equal credits.
- **A payment counts only when verified** by staff (UPI/bank transfer) or entered by
  the accountant (cash/cheque). There is **no payment gateway** (Razorpay removed in CR-01).
- **Audit** every state change that matters (`audit.service.ts`); the audit table is append-only.
- **Outbound messages** go through `NotificationDelivery` (the outbox) with a `dedupeKey`.
- **Secrets** never in code, logs, API responses or commits. `.env` is never committed.
- **Migrations** are forward-only via `npm run db:migrate`. Never drop a column or
  table that holds data without the owner's approval; use expand → migrate → contract.
- **Tests** accompany every feature, including cross-access tests (another family's
  child, another halqa, another madrasa → 404). `npm test` must stay green.
- Don't invent business rules. If something is undecided, implement the documented
  default and list it under *Open decisions* in `Backend/docs/DECISIONS.md`.

## Organization and madrasas (CR-01)

- One `Organization` (trust) runs several `Madrasa` campuses.
- `MadrasaMembership(userId, madrasaId, role, active, expiresAt)` gives a user a role
  *in one madrasa*. Roles can differ per madrasa.
- `UserRole` keeps only roles that are not tied to one madrasa: `SUPER_ADMIN`
  (all madrasas), `PARENT` and `STUDENT` (their madrasas come from the student links).
- Per-madrasa configuration: `MadrasaSettings` (typed, Zod-validated) and
  `MadrasaFeature` flags (`HOSTEL, FEES, ACCOUNTS, NAMAZ_TRACKING, STAFF_ATTENDANCE,
  ASSESSMENTS, SCHEDULED_REPORTS, BIOMETRIC`). A disabled feature is rejected by the API.

## Roles

| Role | Scope | Summary |
|---|---|---|
| SUPER_ADMIN | Organization | Manage madrasas, settings, features, org users; acts as madrasa admin everywhere |
| MADRASA_ADMIN | Madrasa | Full management of one madrasa |
| PRINCIPAL | Madrasa | Academic oversight, analytics with drill-down |
| COMMITTEE_MEMBER | Assigned madrasas | Read-only analytics, aggregates unless `committeeCanViewStudents` |
| CA | Assigned madrasas | Read-only accounts and exports; membership can expire |
| ACCOUNTANT | Madrasa | Fees, payments, accounts |
| MENTOR | Madrasa (own classes/halqas) | Attendance, Sabaq, marks, namaz (if enabled) |
| WARDEN | Madrasa | Hostel |
| PARENT | Linked children, any madrasa | Progress, holidays, holiday namaz, fee payments |
| STUDENT | Self | Own progress and holidays |

There is no `LIBRARIAN` role and no library module (removed in CR-01).
Permissions per role live in `permissions.ts`; check permissions, not role names.
MFA is mandatory for every staff and organization role (baseline cannot be lowered).

## Commands (from `Backend/`)

| | |
|---|---|
| `npm run db:start` | local PostgreSQL (embedded, port 54320) |
| `npm run dev` / `npm run dev:worker` | API on :4000 / worker |
| `npm run db:migrate` | create + apply a migration (dev) |
| `npm run db:setup` | organization, default madrasa, halqas, fee plans (no people) |
| `npm run create-admin -- --email … --name …` | first Super Admin invite |
| `npm test`, `npm run typecheck`, `npm run lint` | must all pass before committing |

Frontend (from `Frontend/`): `npm run dev` (:5173, proxies `/api`), `npm test`, `npm run build`.

Public website (from `public-website/`): `npm run dev` (:3100), `npm test`, `npm run typecheck`, `npm run build`. Needs `.env.local` with `MMS_API_URL` and the same `PUBLIC_SITE_TOKEN` as the API.

## Staff attendance and kiosks

- Android QR kiosk (a separate lightweight page, `Frontend/kiosk.html`) and staff attendance: `Backend/docs/KIOSK.md`.
- A kiosk authenticates with its own device cookie; the madrasa always comes from the device record, never from the client. Attendance is recorded only by the server after verifying a signed QR code. There is no offline attendance.
- Attendance only provides the monthly figures; salary deductions are worked out only in `Backend/src/modules/payroll/`, never in the kiosk or attendance code.

## Payroll

- `Backend/docs/PAYROLL.md`. Behind the `PAYROLL` feature flag (off by default). **Every rule is configured per madrasa and starts switched off**; never hardcode an allowance, deduction, tax or statutory rate.
- Approved payslips are immutable (database triggers); corrections are adjustments applied to a later month. Salary rows are append-only. Amounts never go in audit text.
- The app moves no money and creates no bank files. **Leave is not built**: reviewers mark absent days as paid by hand.

## Halaqa programs, Mureeds and the public website (CR-02)

- Plan and status: `Backend/docs/CR-02-PLAN.md`; how it works: `Backend/docs/PUBLIC-WEBSITE.md`.
- `Halaqa` programs are separate from the academic `Group` (shown as "Halqa"); Halaqa attendance is separate from student and staff attendance.
- **Applications are Principal-only**: `applications.*` is granted to `PRINCIPAL` alone, not to Madrasa Admin or Super Admin. Never widen this without the owner.
- **Private Mureed notes** need `mureeds.private_notes` (Principal alone); each read is audited and the text never enters the audit log.
- **Public API** (`/api/v1/public`): needs the server-only `PUBLIC_SITE_TOKEN`. The madrasa comes only from the hostname through `SiteDomain`; never from anything the client sends. Build public responses field by field from published content.
- Approval creates or links records; it never creates a login. Never add invented content or stock photographs to the website.

## Change requests

- **CR-01** (multi-madrasa, courses & classes, holidays, namaz, Razorpay removal,
  accounts, analytics, parent graphs, new roles, library removal): plan and status in
  `Backend/docs/CR-01-PLAN.md`.
