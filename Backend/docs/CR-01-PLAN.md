# CR-01 implementation plan

Change Request 01 covers multiple madrasas, courses and classes, holidays, namaz
tracking, removing Razorpay, accounts, analytics, parent graphs, new roles and
removing the library. `CLAUDE.md` records the rules that result from it.

## Order of work

The CR says the multi-madrasa migration comes first. Two steps go ahead of it because
they only delete code: removing Razorpay and removing the library. Doing them first
means there is less code to bring under madrasa scoping.

| Step | Scope | Status |
|---|---|---|
| 0a | Remove Razorpay and the online gateway: code, environment variables, webhook route, `PaymentAttempt`/`WebhookEvent`, Razorpay columns in payment settings, frontend, docs | done |
| 0b | Remove the digital library: module, `LibraryResource`, the `LIBRARY` file purpose, frontend, seed data, tests | done |
| 1 | Organization, madrasas, memberships, roles and permission matrix, madrasa context and Prisma scoping extension, per-madrasa settings and feature flags, the expand → backfill → contract migration, the madrasa switcher in the UI, isolation tests | done |
| 2 | Courses, subjects, classes, enrollments (capacity, transfer, promotion, CSV bulk add) | todo |
| 3 | Holiday calendar and the `isWorkingDay` service; effect on attendance | todo |
| 4 | Fees: cash and cheque (with bounce), UPI and bank transfer with verification, per-madrasa receipt series | todo |
| 5 | Namaz tracking, with the parent screen and summaries | todo |
| 6 | Accounts: chart of accounts, journal, period lock, reports, CA access | todo |
| 7 | Daily summary tables, Principal and Committee dashboards, parent progress graphs | todo |
| 8 | Custom admission fields, copying settings between madrasas, scheduled-report holiday rules | todo |

## Data model decisions

### Organization
`Organization` is a single row. It replaces the brand fields that used to live in
`institution_settings`.

### Madrasa
`Madrasa` has a uuid `id` and a unique short `code`. It has a one-to-one
`MadrasaSettings` row:
- currency, timezone, weekly off and fee due day become typed columns;
- everything else goes in `config` (JSONB), checked against a Zod schema in `src/tenancy/settings.ts`.

### Scoped tables
Every campus table gets a `madrasa_id`.
- **Root tables** (students, groups, exams, fee plans, hostel rooms, settings and similar): the scoping extension fills in `madrasa_id` from the request's active madrasa.
- **Child tables** (attendance records, invoices, payments, exam marks and similar): a `BEFORE INSERT` trigger copies `madrasa_id` from the parent row. If a value was supplied and it differs from the parent's, the trigger raises an error. This keeps a child and its parent in the same madrasa even if application code gets it wrong.

### Scoping extension (`src/tenancy/`)
- An `AsyncLocalStorage` context holds the madrasa ids for the request: `{ ids, active }`.
- Reads on a scoped model add `madrasaId IN ids`.
- Writes add `madrasaId = active`. A write without a single active madrasa throws.
- A query on a scoped model with no context also throws.
- `asOrg(reason, fn)` is the explicit, greppable way to run an organization-wide query.

### Request context
The `resolveMadrasa` middleware works out which madrasas the caller can use:
- `SUPER_ADMIN`: all madrasas;
- other staff: their active, unexpired memberships;
- parents: their children's madrasas;
- students: their own madrasa.

The `X-Madrasa-Id` header has to name one of those madrasas, or the request gets a
404. The caller's permissions come from their roles **in the active madrasa**, plus
their organization-level roles.

### Roles
- `ADMIN` is renamed to `MADRASA_ADMIN`, using `ALTER TYPE … RENAME VALUE` so no rows are lost.
- During the backfill, every existing admin also gets `SUPER_ADMIN`.
- Staff roles move from `user_roles` into `madrasa_memberships` for the default madrasa.

### Uniqueness
These constraints become per-madrasa:
- admission number: `(madrasaId, admissionNo)`
- halqa code
- fee plan code
- hostel room code
- receipt number: `(madrasaId, series, number)`

Usernames stay unique across the whole organization, because they are sign-in names.

## Migration (expand → migrate → contract)

1. **Expand.**
   - Add `organizations`, `madrasas`, `madrasa_settings`, `madrasa_features` and `madrasa_memberships`.
   - Add a nullable `madrasa_id` to every scoped table.
2. **Backfill.**
   - Create the organization and a default madrasa from `institution_settings`, with code `MAIN`.
   - Set `madrasa_id` on every existing row.
   - Move staff roles into memberships, and give existing admins `SUPER_ADMIN`.
3. **Contract.**
   - Make `madrasa_id` `NOT NULL`, then add indexes, foreign keys, the per-madrasa unique constraints and the triggers.
   - `institution_settings` is kept, read-only, until the next release. No data is dropped.

`tests/integration/migration.test.ts` runs the three steps against a database seeded
in the pre-CR shape and checks that every row was kept and assigned.

## Step 1 results

- Tests: backend 178 (lint and typecheck clean); frontend 23. They include the madrasa isolation suite and the migration test.
- Browser walkthrough on seeded data with two madrasas: 25 of 25 checks pass.
- The development database was migrated: madrasa MAIN, with its halqas and fee plans; the admin is now a Super Admin.
- Remaining from §1: custom admission fields, and copying holidays (step 3). Copying settings from another madrasa is done.

## Risks

- **Raw SQL bypasses the extension.** Only row locks (`FOR UPDATE` by id) and sequences use raw SQL. Each one runs after a scoped lookup has already found the row. Any new raw SQL must filter on `madrasa_id` by hand.
- **Nested `include`s are not filtered by the extension.** The triggers guarantee that children share their parent's madrasa, so this does not leak data.
- **Background jobs run outside a request.** Every job loops over the madrasas with `withMadrasa(id, …)`.
