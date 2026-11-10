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
| How lessons are measured | Sabaq, Sabqi, Manzil and Nazira all record the Para and the amount in safah, in quarter steps up to 100. Exact position (Surah and ayah) is not recorded | open: the owner asked for safah on Sabaq; confirm it also suits Sabqi, Manzil and Nazira |
| Library tables holding data | The migration stops instead of dropping them | decided by CR-01 (they were empty everywhere this was run) |

## Staff attendance and kiosk (6 Nov 2026)

The kiosk specification refers to existing HR, payroll, leave, QR and staff attendance modules. Staff attendance and QR did not exist, so they were built. The others weren't, because no rules were given.

**Defaults taken:**

- Lateness: someone who arrives after the grace time is late by the full time since the shift start. With 10 minutes of grace, arriving 12 minutes after the start counts as 12 minutes late, and arriving 9 minutes after counts as on time.
- *Exempt* staff still have attendance recorded and are not counted late or early. Their absent days are still reported, with an exempt flag, so payroll can decide what the exemption means.
- Expected days are days up to today except the weekly off.
- Static QR codes are off by default.
- A session open longer than 20 hours closes as *Missed check-out* with no hours counted. An administrator can correct it.
- Resetting a kiosk from its own hidden menu needs no administrator code. It only removes that device's registration; it can't record anything.
- Location limits use allowed network addresses, not GPS, because a browser's reported location can be faked.

- Two attendance records of one person can't overlap, because worked hours would count twice. Records that only touch are allowed.

**Open decisions:**

- Leave types and balances: not built. Reviewers mark absent days as paid on each payslip.
- Payroll defaults the owner may want changed (owner's instruction: "keep it admin configurable"): accountants prepare, administrators approve; Principal and CA have no payroll access; a month can be approved from its last day; staff joining mid-month are not prorated automatically (absent days before joining are not counted, and pay is otherwise the full month); no tax or statutory calculation is built in, these are defined as pay items if wanted.
- Absent days are an upper limit until holidays (CR-01 step 3) and leave exist.
- Whether the kiosk needs Urdu, staff photos or the madrasa logo. None are there now.
- Whether staff who have no smartphone need a printed static QR, which is less secure, or a different method.
- WhatsApp is not connected, so kiosk codes are shown on screen only.

## QA audit (6 Nov 2026)

Results are in [QA/](../../QA/16-Production-Readiness-Report.md).

- **Warden MFA:** `CLAUDE.md` says MFA is mandatory for every staff role, and the code let Wardens skip it. The code now follows `CLAUDE.md`, so existing Wardens set up an authenticator at their next sign-in. This was the open question from CR-01.
- **Starting madrasa:** someone with several madrasas and no home madrasa starts in the one created first, not the first by name. The switcher lists them in the same order.

## CR-02 (Halaqa, Mureeds, public website)

Documented defaults; see `CR-02-PLAN.md`.

- Applications go to the Principal alone. A madrasa with no Principal has nobody who can read them.
- Madrasa Admin runs Halaqas and drafts website content; the Principal alone publishes, reads Mureed records and decides applications.

Open decisions:

- CAPTCHA: Cloudflare Turnstile or similar, if the honeypot, form token and rate limits prove too weak.
- Whether anyone besides the Principal should ever be allowed to read private Mureed notes or applications, such as a named deputy.
- Urdu on the public website.
- Retention period for applications: off (0 days) until the owner sets one, and the privacy notice wording should be reviewed by someone who knows the applicable law.
