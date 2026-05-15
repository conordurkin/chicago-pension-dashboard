# Fund projection schedules (2024 actuarial valuations)

Each file `{fundId}.csv` contains the fund-actuary's own forward projection from the
December 31, 2024 actuarial valuation. These are the authoritative "plan's own"
projection paths — what the actuary says will happen if the statutory funding
schedule is followed and all assumptions are met.

Two uses:
1. **Display**: show each fund's stated glide path to 90% funded on the dashboard.
2. **Validation**: compare our own projection engine's output against these schedules.

## Unit convention

**All dollar values are in thousands of US dollars** — matching the format printed
in each AV. The normalize pipeline multiplies by 1000 when loading these into
`FundTimeSeries.projectionsBaseline` so the downstream schema stays in raw dollars.

`fundedRatioAVA` is stored as a decimal (0.426 for 42.6%).

## Schema

| Column                    | Meaning                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `fundId`                  | meabf \| labf \| pabf \| fabf                                                 |
| `fy`                      | Fiscal year ending Dec 31                                                     |
| `aal`                     | Actuarial Accrued Liability (GASB 25, EAN)                                    |
| `mva`                     | Market Value of Assets                                                        |
| `ava`                     | Actuarial Value of Assets (smoothed)                                          |
| `uaalAVA`                 | Unfunded Actuarial Liability = AAL − AVA                                      |
| `fundedRatioAVA`          | AVA ÷ AAL (per AV; includes receivable contributions per actuary footnotes)   |
| `payroll`                 | Capped / pensionable payroll                                                  |
| `normalCostTotal`         | Total normal cost (employer + employee) where AV reports it                   |
| `normalCostER`            | Employer normal cost only (PABF, FABF report this instead of total)           |
| `adec`                    | Actuarially Determined Contribution where reported                            |
| `employerContribution`    | Employer contribution per AV projection — see `contributionBasis` for timing  |
| `contributionBasis`       | `receivable` (statutory, paid following FY) \| `cash` (paid in FY)            |
| `employeeContribution`    | Employee / member contribution                                                |
| `benefitPayments`         | Projected benefit payments                                                    |
| `adminExpenses`           | Projected administrative expenses                                             |

## Sources

- `labf.csv` — LABF 2024 AV Table 4, 50-Year Projections (2024–2073). GRS.
- `meabf.csv` — MEABF 2024 AV Exhibit 8, 50-Year Projection (2024–2074). Segal.
- `pabf.csv` — PABF 2024 AV Table 3A, 32-Year Projection (2024–2055). GRS. Discount rate 6.75%.
- `fabf.csv` — FABF 2024 AV Exhibit 9, 38-Year Projection (2024–2061). Segal.

## Known fund-specific quirks

- **LABF/PABF/FABF** show statutory contribution as *receivable* (paid following FY).
  **MEABF** shows employer contribution on a cash basis (paid in the FY). The
  underlying statutory requirement is the same; only timing differs.
- **PABF 2025 supplemental**: the PABF AV projection schedule does not explicitly
  show the 2025 City supplemental contribution separately; it is embedded in the
  starting MVA.
- **MEABF 2025 supplemental**: explicitly $168,736,173 embedded in the 2025
  Employer Contribution (Cash Basis) column.
- **FABF 2025 supplemental**: $15,640,948, shown in its own column for 2025 only.
- All four funds' projections assume statutory funding ramp to 90% funded by 2055
  (police/fire) or 2058 (municipal/laborers), per P.A. 100-0023.
