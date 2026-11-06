# Integration results

| Link between modules | Result | Evidence |
|---|---|---|
| Kiosk scan → staff attendance → monthly figures | Pass | `kiosk-e2e`, `edges` (figures equal a separate database count) |
| Personal QR page → kiosk → admin dashboard | Pass | `kiosk-e2e`, `kiosk-admin` |
| Reported payment → verification → ledger → balance → receipt | Pass | `pay-kiosk`, `fees` |
| Attendance → absence notice to family | Pass | `academic` |
| Lesson → parent view and summaries | Pass | `academic` |
| Exam marks → publish → report card → parent | Pass | `academic` |
| Fees → reminders → outbox → mail file | Pass | `messaging` |
| Admission → first invoice → guardian link | Pass | `academic` |
| Worker restart → queued work still sent | Pass | `messaging` |
| Attendance → payroll | **Not built**; only the CSV exists | |
| Payroll → accounts → bank | **Not built** | |
| Fees → accounts | **Not built** | |
| Holidays → attendance | **Not built** | |
| Real email, WhatsApp, SMS | **Not tested** | No provider connected |

