# MMS Backend

Express 5 + TypeScript API for the Al Farooquia Madarsa Management System, with PostgreSQL via Prisma 7.

## Run locally

Requirements: Node.js 22.12 or newer. You don't need Docker or a system PostgreSQL: development and tests run PostgreSQL 17 from the `embedded-postgres` npm package.

```bash
cd Backend
npm install
cp .env.example .env        # then fill TOKEN_HMAC_KEY and MFA_ENCRYPTION_KEYS (see comments in the file)
npm run db:start            # terminal 1: local PostgreSQL on 127.0.0.1:54320, keep it running
npm run db:deploy           # apply migrations
npm run db:seed             # institution settings + one dev account per role
npm run dev                 # terminal 2: API on http://localhost:4000
```

Then run `npm run dev` in the repository root for the web app (http://localhost:5173). Vite forwards `/api` to the backend, so cookies stay same-origin.

- API docs: http://localhost:4000/api/docs (when `API_DOCS_ENABLED=true`)
- Development emails are written to `Backend/.local/outbox/` instead of being sent.
- `npm run db:stop` stops a PostgreSQL that was left running after its terminal closed.

### Dev accounts (from `npm run db:seed`)

The password for all of them is `farooquia-dev-only`.

| Role | Sign in with | MFA |
|---|---|---|
| Administrator | admin@farooquia.demo | mandatory: set up at first sign-in |
| Principal | principal@farooquia.demo | mandatory |
| Mentor | mentor@farooquia.demo | mandatory |
| Warden | warden@farooquia.demo | optional |
| Parent | parent@farooquia.demo | optional |
| Student | S-1001 (admission number) | optional |

## Scripts

| Script | What it does |
|---|---|
| `npm test` | Unit, integration and security tests against a throwaway PostgreSQL (separate from dev data) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run db:migrate` | Create a new migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply pending migrations (use this in production) |
| `npm run mfa:break-glass -- --user <email> --reason "<why>"` | Emergency authenticator reset when no administrator can sign in |

## Security model

- **Sessions:** a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed when secure). Only its HMAC is stored, so a database leak alone cannot be replayed as a session.
  - Staff timeouts: 30 minutes idle, 12 hours maximum.
  - Families: 24 hours idle, 30 days maximum.
  - A session is cancelled on sign-out, on password change or reset, on deactivation, on a role change and on an MFA reset.
- **CSRF:** state-changing requests must be JSON, come from an allowed `Origin`, and echo the session's `X-CSRF-Token`.
- **Passwords:** Argon2id. Sign-in errors are identical for unknown accounts, wrong passwords, and invited or disabled accounts, and unknown accounts take the same time to fail.
- **Rate limits:** counters stored in PostgreSQL, keyed per IP and per account, on sign-in, MFA, password reset and links.
- **MFA (TOTP):**
  - Mandatory or optional per role, editable by administrators and enforced on the server.
  - Accounts with several roles follow the strictest role.
  - Secrets are AES-256-GCM encrypted with versioned keys and bound to their database row.
  - Each code works once (replay protection), and 5 wrong codes end the attempt.
  - 10 single-use recovery codes, stored as hashes only.
- **Lost authenticator:**
  - Starts with an administrator's reset, which needs a fresh password and code confirmation plus a recorded reason.
  - The reset immediately cancels the old authenticator and every session.
  - The user then needs a single-use link (to a verified email, 30 minutes) or an in-person ticket (15 minutes), **plus their own password**, before a new QR code is shown.
  - No message ever contains a secret or QR code.
- **Audit log:** append-only. A database trigger rejects UPDATE and DELETE.

## Production notes

- Set `NODE_ENV=production`, `COOKIE_SECURE=true`, `MAIL_TRANSPORT=smtp` and `SMTP_URL`. The app refuses to start otherwise.
- Serve the web app and `/api` from the same origin behind HTTPS (for example with Caddy) and set `TRUST_PROXY=1`.
- Give the app a PostgreSQL role without TRUNCATE on `audit_logs`, and run migrations with a separate owner role.
- Keep `MFA_ENCRYPTION_KEYS` out of database backups.
  - To rotate: add a new key version, switch `MFA_ACTIVE_KEY_VERSION`, and keep the old version until all secrets are re-encrypted.
  - Rotating `TOKEN_HMAC_KEY` signs everyone out and voids outstanding links and recovery codes.
