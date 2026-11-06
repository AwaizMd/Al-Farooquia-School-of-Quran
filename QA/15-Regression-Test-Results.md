# Regression

Every suite was rerun after the last code change, one at a time.

| Suite | What it covers | Passed | Failed | Blocked |
|---|---|---:|---:|---:|
| `matrix` | Every route × every role | 34 | 0 | 0 |
| `attack` | Cross-madrasa, injection, uploads, headers | 29 | 0 | 0 |
| `pay-kiosk` | Reported payments, kiosk abuse | 23 | 0 | 0 |
| `edges` | Staff attendance boundaries | 16 | 0 | 0 |
| `rbac` | Row-level access by role | 84 | 0 | 0 |
| `academic` | Students, attendance, lessons, exams | 37 | 0 | 0 |
| `fees` | Fee ledger, receipts, refunds | 14 | 0 | 0 |
| `messaging` | Reminders, reports, delivery, worker | 18 | 0 | 0 |
| `campus` | Hostel | 8 | 0 | 0 |
| `auth` | Sign-in, sessions, passwords, MFA | 58 | 0 | 0 |
| `resilience` | Stored XSS, foreign keys, errors, load | 14 | 0 | 0 |
| `ui` | Every screen × role × width | 32 | 0 | 0 |
| `scale` | Reads on a large dataset | 11 | 0 | 0 |
| `data-perf` | Database integrity and speed | 26 | 0 | 0 |
| **Total** | | **404** | **0** | **0** |

**Repository tests after the fixes:** backend 222 tests passed in 17 files; frontend 27 passed; typecheck, lint and production build clean.

**End to end, kiosk with a simulated camera:** all 12 steps passed. In the admin page check, the only two console errors were the deliberate refusals the test provokes: re-authentication needed before creating a kiosk, and a correction with no reason. All other steps passed.

**What the kiosk test covers:** admin creates a kiosk; a phone-sized page refuses a wrong code and accepts the real one; the camera reads a QR issued by the server; the database has one open session; the same code is refused on screen; the admin dashboard agrees; a reload and a browser restart keep the device registered; real network loss shows *No internet* and records nothing; check-out works; revocation returns the phone to the registration screen.

**Not rerun:** the older `70-browser` suite (replaced by `ui`), and `90-payments` (it was built around Razorpay; `pay-kiosk` and the repository's payment tests replaced it).

