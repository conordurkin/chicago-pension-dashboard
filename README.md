# Chicago Pension Dashboard

An analytical dashboard for Chicago's four city pension funds — MEABF (Municipal), LABF (Laborers), PABF (Police), and FABF (Fire). The funds are collectively ~34% funded against roughly $55B in net pension liability, one of the worst municipal pension situations in the US. The city only began paying actuarially determined contributions (ADC) in FY 2022, and each fund is on a statutory ramp targeting 90% funded by 2055 (police/fire) or 2058 (municipal/laborers) under P.A. 100-0023.

The dashboard:

1. **History.** Lays out the historical funding trajectory (2001-2024) anchored on market value of assets, with annotated events for the major inflection points (Tier 1 enhancements, 2003 POB, the GFC, Tier 2 creation, P.A. 100-0023, the 2022 ADC inflection).
2. **Projections.** Shows each fund's own AV-baseline forward projection alongside a computed "meet-assumptions" baseline from a built-in projection engine.
3. **Scenarios.** Lets users model alternative paths interactively — different return assumptions, target funding levels, extra payments, benefit shocks — with shareable URL state.
4. **Impact.** Translates the projected employer-contribution stream into property-tax share and per-household terms.

The goal is a tool that's analytically credible enough for policy work, but legible enough for journalists and civic-minded residents.

## Tech stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript** (strict)
- **Tailwind CSS** for styling
- **Recharts** for charts
- **nuqs** for URL-synced scenario state
- **Vitest** for projection-engine math tests

Data is processed at build time into static JSON shipped with the app — no runtime backend.

## Data sources

- **Public Plans Database** (publicplansdata.org) — historical backbone, 2001-2024. PPD plan IDs: MEABF=145, PABF=146, FABF=206, LABF=215.
- **Each fund's 2024 actuarial valuation** — for the forward projection schedules in `data/manual/projections/`. The CAFRs themselves are large PDFs and are kept locally rather than in the repo.
- **Hand-curated patches** in `data/manual/` for pre-2001 historical figures and PPD field corrections.

See [`/methodology`](./src/app/methodology) in the app for the full source list and reconciliation notes (PPD's AVA-basis funded ratios vs. MVA-basis, GASB 25 AAL vs. GASB 67 TPL, contribution-timing conventions across the four funds, etc.).

## Project structure

```
data/
  raw/                       PPD API snapshots
  manual/                    Hand-curated supplements (projections, patches, historical pre-2001)
  processed/funds/           Build outputs — per-fund + aggregate JSON
scripts/
  fetch-ppd.ts               Pull raw PPD data
  normalize.ts               Raw -> processed schema
  build-aggregate.ts         Sum the four funds
  validate.ts                Sanity checks
src/
  app/                       Routes: /, /history, /funds/[fund]/{overview,assets-liabilities,cashflow}, /scenarios, /burden, /methodology
  components/
    charts/                  Recharts-based chart components
    content/                 KPI tiles, chart tooltip card, etc.
    layout/                  Top nav, footer
  lib/
    data/                    Fund loader, history annotations
    projections/             Projection engine + layered amortization
    format/                  Number formatters
  types/                     pension.ts (FundId, YearObservation, FundTimeSeries), scenarios.ts
tests/                       Vitest tests for the projection engine
```

## Running locally

```bash
npm install
npm run dev                  # next dev on :3000
```

Other commands:

```bash
npm run build                # production build
npm run typecheck            # tsc --noEmit
npm test                     # vitest run
npm run lint                 # next lint
```

## Rebuilding the data

The processed JSON files in `data/processed/` are checked in, so the app builds and runs without re-running the pipeline. To refresh from PPD:

```bash
npm run data:fetch           # pull from PPD API
npm run data:normalize       # raw -> processed schema
npm run data:aggregate       # sum the four funds
npm run data:validate        # sanity checks
# or all at once:
npm run data:build
```

## License

Public data, public-interest project. Code is provided as-is.
