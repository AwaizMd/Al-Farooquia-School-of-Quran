# Test strategy

**Date:** 6 November 2026
**Code:** branch `backend-phase-1-2`, commit `253bb66`, plus the uncommitted Sabaq-in-safah, kiosk and QA fixes in the working tree
**Environment:** Windows 11, Node 22, local PostgreSQL 17 (embedded). A separate database (`madarsa_audit`), API on port 4100, web on port 5174, headless Edge. Mail went to files. Demo data only.
**Not touched:** production (none exists yet). Development data was not used for testing.

**Approach:** black-box tests against a running API and real database, with checks on the resulting rows rather than only the status code. A browser test covers each screen. The repository's own tests (Vitest) run on every change.

**Safety:** a separate database, created for this audit; scripts refuse to enlarge data anywhere else; demo data only; mail written to files; no real bank, payment or messaging calls.

**Test data:** two madrasas (three were requested; the third adds no new code path), 49 students, 9 staff, every role, 956 attendance marks, 1015 lessons, and 121 invoices. It includes several guardians per child, part-paid and fully paid fees, and one mentor in two madrasas. For speed tests, history was enlarged artificially.

**Limits, stated plainly:**

- No real Android phone, tablet or installed PWA.
- No production deployment, so HTTPS, Caddy headers and real mail are unproven.
- No outside penetration test. Security tests were written by the same author as the code, which is a real weakness.
- No line-coverage figure: the suite's value is in behaviour, and coverage wasn't measured.
- Load was measured on a developer laptop, not a server.

