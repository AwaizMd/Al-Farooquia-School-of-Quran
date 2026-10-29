# MMS Backend

Express 5 + TypeScript API and background worker for the Al Farooquia Madarsa Management System. It uses PostgreSQL through Prisma 7, Zod validation, and pg-boss for scheduled jobs.

- Deployment, backups, secret rotation and providers: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Security controls and known limitations: [docs/SECURITY.md](docs/SECURITY.md)
- QA audit (30 Oct 2026): what was tested, defects found and fixed, what remains: [docs/QA-REPORT.md](docs/QA-REPORT.md)
- API reference: http://localhost:4000/api/docs when `API_DOCS_ENABLED=true` (OpenAPI 3.1 at `/api/docs/openapi.json`)

## Run locally

Requirements: Node.js 22.12 or newer. You don't need a system PostgreSQL: development and tests run PostgreSQL 17 from the `embedded-postgres` npm package.

```bash
cd Backend
npm install
cp .env.example .env        # then fill TOKEN_HMAC_KEY and MFA_ENCRYPTION_KEYS (see comments in the file)
npm run db:start            # terminal 1: local PostgreSQL on 127.0.0.1:54320, keep it running
npm run db:deploy           # apply migrations
npm run db:seed             # development data (see below)
npm run dev                 # terminal 2: API on http://localhost:4000
npm run dev:worker          # terminal 3: scheduled jobs (invoices, reminders, reports, message delivery)
```

Then run `npm run dev` in the repository root for the web app (http://localhost:5173). Vite forwards `/api` to the backend.

- Development emails are written to `Backend/.local/outbox/`.
- Uploaded library files go to `Backend/storage/`.
- `PAYMENT_PROVIDER=dev` enables a test payment gateway, which sends real signed webhooks but moves no money.
- `npm run db:stop` stops a PostgreSQL left running after its terminal closed.

### Development data (`npm run db:seed`)

The seed loads fictional data, never real data, and refuses to run in production:

- **People:** the 32 students, 23 guardians and 9 staff from the web app's demo dataset.
- **Activity:** 30 school days of attendance and lessons, plus exams and results.
- **Fees:** four months of invoices and payments.
- **Campus:** hostel rooms and residents, and the library with two sample PDFs.

It also creates one sign-in per role. The password for all of them is `farooquia-dev-only`.

| Role | Sign in with | MFA |
|---|---|---|
| Administrator | admin@farooquia.demo | mandatory: set up at first sign-in |
| Principal | principal@farooquia.demo | mandatory |
| Mentor (Hifz Halqa A) | mentor@farooquia.demo | mandatory |
| Warden | warden@farooquia.demo | optional |
| Parent (Abdullah and Maryam) | parent@farooquia.demo | optional |
| Student (Abdullah Khan) | S-1001 (admission number) | optional |

## Scripts

| Script | What it does |
|---|---|
| `npm test` | 152 unit, integration and security tests against a throwaway PostgreSQL (never the dev database) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run build` | Compile to `dist/` |
| `npm start` / `npm run worker` | Run the compiled API / worker |
| `npm run db:migrate` | Create a migration after editing `prisma/schema.prisma` (development only) |
| `npm run db:deploy` | Apply pending migrations (the only command for production) |
| `npm run create-admin -- --email … --name "…"` | First administrator + one-time setup link (`node dist/cli/create-admin.js` in production) |
| `npm run mfa:break-glass -- --user … --reason "…"` | Emergency authenticator reset when no administrator can sign in |
| `node scripts/gen-quran.mjs` | Regenerate the Quran reference data from the web app's copy |

## Layout

```
src/
  app.ts, server.ts, worker.ts   HTTP app, API process, background worker
  config/env.ts                  validated configuration (refuses unsafe production settings)
  policies/students.ts           row-level access: who may see which student
  modules/
    auth, mfa, users             sign-in, sessions, MFA, recovery, accounts, roles
    students, staff              students, guardians, halqas, mentors, fee plans
    attendance, learning         daily registers, Sabaq/Sabqi/Manzil/Nazira/Qaida records
    assessments                  exams, marks, versioned grading, report cards
    fees                         invoices, payments, receipts, refunds, online checkout, webhooks
    notifications                in-app notices, delivery queue, fee reminders, settings
    scheduled-reports            parent progress reports
    hostel, library              rooms/beds/roll call, catalogue and private files
    audit-logs                   append-only activity log
  integrations/                  mail (SMTP/file), payments (dev, Razorpay), storage (disk, S3)
  jobs/registry.ts               background jobs and their schedules
prisma/                          schema, reviewed SQL migrations, development seed
tests/                           unit, integration and security suites
```

## Business rules in force

These are the defaults approved for this build. Each is noted in the code where it applies.

- **Attendance:** present / late / absent / excused, and no automatic "absent". Mentors mark their own halqas for today; earlier days need `attendance.correct` and a reason.
- **Lessons:** each category must match the student's track, and ayah ranges are checked against the Quran data. A second record on the same day gives a warning, not a block. Records are never overwritten.
- **Grading:**

  | Grade | Minimum score |
  |---|---|
  | Mumtaz | 85% |
  | Jayyid Jiddan | 70% |
  | Jayyid | 55% |
  | Maqbool | 40% |
  | Rasib | below 40% |

  Results are visible to families only after they're published, and each published exam keeps its grading version.
- **Fees:**
  - Monthly invoices are issued on the 1st and due on the 10th; a new admission is billed for the current month in full.
  - Concessions are 10% (sibling), 50% (need-based) or 100% (sponsorship), rounded to ₹10, and approved by an administrator.
  - Payments go to the oldest invoice first, and overpayment at the office is refused.
  - Receipt numbers restart each April–March financial year.
  - A change to a fee plan affects future invoices only.
- **Reminders:** 3 days before, on the due date, and 3 and 7 days after (editable), at 09:00 Asia/Kolkata, at most once per stage. The balance is re-checked before each send.
- **Parent reports:** monthly on the 1st at 09:00, covering the previous month (weekly is optional).
