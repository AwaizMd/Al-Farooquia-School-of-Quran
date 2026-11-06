# Test scenarios (the eight journeys)

| # | Journey | Result | How |
|---|---|---|---|
| 1 | New madrasa setup | **Partly passed** | Madrasa, settings and modules pass. Branches as records don't exist. |
| 2 | Student journey: admission to parent report | **Passed** | `academic`, `rbac`, `ui` |
| 3 | Holiday Salah | **Not built** | CR-01 step 5 |
| 4 | Staff attendance: QR, kiosk, check-in, check-out, month | **Passed, on a simulated camera** | `kiosk-e2e`, `edges` |
| 5 | Payroll | **Not built** | No rules given |
| 6 | Accounting | **Not built** | CR-01 step 6 |
| 7 | Multi-madrasa isolation | **Passed** | `attack`, repository isolation suite |
| 8 | Parent A reaching Parent B's child | **Passed** | `attack`, `rbac` |

Each test's name and result are in [07](07-Functional-Test-Results.md).

## Traceability

| Requirement | Feature | Test | Result | Bug | Fix | Regression |
|---|---|---|---|---|---|---|
| Hours must be accurate | Staff attendance | `edges`: overlap | Failed, then passed | QA2-01 | Overlap check | Passed, plus repo test |
| MFA for all staff | Policy | `auth`: policy | Failed, then passed | QA2-02 | Baseline, migration | Passed, plus repo test |
| Accurate kiosk figures | Kiosk | `kiosk-e2e` | Failed, then passed | QA2-03 | Scanner fix | Passed |
| Clean student page | Profile | `ui` | Failed, then passed | QA2-04 | Hide empty row | Passed |
| No server errors | Payments | `matrix` | Failed, then passed | QA2-05 | Missing file answers 404 | Passed, plus repo test |
| Valid input | Filters, shifts | `edges` | Failed, then passed | QA2-06, 07 | Validation | Passed, plus repo tests |
| Office corrects money | Fees | Inventory | Open | QA2-O01 | Not fixed | n/a |

