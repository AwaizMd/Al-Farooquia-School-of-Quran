# Organization, madrasas, roles and permissions

## Organization and madrasas

- **One organization** (the trust) runs one or more **madrasas** (campuses).
- **Every campus record belongs to one madrasa.** This covers students, halqas, staff records, attendance, lessons, exams, fees, hostel, settings and so on.
- **Accounts are organization-wide.** One person has one sign-in. Their roles, however, are granted **per madrasa**.

| Where a role is held | Roles |
|---|---|
| `user_roles` (organization) | `SUPER_ADMIN` (all madrasas), `PARENT` and `STUDENT` (their madrasas come from the linked student records) |
| `madrasa_memberships` (one row per madrasa) | `MADRASA_ADMIN`, `PRINCIPAL`, `ACCOUNTANT`, `MENTOR`, `WARDEN`, `COMMITTEE_MEMBER`, `CA` |

A membership can be switched off, and it can carry an expiry date (for example a CA engaged for one audit). After that date it gives no access at all.

## The active madrasa

Every fully signed-in request works in one **active madrasa**.

The web app sends its choice in the `X-Madrasa-Id` header. The server checks that choice against the caller's madrasas on every request. A madrasa the caller has no access to answers **404**, so the response never reveals whether that madrasa exists.

Without a choice, the server picks a default:
- staff get their home madrasa, or else their first one;
- a parent whose children are all in one madrasa gets that madrasa;
- a parent with children in several madrasas reads across all of them (read-only for anything that is not tied to a child).

A caller's permissions are those of the roles they hold **in the active madrasa**, plus their organization roles. A mentor in madrasa A who is an administrator in madrasa B has administrator rights only while working in B.

MFA and session timeouts follow the **strictest role the person holds anywhere**, so choosing a different madrasa never weakens either.

## Permission matrix

Source of truth: `src/modules/auth/permissions.ts`. The web app's menu follows the same matrix, but only for convenience; the server is what enforces it.

| Permission | Super Admin | Madrasa Admin | Principal | Accountant | CA | Committee | Mentor | Warden | Parent | Student |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `org.manage` (madrasas, modules) | ✓ | | | | | | | | | |
| `users.read` | ✓ | ✓ | ✓ | | | | | | | |
| `users.manage`, `mfa.reset`, `security.manage` | ✓ | ✓ | | | | | | | | |
| `audit.read` | ✓ | ✓ | ✓ | | | | | | | |
| `settings.manage` | ✓ | ✓ | | | | | | | | |
| `students.read`, `guardians.read` | ✓ | ✓ | ✓ | ✓ | | | | | | |
| `students.write`, `staff.manage`, `groups.manage`, `concessions.manage` | ✓ | ✓ | | | | | | | | |
| `staff.read` | ✓ | ✓ | ✓ | | | | | | | |
| `attendance.manage`, `learning.manage`, `exams.manage` | ✓ | ✓ | | | | | | | | |
| `attendance.correct` | ✓ | ✓ | ✓ | | | | | | | |
| `fees.read` | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | |
| `fees.record`, `fees.invoice`, `fees.verify` | ✓ | ✓ | | ✓ | | | | | | |
| `fees.adjust`, `fees.refund`, `payments.configure` | ✓ | ✓ | | | | | | | | |
| `hostel.read` | ✓ | ✓ | ✓ | | | | | ✓ | | |
| `hostel.manage` | ✓ | ✓ | | | | | | ✓ | | |
| `accounts.read`, `accounts.export` | ✓ | ✓ | | ✓ | ✓ | | | | | |
| `accounts.write`, `accounts.close_period` | ✓ | ✓ | | ✓ | | | | | | |
| `analytics.read` | ✓ | ✓ | ✓ | | | ✓ | | | | |
| `analytics.students` (drill-down) | ✓ | ✓ | ✓ | | | ✱ | | | | |

✱ Committee members get student-level drill-down only where the madrasa sets `committeeCanViewStudents`. This applies once the dashboards exist (CR-01 phase 3).

Mentors, parents and students hold no broad permissions. They see records through **row-level scopes** (`src/policies/students.ts`):
- a mentor sees the halqas they currently teach;
- a parent sees their linked children;
- a student sees themself.

## Modules (feature flags)

These modules can be switched on or off per madrasa, by a Super Admin, on the **Madrasas** page:
- Fees
- Hostel
- Examinations
- Scheduled reports
- Namaz tracking
- Accounts
- Staff attendance
- Biometric

A switched-off module is refused by the API with `404 FEATURE_DISABLED`, not only hidden in the menu.

Defaults for a new madrasa:
- **on:** Fees, Hostel, Examinations, Scheduled reports;
- **off:** everything else.

## Staff attendance and kiosks

Needs the `STAFF_ATTENDANCE` module.

| Permission | Who | Allows |
|---|---|---|
| `kiosks.manage` | Madrasa Admin, Super Admin | Register, deactivate and revoke kiosks; kiosk settings |
| `staff_attendance.manage` | Madrasa Admin, Super Admin | Correct attendance with a reason, add it by hand, shifts, exemptions, cancel QR codes |
| `staff_attendance.read` | Madrasa Admin, Super Admin, Principal, Accountant | See attendance and the monthly figures |

Any signed-in person with a staff record in the madrasa can show their own QR code and see their own attendance. A kiosk is not a user and holds no role: its device cookie allows only its own device routes.
