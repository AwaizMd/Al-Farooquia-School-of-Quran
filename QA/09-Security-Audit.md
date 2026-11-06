# Security audit

Run against a separate local database, with non-destructive payloads. **No outside penetration test has been done,** and the same author wrote the code and the tests.

## Result

**No critical or exploitable issue was found.** One rule breach (Warden MFA) was fixed.

| Area | Tested | Result |
|---|---|---|
| Broken access control | Every route × every role; other family's child; other madrasa, by URL, ID, header and body | Pass |
| Injection | SQL, operator objects, template, path traversal and header text in every search and filter | Pass: treated as text |
| Stored XSS | Script in a student name, shown across 12 targeted pages for an admin and a parent, and every screen in the walk | Pass: shown as text; nothing ran |
| Authentication | Brute force, enumeration, session fixation and reuse, password reset, MFA recovery, disabled accounts | Pass |
| Mass assignment | Madrasa, ID, admission number, roles; a Madrasa Admin promoting themselves | Pass |
| Money tampering | Negative, fractional, oversized, overpayment, double approval, double refund | Pass |
| Uploads | Executable, HTML as PNG, SVG, PHP, empty, oversized, traversal names, another family's file | Pass |
| QR and kiosk | Forged, tampered, expired, replayed, revoked; 20 parallel scans; no cookie; staff cookie as kiosk; another madrasa | Pass |
| PIN | Hashed, weak ones refused, rate limited, no staff data in errors | Pass |
| Stored secrets | Argon2id passwords; hashed tokens; encrypted MFA secrets | Pass |
| Append-only | Audit log and payments refuse update and delete in the database | Pass |
| CORS, CSRF, cookies | Other origins refused; HttpOnly and SameSite | Pass |
| Dependencies | `npm audit`, production packages | 0 known vulnerabilities |
| Errors | No stack, SQL or path in any response | Pass |

## Not tested

- HTTPS, HSTS and the production headers in the Caddyfile: **never run**. The camera permission was changed in that file for the kiosk, also unproven.
- S3 storage permissions.
- Denial of service: only a small load test was done, by design.
- Server hardening, firewall and database exposure: no server exists yet.

## Accepted risks to know about

- **A rotating QR can't prove someone is physically present.** A colleague could carry a second signed-in phone, or someone could stream their screen. A PIN only raises the effort.
- **A kiosk can be reset from its hidden menu** without an administrator. It only removes that phone's registration.
- **Audit log and notification rows may have no madrasa** when they're organization-level. That's by design; a Madrasa Admin was confirmed not to see another madrasa's entries.

