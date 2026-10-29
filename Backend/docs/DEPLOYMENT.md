# Deployment and operations

This guide covers one production server running everything directly on the host: PostgreSQL 17, the API and the background worker as systemd services, and Caddy for HTTPS. Docker is not used. The service and web-server files are in [`deploy/`](../../deploy).

> **Status:** the systemd units and the Caddyfile are written but **have not been run yet**. Do the first deployment on a staging domain.

## 1. Server prerequisites

- Ubuntu 24.04 LTS (or similar), with 2 vCPU and 4 GB RAM. That's plenty for one Madarsa.
- Node.js 22.12 or newer, PostgreSQL 17 (from the PGDG apt repository) and Caddy 2 (from its apt repository).
- A domain name pointing at the server. Only ports 80 and 443 should be open; PostgreSQL listens on localhost only.

```bash
sudo useradd --system --home /srv/madarsa --shell /usr/sbin/nologin madarsa
sudo mkdir -p /srv/madarsa/app /srv/madarsa/web /srv/madarsa/storage /etc/madarsa
sudo chown -R madarsa:madarsa /srv/madarsa
```

## 2. Configuration

Create `/etc/madarsa/env` with owner root, group madarsa and mode 640. Never commit it. Start from [`Backend/.env.example`](../.env.example) and set:

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://madarsa_app:<password>@127.0.0.1:5432/madarsa` (the restricted role from step 3) |
| `APP_BASE_URL` / `CORS_ORIGINS` | `https://your-domain` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `1` (behind Caddy) |
| `TOKEN_HMAC_KEY` | 32 random bytes, base64 |
| `MFA_ENCRYPTION_KEYS` / `MFA_ACTIVE_KEY_VERSION` | `1:<32 random bytes, base64>` / `1` |
| `MAIL_TRANSPORT` / `SMTP_URL` / `MAIL_FROM` | `smtp` and your provider's SMTP URL |
| `PAYMENT_PROVIDER` | `none` until the gateway is live, then `razorpay` plus the three `RAZORPAY_*` values |
| `STORAGE_DRIVER` / `STORAGE_DIR` | `local` and `/srv/madarsa/storage`, or `s3` with the `S3_*` values |
| `API_DOCS_ENABLED` | `false` |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The API refuses to start with unsafe production settings: insecure cookies, no CORS origins, file-based email, or the development payment gateway.

## 3. First deployment

```bash
# 1. Database: an owner role for migrations (the app gets a restricted role in step 3)
sudo -u postgres psql -c "CREATE ROLE madarsa_owner LOGIN PASSWORD '<owner password>';"
sudo -u postgres psql -c "CREATE DATABASE madarsa OWNER madarsa_owner ENCODING 'UTF8' TEMPLATE template0;"

# 2. Code, builds and migrations
sudo -u madarsa git clone <repository> /srv/madarsa/app
cd /srv/madarsa/app
sudo -u madarsa npm ci && sudo -u madarsa npm run build        # web app, into dist/
sudo cp -r dist/. /srv/madarsa/web/
cd Backend && sudo -u madarsa npm ci && sudo -u madarsa npm run build
sudo -u madarsa DATABASE_URL='postgresql://madarsa_owner:<owner password>@127.0.0.1:5432/madarsa' npx prisma migrate deploy

# 3. Restricted application role (once)
sudo -u postgres psql -d madarsa -c "
  CREATE ROLE madarsa_app LOGIN PASSWORD '<app password>';
  GRANT USAGE ON SCHEMA public TO madarsa_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO madarsa_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO madarsa_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE madarsa_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO madarsa_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE madarsa_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO madarsa_app;
  REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM madarsa_app;
  CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION madarsa_app;"

# 4. Services and HTTPS (put your domain in the Caddyfile first)
sudo cp deploy/madarsa-api.service deploy/madarsa-worker.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now madarsa-api madarsa-worker
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

The worker (pg-boss) creates its tables in the `pgboss` schema on first start.

### The first administrator

There is no public sign-up. Create the first administrator once, on the server:

```bash
cd /srv/madarsa/app/Backend
sudo -u madarsa bash -c 'set -a; . /etc/madarsa/env; node dist/cli/create-admin.js --email office@your-domain --name "Office Administrator"'
```

The command prints a one-time setup link, valid for 72 hours. The administrator uses it to set a password, then sets up an authenticator at first sign-in. Invite everyone else from **Users & Access**.

## 4. Updating

```bash
cd /srv/madarsa/app && sudo -u madarsa git pull
sudo -u madarsa npm ci && sudo -u madarsa npm run build && sudo cp -r dist/. /srv/madarsa/web/
cd Backend && sudo -u madarsa npm ci && sudo -u madarsa npm run build
sudo -u madarsa DATABASE_URL='postgresql://madarsa_owner:<owner password>@127.0.0.1:5432/madarsa' npx prisma migrate deploy
sudo systemctl restart madarsa-api madarsa-worker
```

Apply migrations with `prisma migrate deploy` only. Never run `migrate dev` or `db push` against production. Each migration is reviewed SQL in `Backend/prisma/migrations`.

## 5. Backups and restore

Back up three things, and store them **separately**:

1. **Database:** run a nightly `pg_dump`, for example from cron, and keep at least 30 days.
   ```bash
   sudo -u postgres pg_dump -Fc madarsa > /var/backups/madarsa-$(date +%F).dump
   ```
2. **Uploaded files:** `/srv/madarsa/storage`, or the S3 bucket's versioning and replication.
3. **Secrets:** `/etc/madarsa/env`. Store it away from the database dumps, because `MFA_ENCRYPTION_KEYS` must never sit next to the data it protects.

To restore, create a fresh database and load the latest dump into it:

```bash
sudo -u postgres pg_restore -d madarsa --clean --if-exists /var/backups/madarsa-YYYY-MM-DD.dump
```

Test a restore on a separate machine at least once a term.

## 6. Rotating secrets

| Secret | How | Effect |
|---|---|---|
| `TOKEN_HMAC_KEY` | Replace it and restart the API and the worker | Everyone is signed out. Outstanding invitation, reset and recovery links and **recovery codes** stop working; users can generate new codes in Account security |
| `MFA_ENCRYPTION_KEYS` | Add `2:<new key>` to the list, set `MFA_ACTIVE_KEY_VERSION=2` and restart | New and re-enrolled authenticators use key 2. Keep key 1 until every user has re-enrolled, then remove it |
| Database passwords | Run `ALTER ROLE ... PASSWORD`, update `/etc/madarsa/env` and restart | None |
| `RAZORPAY_*`, `SMTP_URL`, `S3_*` | Rotate in the provider dashboard, update `/etc/madarsa/env` and restart | None |

## 7. External providers

- **Email (required):** use any SMTP provider (Amazon SES, Zoho, Brevo, Postmark…). Set `MAIL_TRANSPORT=smtp`, `SMTP_URL` and `MAIL_FROM`, and configure SPF and DKIM for the sending domain.
- **Razorpay:**
  1. Create API keys in the Razorpay dashboard and set the three `RAZORPAY_*` values.
  2. Add a webhook pointing to `https://<domain>/api/v1/payments/webhooks/razorpay` for the events `payment.captured`, `order.paid`, `payment.failed` and `refund.processed`, using `RAZORPAY_WEBHOOK_SECRET`.
  3. Test in **test mode** first. The adapter has not yet been run against a live Razorpay account.
- **WhatsApp / SMS:** not connected yet. Messages for these channels are recorded as skipped.
  - WhatsApp needs a Business account and approved message templates.
  - SMS in India needs DLT registration.
  - A provider adapter would go alongside `src/integrations/mail`.
- **File storage on S3/R2:** create a private bucket and keys limited to that bucket, then set `STORAGE_DRIVER=s3`. Downloads use 5-minute signed URLs.

## 8. Monitoring

- **Liveness:** `GET /api/v1/health/live` answers when the process is running.
- **Readiness:** `GET /api/v1/health/ready` answers when the database is reachable. Point an uptime monitor such as UptimeRobot or Better Stack at it.
- **Background jobs:** Settings → **Background jobs** shows each job's last success and error, and message delivery counts. The same data is at `GET /api/v1/admin/jobs`. Set an alert if `deliver-notifications` has not succeeded for 10 minutes.
- **Logs:** structured JSON on stdout, kept by journald (`journalctl -u madarsa-api -u madarsa-worker`). Secrets, cookies, tokens and codes are redacted. Forward the logs to a log service if needed.
- **External error reporting** (for example Sentry) is **not** configured. If you want it, add it in `src/server.ts`, `src/worker.ts` and the error handler.
