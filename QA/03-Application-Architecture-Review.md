# Architecture review

**Good:**

- **Three layers keep madrasas apart:** the request's selected madrasa is checked against the caller's memberships; a Prisma extension refuses a scoped query with no madrasa; and database triggers refuse a row that points at another madrasa's parent. During testing, a trigger stopped this audit's own test data when it tried to do exactly that.
- **Money:** whole paise, an append-only ledger, one row lock per student, and database rules against changing payments.
- **Outbound messages** go through one outbox with a de-duplication key.
- **Kiosks** have separate credentials and routes, so a staff session can't act as a kiosk.

**Risks:**

- **One API server and one database.** That's fine at this size, but there's no failover, so backups matter (they haven't been tested).
- **Rate limits are stored in PostgreSQL,** so they hold across restarts and add a small database write per limited request.
- **Local file storage in development, S3 in production:** only the local driver has been tested.
- **The frontend loads a lot of data up front** for some roles (see [10](10-Performance-Report.md)).
- **Six permissions exist for modules that don't** (`accounts.*`, `analytics.*`). They're harmless, but a CA has almost nothing to see today.

