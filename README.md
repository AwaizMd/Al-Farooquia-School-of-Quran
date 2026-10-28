# Al Farooquia School of Quran — Madarsa Management System

A mobile-first web app for running a Madarsa. It serves administrators, the Principal, mentors, wardens, students and parents, in English and Urdu (right-to-left).

| Part | Where | Stack |
|---|---|---|
| Web app | this folder (`src/`) | React 18, Vite 7, Tailwind CSS 3, React Router 7, Framer Motion, Recharts |
| API and background worker | [`Backend/`](Backend/README.md) | Node.js 22, Express 5, TypeScript, PostgreSQL 17 (Prisma 7), pg-boss |
| Deployment | [`deploy/`](deploy) and [`Backend/docs/DEPLOYMENT.md`](Backend/docs/DEPLOYMENT.md) | Docker Compose, Caddy (HTTPS) |

## Run it locally

```bash
# API (see Backend/README.md for first-time setup)
cd Backend && npm install && npm run db:start   # keep running
cd Backend && npm run db:deploy && npm run db:seed && npm run dev
cd Backend && npm run dev:worker                # optional: scheduled jobs

# Web app
npm install
npm run dev                                     # http://localhost:5173
```

Sign in with one of the development accounts listed in [Backend/README.md](Backend/README.md#development-data-npm-run-dbseed); all use the password `farooquia-dev-only`. Administrator, Principal and Mentor accounts set up an authenticator app (Google or Microsoft Authenticator) at first sign-in.

`npm run build` produces `dist/`, which Caddy serves in production with `/api` proxied to the backend.

## Tests

```bash
npm test                     # web app: renders every page for every role against a fake API
cd Backend && npm test       # API: 140 unit, integration and security tests on a throwaway database
```

## What each role can do

- **Administrator:**
  - Manages students (admissions, guardians, halqas, concessions), mentors and halqa assignments.
  - Handles attendance corrections, exams and grading, fees (invoices, office payments, adjustments, refunds) and reminders.
  - Runs the hostel and library, reports, the activity log, institution settings, the parent-report schedule and background jobs.
  - Manages accounts, roles and MFA resets.
- **Principal:** reads everything academic and operational, including fees, reports and the activity log, and can correct attendance. Has no settings, account or security administration.
- **Mentor:**
  - Sees only the halqas currently assigned to them.
  - Marks today's attendance, records Sabaq/Sabqi/Manzil/Nazira/Qaida, and schedules tests and enters marks.
  - Can add library resources.
- **Warden:** manages hostel rooms, beds, transfers and the night roll call, seeing residents' hostel details only.
- **Parent:**
  - Sees each linked child (and can switch between them): attendance, lessons and targets, mentor feedback, published results and report cards, fees and receipts, and notifications.
  - Pays fees online, and receives scheduled progress reports.
- **Student:** sees their own learning journey, records, results, fees and library.

Every rule above is enforced by the API: a hidden button is never the only protection. See [Backend/docs/SECURITY.md](Backend/docs/SECURITY.md).

## How the web app gets its data

`src/api/` is the only code that talks to the server. After sign-in, the records the account is allowed to see are loaded into an in-memory cache (`src/context/DemoStore.jsx`), and the screens compute their figures from it with `src/services/selectors.js`. Every change is sent to the API first, and the affected data is then reloaded. Nothing is stored in the browser apart from the language choice.

`src/data/` keeps the fictional demo dataset. It is used only to seed development databases and by the tests; it is not part of the production bundle.

## Before going live

These still need real accounts or decisions from the Madarsa:

1. **Email:** an SMTP provider for invitations, password resets, reminders and reports. This is required.
2. **Razorpay:** a merchant account, then testing in test mode. Until then, online payment shows "pay at the office".
3. **WhatsApp or SMS (optional):** a provider, approved templates, and DLT registration for SMS in India.
4. **Hosting:** a VPS and domain. The deployment files have not been run yet.
5. **Real data:** the people records, entered through the app or imported.

## Languages (English / اردو)

Switch with the **EN / اردو** control on the sign-in screen, in the header, or under **More** on a phone. Urdu switches the layout to right-to-left. Translations live in `src/i18n/ur.js`, keyed by the English text; any missing key falls back to English. Names, addresses, library titles, activity-log text and CSV exports stay in English, as does anything a user types.
