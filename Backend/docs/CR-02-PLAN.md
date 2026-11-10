# CR-02: Halaqa & Mureed management and the public website

Owner's request: Halaqa and Mureed management for the Principal, and a separate, SEO-friendly public website in Next.js (`public-website/`), connected to this backend. No second backend, no second database.

## What already exists and is reused

| Need | Reused |
|---|---|
| Tenancy | `src/tenancy` (scoped Prisma models, `madrasa_link` triggers, `lockRow`) |
| Permissions | `permissions.ts`, `requirePermission`, `requireRecentAuth` |
| Audit | `audit.service.ts` |
| Email and in-app messages | `NotificationDelivery` outbox, `notifyUsers` |
| Files | `integrations/storage`, `common/fileTypes` (content sniffing) |
| Rate limits | `common/rateLimit` (PostgreSQL counters) |
| Device-style authentication outside the session | The kiosk router pattern |
| QR scanning | The kiosk camera scanner |

## Decisions where the request meets what exists

1. **"Halqa" already means something.** The existing `Group` model is the academic class, shown as "Halqa", and is what student attendance, mentors and fees hang on. The new module is separate (`halaqas` table, "Halaqa Programs" in the menu), so that regular academic attendance stays untouched. Halaqa attendance has its own tables, as requested.
2. **Principal-only applications.** New permissions are granted to `PRINCIPAL` alone: not to Madrasa Admin and not to Super Admin. If a madrasa has no Principal, applications wait unread; Super Admin sees only that a madrasa has no Principal, never the applications.
3. **Private notes.** A separate permission, granted to `PRINCIPAL` alone, and every read is audited.
4. **QR attendance for people with no account.** External participants and Mureeds have no login, so a signed QR is issued per participant (a printable card) and the teacher scans it during a session. It holds only a signed reference. Cards can be revoked.
5. **Photographs and content.** No stock photos and no invented history, mission, staff or achievements are added. A page or section with no published content does not appear. The Principal adds real content in the CMS. The design works with no photographs.
6. **Anti-bot.** A honeypot, a signed minimum-time form token, and rate limits per site and address. CAPTCHA needs an outside service and keys; Cloudflare Turnstile can be added later and is listed as an open decision.
7. **Languages.** English and Arabic with right-to-left layout, as requested. Content has optional Arabic fields and falls back to English. Urdu is not in this request.
8. **Host to madrasa mapping.** `SiteDomain` maps a hostname to one madrasa. The Next.js server calls the API with a server-only `PUBLIC_SITE_TOKEN` and the request's host; the browser never sends a madrasa ID, and the API ignores any it receives.
9. **Accounts on approval.** Approval creates or links a student or participant record. It never creates a login, as requested.
10. **Admissions conversion.** Approval of an admission needs a class (`Group`), chosen by the Principal in the review. Fee plan and guardian account stay with the office, as they are today.

## Data

| Table | Purpose |
|---|---|
| `halaqa_categories`, `halaqas` | Programs, schedule, public fields, attendance rules |
| `halaqa_participants` | One person: optional link to a student (unique), Mureed flag, profile. Duplicates are matched on student, phone or email |
| `halaqa_memberships`, `participant_events` | Join and leave dates, transfers, history |
| `halaqa_sessions`, `session_materials` | One-off and recurring sessions, notes, files |
| `halaqa_attendance`, `halaqa_attendance_corrections` | Session attendance and its history |
| `mureed_entries`, `mureed_private_notes` | Meetings, follow-ups, communications; private notes |
| `halaqa_messages` | Announcements and reminders sent through the outbox |
| `site_settings`, `site_domains`, `site_items`, `site_assets` | Branding, forms, hostnames, CMS content, public images |
| `applications`, `application_documents`, `application_events` | Public submissions, private files, review history |

## API

- `/halaqa/*`, `/mureeds/*`: staff, by permission, in the madrasa context.
- `/site/*`: CMS and settings, by permission.
- `/applications/*`: Principal only.
- `/public/*`: no session. Needs the site token. Madrasa comes from the host. Returns only published, explicitly public fields.

## Phases and status

| # | Phase | Status |
|---|---|---|
| 1 | Halaqa and Mureed backend and screens | Built, tested |
| 2 | Public website frontend (Next.js) | Built, tested locally |
| 3 | Public registration forms and backend | Built, tested |
| 4 | Principal application dashboard | Built, tested |
| 5 | CMS | Built, tested |
| 6 | Security, privacy, multi-madrasa tests | API tests pass; no outside penetration test |
| 7 | End-to-end tests, deployment preparation | Local end-to-end run; deployment files written but never run on a server |

## Hosting needs (owner)

A server or VPS (the existing plan), one domain or subdomain per madrasa pointed at it, and an email provider. `deploy/` gets a `madarsa-website.service` and a Caddy block.
