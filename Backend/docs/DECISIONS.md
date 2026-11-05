# Decisions and open questions

When the change requests leave something undecided, this project builds the stated
default and lists the question here. Rows marked **open** need an answer from the
madrasa's committee, administration or CA.

## CR-01

| Topic | Default built | Status |
|---|---|---|
| Donations and 80G receipts | Out of scope; the chart of accounts will leave room for them | open |
| Tally export | Excel/CSV only. A Tally-importable format would first need checking against Tally's documentation | open |
| GST on fees | None, because fees are for education | open: the CA must confirm |
| Who may waive or refund fees | Madrasa Admin and Super Admin only, not the Accountant | open |
| Refunds | Paid back by the office (cash, cheque or transfer) and complete when recorded; there is no gateway | decided by CR-01 |
| Guardians with children in several madrasas | One guardian record and one parent account. A madrasa can link a guardian only if one of its own students already has that guardian. Linking a sibling admitted in a second madrasa to the existing parent account currently needs a Super Admin | open: a phone-number lookup across the organization is a possible improvement |
| Staff working in several madrasas | One account, with a separate staff record and membership in each madrasa | decided |
| Old `institution_settings` table | Copied into the organization and madrasa `MAIN`, then kept read-only and unused. It can be dropped in a later release | decided |
| Audit entries from before CR-01 | Keep `madrasaId` empty (the log is append-only). Super Admins see them | decided |
| Admission numbers and staff codes | Still drawn from one sequence across the organization, so they never repeat; uniqueness is enforced per madrasa | decided |
| Job schedules | All madrasas share one schedule, in the first madrasa's timezone. Each madrasa works out "today" in its own timezone | open, if a madrasa outside India is added |
| Committee drill-down to individual students | Off unless the madrasa sets `committeeCanViewStudents` | decided by CR-01 |
| Library tables holding data | The migration stops instead of dropping them | decided by CR-01 (they were empty everywhere this was run) |
