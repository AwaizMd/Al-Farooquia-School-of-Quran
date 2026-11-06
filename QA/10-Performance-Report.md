# Performance

Measured on a developer laptop with API and database on one machine, so treat these as comparisons, not promises. There was no network between browser and server.

## Demo-sized data

49 students, 956 attendance marks, 1015 lessons, 200508 audit rows.

| Request | Median (ms) | Worst (ms) |
|---|---:|---:|
| Sign in (password, argon2id) | 51 | 292 |
| Session check | 18 | 25 |
| Students list | 22 | 28 |
| Students search | 16 | 29 |
| Attendance list | 31 | 48 |
| Lesson records | 17 | 34 |
| Fees overview | 36 | 191 |
| Exams | 21 | 38 |
| Audit log, first page | 52 | 59 |
| Audit log, deep page | 57 | 69 |
| Staff attendance, month | 16 | 18 |
| Kiosk dashboard | 16 | 24 |
| Parent: child fees | 18 | 21 |
| Mentor: students | 18 | 27 |
| 100 parallel reads (total) | 882 |  |

The sign-in median is low because repeated attempts reach the rate limit; the worst figure is closer to a real password check.

## Large data

3061 students, 241017 lessons, 201033 audit rows. Attendance and invoices weren't enlarged.

| Request | Median (ms) | Worst (ms) |
|---|---:|---:|
| Students, first page | 32 | 74 |
| Students, last page | 21 | 25 |
| Students, all (no paging asked) | 22 | 40 |
| Students search | 17 | 28 |
| Lesson records | 47 | 52 |
| Lesson records, mentor | 44 | 58 |
| Fees overview | 41 | 103 |
| Principal: students | 24 | 39 |
| Parent: own children | 15 | 25 |
| Audit log | 36 | 45 |
| Audit log, deep | 91 | 218 |

The default student list returned 100 students, 80 KB.

## Opening the app with large data

| Role | Seconds until quiet | API calls | Browser memory (MB) |
|---|---:|---:|---:|
| admin | 6.6 | 89 | 160 |
| mentor | 3.5 | 42 | 82 |
| parent | 0.5 | 23 | 26 |

**This is the main performance risk** (QA2-O08): the app downloads all students and lessons at startup. No network delay is included. Expect it to be noticeably worse on mobile data and old phones.

## Other measurements

- Front-end: kiosk page 18 KB, plus 130 KB for the QR decoder on phones without a built-in one. The main bundle triggers Vite's chunk-size warning.
- 20 parallel scans of one code: one recorded, no server errors.
- 100 parallel reads across roles: 882 ms in total, all successful.

## Possible improvements, not made

- Load data per screen instead of all at startup (QA2-O08). Not done here: it touches most screens.
- 20 foreign keys have no index of their own, such as `learning_records.mentorId` and `exam_results.studentId`. Consider them if those lists slow down.
- Not measured: memory over days, large uploads, slow networks, old phones.

