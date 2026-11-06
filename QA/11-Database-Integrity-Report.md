# Database integrity

| Check | Result |
|---|---|
| All foreign keys valid | Pass |
| Every campus table has `madrasaId` NOT NULL, except `audit_logs` and `notification_deliveries` | Pass; those two allow organization-level rows, by design |
| Triggers refuse cross-madrasa rows | Pass; also stopped this audit's own test data |
| Money columns are integers | Pass |
| One attendance mark per student per day | Pass |
| One open staff session per person | Pass, database rule |
| Overlapping staff sessions | Failed, now refused in the service (QA2-01). **There is no database rule for this one.** |
| Admission numbers unique | Pass |
| Concurrent registers, payments, bed assignments | Pass |
| Deleting a student with history | Refused |
| Ledger and audit log append-only | Pass |
| Migrations apply to an empty database; no failed migrations | Pass (67 tables) |
| Backup and restore | **Blocked:** `pg_dump` and `pg_restore` aren't part of the embedded PostgreSQL here. Must be done on staging. |
| Transaction rollback on a failed multi-step change | Covered by tests of refusals; not fault-injected |

