# Al Farooquia School of Quran — Madarsa Management System (Demo)

An interactive, mobile-first frontend prototype for presenting a Madarsa management product to an owner and management team. Every number comes from one shared, fictional dataset stored in the browser. Nothing is sent to a server.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` produces a static `dist/` folder you can host anywhere (it needs SPA fallback to `index.html`).

## Sign-in (real backend)

Sign-in now goes through the backend in [Backend/](Backend/README.md): server sessions, role-based two-step verification (TOTP), password reset, invitations and lost-authenticator recovery. Start the backend as described in its README, then run `npm run dev` here. The dev accounts and their password are listed in [Backend/README.md](Backend/README.md#dev-accounts-from-npm-run-db-seed). Administrator, Principal and Mentor accounts set up an authenticator app at their first sign-in.

**Migration in progress:** sign-in, accounts (**Users & Access**) and **Account security** are server-backed. The other screens still show the fictional in-browser dataset described below. A signed-in user sees the demo record for their role until each module moves to the API. Principal and Warden see only their account page until their dashboards are built. The old Demo Mode role switcher has been removed.

## Suggested presentation flow

1. Admin dashboard: KPIs, action centre, charts.
2. Attendance overview, then Fees.
3. Open Abdullah Khan's profile.
4. As the mentor, record Abdullah's pending Sabaq for today.
5. As the student, open My Learning Journey to see the new record and target.
6. As the parent, review Abdullah's progress (and switch to Maryam).
7. Open Fees and use **Pay fees (demo)**.
8. Watch the outstanding balance drop to zero and the receipt appear.
9. Preview the monthly progress report (print / save as PDF).
10. Back as admin: collections, reminders queue and activity log have all updated.

## What's included

- Role-based dashboards for admin, mentor, student and parent, with separate navigation for each role.
- Students: search, filters, add/edit with validation, and a tabbed profile (overview, attendance, Sabaq, exams, fees, guardian, hostel).
- Mentors: directory, profiles, assigning a mentor to a halqa, active/inactive status.
- Attendance: daily marking (present, late, absent, excused), halqa summaries, a heatmap, monthly summaries and repeated-absence alerts.
- Record Sabaq: Sabaq, Sabqi, Manzil, Nazira and Qaida. Ayah ranges are checked against real Surah lengths, the Juz is worked out automatically and the next target is suggested.
- Learning journey with Juz and Qaida milestones, plus a parent learning report with areas to improve and practice to do at home.
- Exams: schedule, test creation, marks entry with validation, an editable grading scale (Mumtaz … Rasib) and printable report cards.
- Fees: plans, concessions, partial payments, receipts, CSV exports and a simulated parent checkout.
- Fee reminders: a configurable schedule, message template, preview and "mark as sent". A student drops off the queue once their dues are cleared.
- Hostel: rooms and beds (a bed can never be assigned twice), resident directory, night roll call and alerts where class and hostel attendance don't match.
- Digital library: search, categories, access rules, two bundled sample PDFs and an upload form that works for the current session only.
- Reports in 8 types with date and halqa filters, CSV export and print.
- A simulated activity log and in-app notifications.
- Settings: Madarsa name, Arabic name, currency and weekly holiday.

## Project structure

```
src/
  app/            App + routes (role gates)
  components/     ui kit, layout shell, charts, badges, error boundary
  constants/      branding config, labels, navigation
  context/        DemoStore (reducer + localStorage), toasts
  data/           Quran reference data, fictional people, seed generator
  features/       sabaq, fees, students (shared feature components)
  hooks/          scope (parent child selection), URL query state, smooth scroll
  pages/          auth, admin, mentor, student, parent, shared
  services/       selectors — all derived statistics
  utils/          dates, currency formatting, CSV
```

Branding lives in `src/constants/config.js` and the logo at `public/brand/al-farooquia-logo.jpg`. The seed generator is deterministic, so a reset always restores the same dataset relative to today's date.

## Libraries

React 18 + Vite, Tailwind CSS 3, React Router 6, Framer Motion (page, card, dialog and progress animations, which respect reduced-motion), Recharts, Lucide icons, and Lenis for gentle wheel smoothing on desktop only.

Animate UI is a copy-in shadcn/TypeScript component registry rather than an npm package, so its effects were built directly with Framer Motion to avoid pulling in a second component system. No package called "Tenor/Tenzer Scroll" could be identified, so Lenis is used as the specified fallback.

## Honest limitations

This is a static frontend prototype.

- Sign-in, sessions and MFA are enforced by the backend. Restrictions on the screens that still use demo data are only checks in the browser until those modules move to the API.
- Payments are a demonstration: no card or bank details are collected and no money moves.
- Reminders and notifications are never transmitted by SMS, WhatsApp, email or push.
- Uploaded library files last only for the current browser tab.
- The activity log can be reset and is not a tamper-proof audit trail.
- All names, phone numbers and emails are fictional.

A production rollout would need its own phases: a secure backend (e.g. MERN), real authentication and authorisation, payment and messaging integrations, file storage, backups and data migration.

## Languages (English / اردو)

Switch with the **EN / اردو** control on the login screen, in the header (wider phones and up) or under **More** on a phone. The choice is remembered on that device. Urdu switches the whole layout to right-to-left and uses Noto Naskh Arabic for body text, with Noto Nastaliq Urdu for headings.

- Translations live in `src/i18n/ur.js`, keyed by the English text. Any missing key falls back to English, so nothing disappears.
- Mentor comment templates, notifications, target phrases and Surah names (shown in Arabic script) are translated too.
- Names, addresses, library titles and descriptions, activity-log descriptions, report table columns and CSV exports stay in English. So does anything a user types.
