# Scenario Engine v2 — Design Doc

**Status:** Draft, May 2026
**Owner:** Conor Durkin
**Replaces:** `src/lib/projections/engine.ts` (v1)

---

## Motivation

The v1 engine produces a no-shock "baseline" scenario that diverges from the actuary's own 2024 AV projection by ~25-30% in late years (e.g., $7B/yr aggregate contribution in 2055 vs. AV's $4.1B). Diagnosis:

1. **Shrinking-horizon amortization.** v1 re-amortizes the current gap each year against the years remaining to the target. The denominator shrinks toward 1, so payments ramp sharply at the back end even when nothing else changes.
2. **Coarse growth assumptions.** v1 defaults to 3% payroll growth and 3% benefit growth. Each fund's AV implies ~1.4-2.5% payroll growth, ~1-2% benefit growth, and ~1.3-1.6% normal-cost growth, driven by Tier 2 mix shifts and demographic patterns we don't model from first principles.
3. **Single aggregated engine.** v1 treats "aggregate" as a single synthetic fund with TPL-weighted average parameters. Per-fund targets, growth rates, and discount rates differ enough that this papers over real heterogeneity.

The fix is structural: stop trying to re-derive the AV's deterministic trajectory from first principles. Anchor the baseline on the AV itself, and have the engine model *deltas from baseline* driven by user-controlled scenario shocks.

This is the centerpiece of the project. The "baseline matches AV" property is non-negotiable; everything else follows from it.

---

## Architectural principles

1. **One engine per fund.** Each of MEABF, LABF, PABF, FABF is projected independently, with its own AV trajectory, GASB sensitivity table, baseline discount rate, and target year. The aggregate view is a per-year sum of the four fund projections.

2. **AV-anchored baseline.** For each fund, the no-shock baseline IS the AV's projected trajectory (employer contribution, AAL, MVA, NC, benefits, payroll). When the user makes no slider changes from defaults, the engine output equals the AV input by construction.

3. **Scenarios as layered deltas.** Each scenario shock (return deviation, extra payment, POB, discount rate change) spawns one or more closed amortization layers on top of the AV baseline. Total scheduled employer contribution at year `t` = `AV[t].er + sum(active scenario layers paying at t)`.

4. **Closed-period level-percent layers.** Each layer has a fixed start year, fixed end year (always `targetYear`), and a level-percent-of-pay payment schedule. Once created, a layer's payment trajectory is locked. No re-solving.

5. **Layer signs are honest.** Gains (returns beat assumption, extras paid in, AAL re-priced down) spawn *negative* layers that reduce future required contributions. Losses spawn positive layers that increase them.

6. **Floor at zero ER contribution.** In extreme gain scenarios, layer offsets could push total contribution negative. We floor at zero — the city does not receive money back from the fund.

---

## Inputs

### Per-fund data (already in `public/data/funds/{fundId}.json`)

```typescript
interface FundTimeSeries {
  observations: YearObservation[];  // historical, through FY 2024
  projectionsBaseline: YearObservation[];  // AV's forward projection
}
```

The engine reads the following from each `projectionsBaseline` row:

| Field | Role |
|---|---|
| `fy` | Fiscal year |
| `aal` | Expected AAL at end of FY `fy`, at AV's baseline discount rate |
| `mva` | Expected MVA at end of FY `fy`, assuming all assumptions hold |
| `normalCostTotal` | Total normal cost (ER + EE) for FY `fy` |
| `employeeContribution` | Statutory EE contribution for FY `fy` |
| `employerContribution` | Statutory ER contribution for FY `fy` (NC_ER + amortization) |
| `benefitPayments` | Projected benefit outflows for FY `fy` |
| `payroll` | Projected covered payroll for FY `fy` |

`NC_ER` is derived as `normalCostTotal - employeeContribution` (the EE portion shows up in `employeeContribution` already, by AV convention). Verify against per-fund AV PDFs during implementation.

### GASB sensitivity table (already in `src/lib/data/discountSensitivity.ts`)

Per fund: TPL at baseline-1pp, baseline, baseline+1pp; FNP; service cost baseline. Used for re-pricing AAL and NC when the user moves the discount rate slider.

### Scenario parameters (user-facing)

```typescript
interface ScenarioParams {
  fundId: FundId;  // 'aggregate' projects all four and sums
  assumedReturnDelta: number;   // signed, -0.01 to +0.01
  actualReturnDelta: number;    // signed, -0.03 to +0.03
  targetFundedRatio: number;    // default 0.9
  targetYear: number;           // per-fund default; user-overridable
  amortMethod: 'levelPercent' | 'levelDollar';
  extraAnnualPayment: number;   // $/yr (nominal, flat) added to ER each year through targetYear
  horizonYear?: number;         // defaults to targetYear
}
```

Extras are interpreted literally: $1B/yr means $1B in nominal dollars every year, no payroll growth applied. The slider label should communicate this explicitly ("$X billion per year, nominal").

The "assumed return" slider is now a **signed delta** from each fund's baseline rate (e.g., `+0.005 = +50 bps`). The same delta applies to all funds when "aggregate" is selected. Per-fund sliders may come later.

---

## Per-fund math

For each fund `f`:

### Initialization

```
t_0 = startFy = max(observations[].fy)              // last observed year, FY 2024
r_baseline = sensitivity[f].baselineRate
r = r_baseline + assumedReturnDelta                  // user's effective assumed return
g = AV_implied_payroll_growth[f]                     // per-fund constant, see below

dr_ratio = interpolateTpl(r, sensitivity[f]) / sensitivity[f].tplAtBaseline
nc_scale = ncScaleFromRate(r, sensitivity[f])

MVA[t_0] = observations.last.mva
```

### Per-fund payroll growth constant

Derived from each fund's own AV baseline trajectory (CAGR 2025 -> 2055):

| Fund | g (payroll growth) |
|---|---|
| MEABF | 0.025 |
| LABF | 0.021 |
| PABF | 0.014 |
| FABF | 0.015 |

Note: this is per-fund payroll growth (used for level-percent amortization), distinct from NC growth or benefit growth, which we get directly from AV[t].

### AV baseline at user's discount rate

For each `t` in `t_0 + 1 ... horizonYear`:

```
AAL[t] = AV[t].aal * dr_ratio
NC_total[t] = AV[t].normalCostTotal * nc_scale
NC_ER[t] = NC_total[t] - AV[t].employeeContribution
benefits[t] = AV[t].benefitPayments      // not rate-sensitive
payroll[t] = AV[t].payroll                // not rate-sensitive
baseline_ER[t] = AV[t].employerContribution
```

**Note on discount-rate scaling for `baseline_ER`.** When the user changes the discount rate, the AV's published `employerContribution` no longer reflects the right schedule (it was set at the AV's baseline rate). We handle this via a layer: see "AAL re-pricing layer" below. We do *not* rescale `baseline_ER` directly — instead, we spawn an offsetting layer that captures the change.

### Scenario layers

The engine maintains a list of amortization layers. Each layer:

```typescript
interface AmortLayer {
  source: 'aal-reprice' | 'return-experience' | 'target-override';
  startFy: number;       // first payment year, inclusive
  endFy: number;         // last payment year, inclusive
  initialPayment: number; // signed; payment at startFy
  growthRate: number;    // typically = payrollGrowth; 0 for levelDollar
}
```

Note: extras flow through `total_ER` directly (not as a layer); their downstream effect on MVA is captured by the return-experience machinery, which spawns layers as normal.

Layer payment at year `t`:

```
payment(layer, t) =
  layer.initialPayment * (1 + layer.growthRate)^(t - layer.startFy)
  if layer.startFy <= t <= layer.endFy, else 0
```

Initial payment from balance, for level-percent at rate `r` over `N` years:

```
P_0 = B / ((1 - ((1+g)/(1+r))^N) / (r - g))
```

(Reduces to `B / N` if `r == g`. For levelDollar, `g = 0`: `P_0 = B * r / (1 - (1+r)^-N)`.)

#### Layer 1: AAL re-pricing (spawned at `t_0`, only when `assumedReturnDelta != 0`)

When the discount rate changes, the AV's AAL trajectory shifts by `dr_ratio`. This is a one-time gain (rate up) or loss (rate down) at the start.

```
aal_change = AV[t_0 + 1].aal * (1 - dr_ratio)         // positive if rate up
N = targetYear - t_0
balance = aal_change                                    // sign: positive = gain
spawn layer { startFy: t_0 + 1, endFy: targetYear, initialPayment: -solve(balance, r, g, N), source: 'aal-reprice' }
```

(Negative initial payment because a gain reduces required contributions.)

This layer offsets the portion of `baseline_ER[t]` that was amortizing the now-vanished AAL.

#### Layer 2: Initial gap layer (spawned at `t_0`, always)

Spawned regardless of shocks. This is the initial amortization of the gap to target FR.

Wait — actually, no. If we're using `baseline_ER` as our baseline, the initial gap is already being amortized inside `baseline_ER` (the AV already has its own initial layer baked in). So we should NOT spawn another initial gap layer at `t_0`. The baseline AV does the work.

The only initial-state layers are:
- AAL re-pricing layer (only if rate changed)
- Adjustments for `targetFundedRatio` and `targetYear` overrides (see below)

#### Layer 3: Target FR / target year override layers (spawned at `t_0` if user changed defaults)

The AV baseline amortizes to whatever FR / target year is in the AV (e.g., 90% by 2058 for MEABF). If the user changes either knob, we replace the AV's amortization schedule with a re-derived one.

**Approach: strip AV amortization, re-amortize at user's parameters.**

Step 1 — isolate the AV's amortization payments each year:
```
av_amort[t] = AV[t].employerContribution - NC_ER[t]    for t = t_0+1 ... AV_target_year
            = 0                                          for t > AV_target_year
```

Step 2 — compute the gap the user wants to close. The AV reaches `av_target_fr` (typically 0.90) by `AV_target_year`. The user wants `user_target_fr` by `user_target_year`. The new amortization schedule must close:
```
user_gap_t0 = AAL[t_0] - MVA[t_0]                       // current UAAL at user's rate
target_residual = AAL[user_target_year] * (1 - user_target_fr)
// the amortization must close (user_gap_t0 - target_residual_PV_at_t_0)
```

Step 3 — solve for a level-percent (or level-dollar) schedule over `[t_0+1, user_target_year]` that closes that gap at rate `r`, growth `g`. Call its payments `user_amort[t]`.

Step 4 — spawn a single `target-override` layer whose payment at year `t` is:
```
override_layer[t] = user_amort[t] - av_amort[t]    for t = t_0+1 ... max(user_target_year, AV_target_year)
```

This single layer captures both effects the user asked for:
- **Shorter target year (e.g., 2040 vs 2058):** `user_amort` is bigger per year in 2025-2040, then zero. AV's amortization continues through 2058. So `override_layer` is large-positive in 2025-2040, then large-negative in 2041-2058 (cancels AV's tail amortization). Result: faster amortization, no tail.
- **Longer target year (e.g., 2065 vs 2058):** `user_amort` is smaller per year, runs through 2065. AV ends at 2058. So `override_layer` is small-negative in 2025-2058 (slowing the AV schedule), then small-positive in 2059-2065 (the user's extended tail). Result: slower amortization, longer horizon.
- **Higher target FR (e.g., 95% vs 90%):** `user_gap_t0 - target_residual` is bigger, so `user_amort` is bigger. Net positive layer. More amortization.

**Sanity check (default values):** when `user_target_fr = av_target_fr` and `user_target_year = AV_target_year`, the override layer should be exactly zero each year. This is part of the AV tie-out regression test.

**Caveat:** the layer is sized assuming the AV's MVA glide path holds, which it does only if no other shocks are active. Under combined shocks (e.g., target year change AND returns miss), the override layer is sized at `t_0` and doesn't readjust as return-experience layers spawn later. This is consistent with how real layered amortization works — each layer is fixed at creation.

#### Layer 4: Return experience layers (spawned each year if `actualReturnDelta != 0`)

At the end of year `t`, compute:

```
expectedMVA[t] = MVA[t-1] * (1 + r) + scheduled_ER[t] + AV[t].employeeContribution - benefits[t]
actualMVA[t]   = MVA[t-1] * (1 + r + actualReturnDelta) + total_ER[t] + AV[t].employeeContribution - benefits[t]
                 + (pob.year == t ? pob.amount : 0)
experienceLoss[t] = expectedMVA[t] - actualMVA[t]
```

Where `scheduled_ER[t] = baseline_ER[t] + sum(active layer payments at t)` and `total_ER[t] = scheduled_ER[t] + extras_t`.

If `|experienceLoss[t]| > 1e6` and `targetYear - t > 0`:

```
N = targetYear - t
spawn layer { startFy: t+1, endFy: targetYear, initialPayment: solve(experienceLoss[t], r, g, N), source: 'return-experience' }
```

Sign convention: positive `experienceLoss` (= expected exceeded actual) is a loss; layer payment is positive (city pays more). Negative loss is a gain; layer payment is negative.

#### Layer 5: Extras layers (spawned each year extras paid)

Extras are handled inside `total_ER[t]` (the user explicitly pays them). They also spawn a gain layer next year, since the unexpected inflow shows up as MVA experience > expected:

```
For t in t_0+1 ... targetYear:
  total_ER[t] = scheduled_ER[t] + extras_t
  // ... MVA roll-forward as above
  // experienceLoss naturally absorbs the extras and spawns a gain layer
```

i.e., extras don't need their own special layer logic; the return-experience mechanism handles them, since `total_ER > scheduled_ER` means `actualMVA > expectedMVA`, which spawns a negative layer next year. **The same code path handles return deviations and extras.**

---

## Year-by-year algorithm (pseudocode)

```
for fund f:
  layers = []
  initialize_layers(f, params)   // spawns AAL-reprice and target-override layers at t_0

  MVA[t_0] = observations.last.mva

  for t = t_0 + 1 ... horizonYear:
    AAL[t] = AV[t].aal * dr_ratio
    NC_total[t] = AV[t].normalCostTotal * nc_scale
    NC_ER[t] = NC_total[t] - AV[t].employeeContribution
    benefits[t] = AV[t].benefitPayments
    payroll[t] = AV[t].payroll
    baseline_ER[t] = AV[t].employerContribution     // includes NC_ER + AV's amortization

    layer_payments[t] = sum_active_layers(t)
    scheduled_ER[t] = baseline_ER[t] + layer_payments[t]
    extras_t = (t <= params.targetYear ? params.extraAnnualPayment : 0)
    total_ER[t] = max(0, scheduled_ER[t] + extras_t)

    actualReturn = r + params.actualReturnDelta
    expectedMVA = MVA[t-1] * (1 + r) + scheduled_ER[t] + AV[t].employeeContribution - benefits[t]
    actualMVA = MVA[t-1] * (1 + actualReturn) + total_ER[t] + AV[t].employeeContribution - benefits[t]

    MVA[t] = actualMVA
    UAAL[t] = AAL[t] - MVA[t]
    fundedRatio[t] = MVA[t] / AAL[t]

    experienceLoss = expectedMVA - actualMVA
    if |experienceLoss| > THRESHOLD and (targetYear - t) > 0:
      N = targetYear - t
      P = solve(experienceLoss, r, g, N, amortMethod)
      layers.append({
        source: 'return-experience',
        startFy: t + 1,
        endFy: targetYear,
        initialPayment: P,
        growthRate: g
      })

    record output for year t
```

---

## Aggregate handling

The aggregate view runs the per-fund algorithm for all four funds and sums per-year outputs:

```
aggregate_year[t] = {
  aal:                 sum of fund.aal[t] over all funds,
  mva:                 sum of fund.mva[t] over all funds,
  uaal:                sum of fund.uaal[t] over all funds,
  fundedRatio:         sum_mva / sum_aal,
  employerContribution: sum of fund.total_ER[t] over all funds,
  ...
}
```

`targetYear` for the aggregate view is per-fund: each fund uses its own statutory target year (2055 for PABF/FABF, 2058 for MEABF/LABF) unless the user overrides. If the user moves the target year slider while viewing aggregate, that override applies uniformly to all four funds.

`horizonYear` for aggregate output = max of per-fund horizons.

---

## Worked examples

### Example A: Aggregate, all defaults (delta = 0, no extras)

Expected: engine output == sum of AV[t].employerContribution for each fund, exactly.

Trace at FY 2025:
- For each fund f: no layers spawned (no shocks). `total_ER[2025] = AV[2025].employerContribution`.
- Aggregate `total_ER[2025] = 2.747B` (matches AV aggregate exactly).
- Aggregate `total_ER[2055] = 4.13B` (matches AV aggregate exactly).

This is the regression test: **default scenario must tie out to AV to within rounding.**

### Example B: Aggregate, returns miss by 1pp every year

`actualReturnDelta = -0.01`, all else default.

Year 2025:
- baseline_ER[2025] = AV's 2.747B (no layers active yet)
- expectedMVA = 12.42B * 1.0666 + 2.747B + 0.875B (EE) - 2.94B = 13.92B
- actualMVA = 12.42B * 1.0566 + 2.747B + 0.875B - 2.94B = 13.80B
- experienceLoss = 0.12B (loss; rate missed)
- Spawn layer at startFy=2026, endFy=2058, with initialPayment ~ 0.007B/yr at start

Year 2026:
- baseline_ER = AV's 2.574B
- One layer active, payment ~ 7M
- scheduled_ER = 2.581B
- expectedMVA, actualMVA computed; another 1pp miss spawns another layer

After 30 years of 1pp misses, ~30 small loss layers stack up. Total layer payment at 2055 might be ~ 0.5-1B above AV's 4.13B.

Civic story: **"Missing assumption by 1pp every year for 30 years costs the city an extra ~$X billion in cumulative contributions, on top of the official schedule."**

### Example C: Aggregate, $1B/yr extras through 2058

`extraAnnualPayment = 1B`, all else default.

Year 2025:
- baseline_ER = AV's 2.747B
- extras = 1B
- total_ER = 3.747B
- expectedMVA computed with scheduled_ER (no extras): grows normally
- actualMVA includes the 1B extra: 1B higher than expected
- experienceLoss = -1B (gain)
- Spawn negative layer at startFy=2026, endFy=2058, with initialPayment ~ -60M/yr

Year 2026:
- baseline_ER = 2.574B
- One layer active paying -60M
- scheduled_ER = 2.514B
- extras = 1B
- total_ER = 3.514B
- Another 1B gain layer spawned for this year's extra

Civic story: **"Paying $1B extra every year accelerates funding, but each extra payment also reduces the system's required schedule by an equivalent PV — so total cost includes the full extras plus the (declining) AV baseline minus accumulated offsets. By 2058 the fund is overfunded."**

(The mechanic from Example C is the actuarial truth: gains *do* reduce future requirements, layer by layer. The user sees both the headline "paid X total" and the funded ratio overshooting target.)

### Example D: MEABF only, rate slider at +50 bps (7.12% vs 6.62% baseline)

`assumedReturnDelta = +0.005`, all else default, fund = MEABF.

Initialization:
- dr_ratio = interpolateTpl(0.0712, sens_meabf) / sens_meabf.tplAtBaseline
  - Linear between 6.62% baseline and 7.62% (+1pp): tplAtPlus1pp = 18.174B vs tplAtBaseline = 20.205B
  - At +50 bps: interpolated TPL = 20.205B + 0.5 * (18.174 - 20.205) = 19.190B
  - dr_ratio = 19.190 / 20.205 = 0.950
- nc_scale = ratio of interpolated TPL to baseline TPL = 0.950 (approx; same factor)
- AAL change at t_0+1 = AV[2025].aal * (1 - 0.950) = ~$1B reduction
- Spawn AAL-reprice layer at startFy=2025, endFy=2058, balance=+$1B (gain), initialPayment ~ -$60M

Year 2025:
- baseline_ER = AV's MEABF $1.13B (or whatever it is)
- AAL-reprice layer pays -$60M
- scheduled_ER = 1.07B
- expectedMVA, actualMVA equal (no return delta), no new layers

The user sees ~5% lower contributions across the projection, reflecting the higher assumed return.

---

## Implementation plan

### Files

| File | Action |
|---|---|
| `src/lib/projections/engine.ts` | Refactor — keep public types, replace internals |
| `src/lib/projections/layers.ts` | New — layer math, `AmortLayer` type, `solveLayerPayment`, etc. |
| `src/lib/projections/perFund.ts` | New — single-fund projection |
| `src/lib/projections/aggregate.ts` | New — sums per-fund projections |
| `src/lib/data/scenarioDefaults.ts` | New — per-fund payroll growth constants |
| `src/lib/data/discountSensitivity.ts` | No change |
| `src/app/scenarios/ScenariosClient.tsx` | Update slider semantics; switch to delta-based return slider; use new engine API |
| `tests/engine.test.ts` | New / replace — must include "default scenario matches AV" regression |
| `tests/layers.test.ts` | New — annuity formula, layer growth, sign conventions |

### Build order

1. **Spike: AV tie-out, baseline only.** Wire up per-fund projection with NO scenario shocks. Verify aggregate output matches sum of AV trajectories exactly. This is the unit test that the architecture is right.
2. **Layer infrastructure.** `AmortLayer`, `solveLayerPayment`, `layerPaymentAt`, sign conventions, growth-rate handling. Tests.
3. **Return-experience layers.** Wire experience-loss computation, spawn layers, sum into scheduled_ER. Verify Example B numerically.
4. **Extras and POB.** Should fall out of return-experience machinery. Verify Example C.
5. **Discount rate change.** AAL re-pricing layer at t_0. Verify Example D.
6. **Target FR / target year overrides.** Override layer at t_0. Validate at default values (should produce zero layer).
7. **Aggregate composition.** Replace the synthetic aggregate engine with sum-of-funds.
8. **UI wiring.** Update sliders to delta-based for return; remove aggregate-specific slider logic.

### Regression tests (non-negotiable)

- **AV tie-out:** for each fund f and each fy in baseline range, `engine(f, defaults)[fy].employerContribution == AV[f][fy].employerContribution` within $10K rounding.
- **Aggregate tie-out:** same, comparing aggregate engine output to sum of per-fund AVs.
- **Layer sign invariants:** a positive return delta (returns beat assumption) produces a negative layer balance; total ER strictly decreases vs baseline. Symmetric for negative delta.
- **Floor invariant:** total_ER >= 0 for all years and all scenarios.
- **Layer retirement:** no layer pays past `targetYear` for that fund.

### Open implementation questions (resolved)

1. **NC_ER vs NC_EE split.** `NC_ER = normalCostTotal - employeeContribution`. Risk: AV's `employeeContribution` may net refunds. Mitigation: AV tie-out regression test catches it automatically. If tie-out fails by a margin that smells like a refund/contribution accounting mismatch, validate against one fund's AV PDF (PABF has the cleanest disclosure).
2. **Target FR / target year override semantics.** Replace AV amortization with re-derived schedule (see "Layer 3" above). Shorter target year cancels AV's tail amortization; longer target year stretches it. Default values produce a zero-payment layer (validated in regression test).
3. **Extras nominal-flat.** $1B/yr means $1B nominal every year through `targetYear`. Slider label must say "nominal, flat per year."
4. **POBs removed.** No POB slider, no POB scenario param. Extras handle all "what if we paid more in" questions.
5. **Per-fund discount rate sliders.** v2 applies one delta across all funds when viewing aggregate; per-fund sliders deferred.

### Out of scope for v2

- Historical counterfactuals (separate engine, separate doc)
- UAAL decomposition (separate engine, separate doc)
- Monte Carlo return paths (bolt-on for actualReturnDelta)
- Tier 3 / benefit cuts (would shift AV.benefitPayments and AV.normalCostTotal — needs scenario-vector inputs)
- Mid-projection assumption changes (e.g., rate change in year 10 rather than year 1)
- POBs as a first-class concept (use extras instead — the engine is agnostic about funding source)

---

## What we get when this is done

- Baseline scenario matches the actuary's published projection exactly. Anyone looking at the dashboard against the published AVs sees the same numbers. Sniff test passes.
- Every slider movement produces a traceable, signed delta from baseline. The "civic impact" of any single what-if is computable directly.
- The "missed assumptions cost the city $X" headline becomes a precise number — the sum of return-experience layer payments over the horizon — not a hand-wavy estimate.
- Per-fund honesty. Police/Fire (target 2055) and Muni/Laborers (target 2058) are projected on their own timelines and summed, not averaged into a synthetic single fund.
- Clean foundation for counterfactual and decomposition engines to share the layer abstraction.
