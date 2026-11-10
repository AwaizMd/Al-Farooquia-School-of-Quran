# Payroll

Off by default: turn on the **Payroll** switch for a madrasa under Madrasas. Every rule is the madrasa's own; nothing is built in.

## Setting up

1. **Pay items**: define allowances and deductions (fixed amount, or percent of basic; for everyone or chosen staff). None exist until you add them.
2. **Salaries**: set each person's basic pay from a date. A change is a new row, so earlier months keep their salary. A person can be exempted from attendance deductions.
3. **Rules**: what one day of pay means, whether absence and repeated lateness deduct pay, rounding, and whether the preparer may approve. Every deduction starts switched off.

## Each month

| Step | Who | What happens |
|---|---|---|
| Work out draft | `payroll.manage` | Figures come from salaries, pay items, rules, staff attendance and waiting adjustments |
| Review | `payroll.manage` | Mark absent days as paid (holidays, approved leave) and add notes |
| Recalculate | `payroll.manage` | Picks up corrected attendance; reviewed days and notes are kept |
| Approve | `payroll.approve` + password | From the month's last day. Refused if figures changed since the draft (`RUN_STALE`), net pay is below zero, or the preparer approves while the rule forbids it |
| Record as paid | `payroll.approve` + password | Records a date only. **The app moves no money and creates no bank file** |

Staff see their own payslips under My Payslips once approved, never a draft.

## Corrections

Approved figures are final: database triggers refuse any change to an approved run or its payslips. To correct a month, add an **adjustment** (pay more or pay less, with a reason). It is applied once, to the next payroll approved for that person.

## Access

| Role | Access |
|---|---|
| Super Admin, Madrasa Admin | Everything |
| Accountant | Prepare (`payroll.read`, `payroll.manage`), cannot approve |
| All staff | Their own approved payslips |
| Principal, CA, Committee, others | None |

Salary amounts are never written into the activity log.

## Known limits

- **Leave and holidays are not built**, so absent days can be too high. The screens say so; reviewers mark those days as paid.
- No tax, PF, ESI or other statutory calculation. Add them as pay items if they apply, and have your accountant confirm the figures.
- Staff who left before the month ends are not included automatically, because the figures cover active staff.
