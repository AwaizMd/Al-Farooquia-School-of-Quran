# Fix tracking

| Bug | Files changed | Test added or changed |
|---|---|---|
| QA2-01 | `Backend/src/modules/staff-attendance/attendance.service.ts` | `Backend/tests/integration/kiosk.test.ts` |
| QA2-02 | `Backend/src/modules/users/users.service.ts`, migration `20261106140000_warden_mfa` | `Backend/tests/security/mfa-recovery.test.ts` |
| QA2-03 | `Frontend/src/kiosk/KioskApp.jsx` | Browser test |
| QA2-04 | `Frontend/src/pages/shared/StudentProfile.jsx` | Browser test |
| QA2-05 | `Backend/src/integrations/storage/storage.ts`, `fees/manual.service.ts`, `payment-settings/settings.service.ts` | `Backend/tests/integration/payment-settings.test.ts` |
| QA2-06 | `staff-attendance/attendance.routes.ts`, `kiosk/kiosk.routes.ts` | `kiosk.test.ts` |
| QA2-07 | `staff-attendance/attendance.service.ts` | `kiosk.test.ts` |
| QA2-08 | `Backend/src/tenancy/access.ts` | Full test run |
| QA2-09 | `Frontend/src/pages/org/Organization.jsx` | Smoke test |
| QA2-10 | `Frontend/src/pages/admin/Kiosks.jsx` | Smoke test |
| QA2-11 | `Frontend/src/pages/mentor/RecordSabaq.jsx` | Browser test |

**Nothing is committed.** All of this is in the working tree with the safah and kiosk work.

Open items are in [13](13-Bug-Reports.md).

