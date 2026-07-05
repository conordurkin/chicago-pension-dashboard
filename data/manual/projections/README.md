# Fund projection schedules (2025 actuarial valuations; PABF still 2024)

Each file `{fundId}.csv` contains the fund-actuary's own forward projection from the
December 31, 2025 actuarial valuation (PABF: December 31, 2024 — see quirks below).
These are the authoritative "plan's own" projection paths — what the actuary says
will happen if the statutory funding schedule is followed and all assumptions are met.

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

- `labf.csv` — LABF 2025 AV Table 4, 50-Year Projections (2025–2074). GRS.
- `meabf.csv` — MEABF 2025 AV Exhibit 8, 50-Year Projection (2025–2075). Segal.
  ADC for 2026–2031 from Exhibit 9 (Development of city contribution requirements).
- `pabf.csv` — **STALE: PABF 2024 AV Table 3A, 32-Year Projection (2024–2055). GRS.**
  The document PABF released for FY2025 is the audited financial statements, not the
  GRS actuarial valuation, so no 12/31/2025 projection schedule was available.
  Replace when the PABF 2025 AV is published. Note the 2024-vintage schedule does
  NOT reflect the P.A. 104-0065 Tier 2 enhancement (+$157.9M TPL for PABF).
- `fabf.csv` — FABF 2025 AV Exhibit 9, 37-Year Projection (2025–2062). Segal.

## Known fund-specific quirks

- **LABF/PABF** show statutory contribution as *receivable* (paid following FY).
  **MEABF/FABF** show employer contribution on a cash basis (paid in the FY). The
  underlying statutory requirement is the same; only timing differs.
- **LABF employerContribution** is Table 4's "Total Statutory Contribution" column
  (the city contribution booked for that fiscal year, paid the following May).
- **FABF employerContribution** = statutory contribution + supplemental columns.
- **MEABF 2026 supplemental**: $80,609,447 embedded in the 2026 Employer
  Contribution (Cash Basis) column. No later supplementals assumed.
- **FABF 2026 supplemental**: $5,791,572, shown in its own column for 2026 only.
- All four funds' projections assume statutory funding ramp to 90% funded by 2055
  (police/fire) or 2058 (municipal/laborers), per P.A. 100-0023.
- Rows for years ≤ the latest observed FY are dropped by the normalize step
  (observations win), so the 2025 rows here are for reference/validation only.
