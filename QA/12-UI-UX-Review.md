# UI and usability

**Tested:** every link in each role's menu at 360, 820 and 1366 pixels wide. The first pass made 606 page visits (up to 40 per role). The final pass, after the fixes, made 255 visits (up to 14 per role), because the full pass didn't finish in its time limit on the enlarged data. No real device or person was involved, so this finds faults; it can't tell you whether people find it easy.

## Result

No blank pages, crashes, script errors, sideways scrolling, "undefined" text or broken images in the final run.

**Fixed during the audit:** "Fee plan: undefined" for mentors; the Super Admin opening on the wrong madrasa; module switches that did nothing; a truncated kiosk figure; small quick-note buttons in Record Sabaq.

## Still open

| Finding | Severity | Suggestion |
|---|---|---|
| Small text links on phones: dashboard learning counts (19 px), breadcrumbs, "Clear all" | Low | Add padding so they're at least 44 px tall |
| 15 screen and role combinations reported something under 32 px. Checkboxes make up many of these, and they sit inside larger rows, so most aren't real problems. | Low | Recheck on a real phone |
| The kiosk screen and the new attendance and kiosk admin pages are English only | Medium | Translate them, once the wording is settled |
| Important corrections have no screen (QA2-O01, O02) | High | Build them next |
| No history view for lesson and attendance corrections | Medium | Add when building the above |

**Not assessed:** Urdu wording quality, screen readers beyond automated label checks, real user trials. Arabic interface doesn't exist (only Arabic names).

