# Security controls

This document lists what is implemented and tested, and what is not. Installing common middleware does not by itself make an application secure, so each control below names where it is enforced.

## Implemented

| Area | Control | Where / tested by |
|---|---|---|
| Authentication | Argon2id passwords; identical errors and timing for unknown, wrong, invited and disabled accounts | `modules/auth`, `tests/integration/auth.test.ts` |
| Brute force | PostgreSQL-backed rate limits per IP and per account on sign-in, MFA, password reset, links and re-authentication | `common/rateLimit.ts` |
| Sessions | Random 256-bit token in an `HttpOnly`, `SameSite=Lax`, `Secure` (`__Host-`) cookie; only its HMAC is stored; idle and absolute expiry; revoked on sign-out, password change or reset, deactivation, role change and MFA reset; new token on every privilege change (no fixation) | `modules/auth/session.service.ts` |
| CSRF | State changes must come from an allowed Origin, be JSON (except the authorised raw upload route) and carry the session's `X-CSRF-Token` | `middleware/auth.ts` |
| MFA | TOTP (RFC 6238), mandatory for Admin, Principal and Mentor (configurable, strictest role wins), optional for others; secrets AES-256-GCM encrypted with versioned keys bound to their row; codes single-use per time step; 5 failures end the attempt; hashed single-use recovery codes; QR shown once | `modules/mfa`, `tests/integration/auth.test.ts` |
| MFA recovery | Admin reset needs a fresh password and code plus a reason; it revokes the authenticator and sessions immediately, then a single-use link to a verified email or an in-person ticket **plus the user's password** is required before a new QR; messages never contain secrets; concurrent resets serialised; everything audited | `tests/security/mfa-recovery.test.ts` |
| Authorization | Permissions per role in code; every student query passes one row-level scope (all / taught halqas / linked children / self / hostel residents); records projected per access level; out-of-scope records return 404 | `policies/students.ts`, `tests/security/people-access.test.ts` |
| Mass assignment | Zod schemas strip unknown fields on every endpoint | all routes |
| Money | Integer minor units; balances computed on the server; immutable payments, allocations, receipts and adjustments (database triggers); invoice amounts fixed after issue; row locks prevent double allocation; gapless receipts | `modules/fees`, `tests/integration/fees.test.ts` |
| Online payments | Server-set amounts; only HMAC-verified webhooks confirm; unique event ids (replays are no-ops); a second "paid" event for an order never credits twice; amount/currency mismatches are not credited | `modules/fees/payments.service.ts` |
| Files | Type checked by content (magic bytes) and declared type; size limit; generated storage keys (no user-controlled paths, traversal refused); never overwritten; private storage; every download authorised; `Content-Disposition: attachment` and `nosniff` | `modules/library`, `tests/integration/hostel-library.test.ts` |
| Integrity in the database | Unique and partial unique indexes (one mark per student per day, one bed per student and student per bed, one active authenticator, one open concession…) and check constraints on ratings, marks and money | migrations |
| Audit | Append-only audit log (database trigger rejects UPDATE and DELETE); private values (medical notes, addresses, phone numbers) are never copied into it; browser-side exports recorded | `modules/audit-logs` |
| Data exposure | Generic 500 responses (no stack traces or SQL); structured logs redact cookies, tokens, passwords, codes and secrets; API responses `Cache-Control: no-store`; the web app keeps no records in browser storage | `middleware/errorHandler.ts`, `common/logger.ts` |
| Headers | Helmet on the API; HSTS, CSP, frame-ancestors, referrer and permissions policy in the Caddyfile | `app.ts`, `deploy/Caddyfile` |
| Configuration | Environment validated at start-up; production refuses insecure cookies, missing CORS origins, file-based email and the development payment gateway | `config/env.ts` |
| Dependencies | `npm audit` reports 0 known vulnerabilities in the API and the web app (checked 2026-10-29) | — |

## Known limitations and remaining work

- **External services are not live yet:**
  - Razorpay order creation and refunds, the S3 storage adapter, and SMTP delivery are implemented but have not been run against live accounts.
  - WhatsApp and SMS are not connected.
- **No malware scanning** of uploads. PDFs and audio are content-checked but not scanned. Add ClamAV or the storage provider's scanning if staff will upload files from outside sources.
- **Uploads through local storage** are only as safe as the server's disk and backups. Prefer a private S3/R2 bucket in production.
- **The deployment files have not been run.** The Dockerfile, compose file and Caddyfile are written but untested in this environment.
- **No external error reporting or alerting.** Monitoring relies on the health endpoints and the background-job panel.
- **Students without email** depend on the office for password resets and in-person MFA recovery, by design.
- **Rate limits** are fixed-window. That's adequate for one institution, but they're not a defence against a large distributed attack; put the site behind Cloudflare or similar if that becomes a concern.
- **The browser holds the signed-in account's own records in memory** while it's open. Signing out clears them. A shared computer should still be signed out after use.
- **No independent penetration test** has been done.
