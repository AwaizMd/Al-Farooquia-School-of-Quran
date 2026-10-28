# Deployment and operations

This guide covers one production server: a VPS running Docker Compose with Caddy for HTTPS, the API, the background worker and PostgreSQL 17. The files are in [`deploy/`](../../deploy).

> **Status:** the compose file, Dockerfile and Caddyfile are written but **have not been run yet**; this development environment had no working Docker. Do the first deployment on a staging domain.

## 1. Server prerequisites

- Ubuntu 24.04 LTS (or similar), 2 vCPU and 4 GB RAM is plenty for one Madarsa
- Docker Engine and the Compose plugin
- A domain name pointing at the server; ports 80 and 443 open

## 2. Configuration

Create `deploy/.env.production` on the server. Never commit it. Start from [`Backend/.env.example`](../.env.example) and set:

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://madarsa_app:<password>@postgres:5432/madarsa` (the restricted role from step 3) |
| `POSTGRES_OWNER_PASSWORD` | long random value (database owner, used only for migrations) |
| `APP_BASE_URL` / `CORS_ORIGINS` | `https://your-domain` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `1` (behind Caddy) |
| `TOKEN_HMAC_KEY` | 32 random bytes, base64 |
| `MFA_ENCRYPTION_KEYS` / `MFA_ACTIVE_KEY_VERSION` | `1:<32 random bytes, base64>` / `1` |
| `MAIL_TRANSPORT` / `SMTP_URL` / `MAIL_FROM` | `smtp` and your provider's SMTP URL |
| `PAYMENT_PROVIDER` | `none` until the gateway is live, then `razorpay` plus the three `RAZORPAY_*` values |
| `STORAGE_DRIVER` | `local` (files kept in the `storage` volume) or `s3` with `S3_*` |
| `API_DOCS_ENABLED` | `false` |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The API refuses to start with unsafe production settings: insecure cookies, no CORS origins, file-based email, or the development payment gateway.

## 3. First deployment

```bash
# 1. Build the web app (on the server or in CI)
npm ci && npm run build            # creates ./dist, served by Caddy

# 2. Start the database and apply migrations (as the owner role)
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d postgres
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production run --rm migrate

# 3. Create the restricted application role (once)
docker compose -f deploy/docker-compose.prod.yml exec postgres psql -U madarsa_owner -d madarsa -c "
  CREATE ROLE madarsa_app LOGIN PASSWORD '<app password>';
  GRANT USAGE ON SCHEMA public TO madarsa_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO madarsa_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO madarsa_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO madarsa_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO madarsa_app;
  REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM madarsa_app;
  CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION madarsa_app;"

# 4. Start everything
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d
```

The worker (pg-boss) creates its own `pgboss` schema on first start.

### The first administrator

There is no public sign-up. Create the first administrator once, from the server:

```bash
docker compose -f deploy/docker-compose.prod.yml exec api node dist/cli/create-admin.js --email office@your-domain --name "Office Administrator"
```

It prints a one-time setup link (valid 72 hours). The administrator sets a password with that link, then sets up an authenticator at first sign-in. Everyone else is invited from **Users & Access**.

## 4. Updating

```bash
git pull && npm ci && npm run build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production run --rm migrate
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d
```

Migrations are applied with `prisma migrate deploy` only. Never use `migrate dev` or `db push` against production. Each migration is reviewed SQL in `Backend/prisma/migrations`.

## 5. Backups and restore

Back up three things, and store them **separately**:

1. **Database:** run a nightly `pg_dump` and keep at least 30 days.
   ```bash
   docker compose -f deploy/docker-compose.prod.yml exec -T postgres pg_dump -U madarsa_owner -Fc madarsa > backup-$(date +%F).dump
   ```
2. **Uploaded files:** the `storage` volume (or the S3 bucket's versioning/replication).
3. **Secrets:** `deploy/.env.production`. Keep it apart from the database dumps, because `MFA_ENCRYPTION_KEYS` must never be stored next to the data it protects.

To restore, use a fresh database and then the latest dump:

```bash
docker compose -f deploy/docker-compose.prod.yml exec -T postgres pg_restore -U madarsa_owner -d madarsa --clean --if-exists < backup-YYYY-MM-DD.dump
```

Test a restore on a separate machine at least once a term.

## 6. Rotating secrets

| Secret | How | Effect |
|---|---|---|
| `TOKEN_HMAC_KEY` | Replace and restart API + worker | Everyone is signed out; outstanding invitation, reset and recovery links and **recovery codes** stop working (users can generate new codes in Account security) |
| `MFA_ENCRYPTION_KEYS` | Add `2:<new key>` to the list, set `MFA_ACTIVE_KEY_VERSION=2`, restart | New and re-enrolled authenticators use key 2. Keep key 1 until every user has re-enrolled, then remove it |
| Database passwords | `ALTER ROLE ... PASSWORD`, update `.env.production`, restart | None |
| `RAZORPAY_*`, `SMTP_URL`, `S3_*` | Rotate in the provider dashboard, update, restart | None |

## 7. External providers

- **Email (required):** any SMTP provider (Amazon SES, Zoho, Brevo, Postmark…). Set `MAIL_TRANSPORT=smtp`, `SMTP_URL` and `MAIL_FROM`. Configure SPF/DKIM for the sending domain.
- **Razorpay:**
  1. Create API keys in the Razorpay dashboard and set the three `RAZORPAY_*` values.
  2. Add a webhook pointing to `https://<domain>/api/v1/payments/webhooks/razorpay` for the events `payment.captured`, `order.paid`, `payment.failed` and `refund.processed`, using `RAZORPAY_WEBHOOK_SECRET`.
  3. Test in **test mode** first. The adapter has not yet been run against a live Razorpay account.
- **WhatsApp / SMS:** not connected yet; messages for these channels are recorded as skipped.
  - WhatsApp requires a Business account and approved message templates.
  - SMS in India requires DLT registration.
  - A provider adapter goes alongside `src/integrations/mail`.
- **File storage on S3/R2:** create a private bucket and keys limited to that bucket, and set `STORAGE_DRIVER=s3`. Downloads use 5-minute signed URLs.

## 8. Monitoring

- **Liveness:** `GET /api/v1/health/live` (the process is running).
- **Readiness:** `GET /api/v1/health/ready` (the database is reachable). Point an uptime monitor such as UptimeRobot or Better Stack at it.
- **Background jobs:** Settings → **Background jobs** shows each job's last success and error, and message delivery counts (also available at `GET /api/v1/admin/jobs`). Alert if `deliver-notifications` has not succeeded for 10 minutes.
- **Logs:** structured JSON on stdout (`docker compose logs api worker`). Secrets, cookies, tokens and codes are redacted. Forward them to a log service if needed.
- **External error reporting** (for example Sentry) is **not** configured. Add it in `src/server.ts`, `src/worker.ts` and the error handler if wanted.
