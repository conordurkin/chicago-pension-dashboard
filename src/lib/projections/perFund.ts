/**
 * Per-fund scenario projection (v2 engine).
 *
 * Anchors on each fund's published FY2024 actuarial valuation baseline
 * (`projectionsBaseline`) and treats scenario shocks as layered deltas
 * spawned on top of it. When no shocks are active, output equals the AV
 * trajectory by construction — this is the regression test that proves
 * the architecture is sound.
 *
 * Scope of this module: a single fund. Aggregate projections live in
 * `aggregate.ts` and call into this module four times.
 */

import {
  DISCOUNT_SENSITIVITY,
  interpolateTpl,
  ncScaleFromRate,
  type DiscountRateSensitivity,
} from '@/lib/data/discountSensitivity';
import {
  PAYROLL_GROWTH,
  STATUTORY_TARGET_FR,
  STATUTORY_TARGET_YEAR,
} from '@/lib/data/scenarioDefaults';
import type { FundId, FundTimeSeries, YearObservation } from '@/types/pension';
import { buildExtendedBaseline } from './baselineExtension';
import {
  type AmortLayer,
  type AmortMethod,
  makeLayer,
  sumLayerPayments,
} from './layers';

/**
 * Minimum |experience gain| in dollars required to spawn a new layer.
 * Below this, the gain is treated as floating-point noise and discarded.
 */
const LAYER_SPAWN_THRESHOLD = 1;

export interface PerFundScenarioParams {
  /** Signed delta from the fund's baseline discount rate. -0.01 to +0.01. */
  assumedReturnDelta: number;
  /** Signed delta from the assumed return for actual returns each year. */
  actualReturnDelta: number;
  /** Target funded ratio at targetYear. Defaults to 0.90 (statutory). */
  targetFundedRatio: number;
  /** Year by which target funded ratio is hit. Defaults to fund's statutory year. */
  targetYear: number;
  /** Amortization method for spawned layers. */
  amortMethod: AmortMethod;
  /**
   * Extra employer payment, nominal and flat. Added directly to total ER
   * for the first `extraPaymentYears` years (no payroll growth). Each year's
   * extra payment is treated as an experience gain that spawns a relief
   * layer running from the next year through targetYear, mirroring how a
   * fund's AV would re-amortize the smaller UAAL each subsequent year.
   */
  extraAnnualPayment: number;
  /**
   * Number of consecutive years (starting from the first projected year)
   * to make the extra payment. Defaults to the full span through targetYear.
   * If 0 or undefined, no extras are paid even if `extraAnnualPayment > 0`.
   */
  extraPaymentYears?: number;
  /**
   * Final year to project through. Defaults to targetYear. Useful for
   * showing the post-target steady state.
   */
  horizonYear?: number;
}

export interface PerFundProjectedYear {
  fy: number;
  aal: number;
  mva: number;
  uaal: number;
  fundedRatio: number;
  employerContribution: number;
  employeeContribution: number;
  benefitPayments: number;
  payroll: number;
  /** Discount/assumed return used in this projection (after delta). */
  assumedReturn: number;
  /** Realized return (assumed + actualReturnDelta). */
  actualReturn: number;
  /** Active scenario layers' net payment contribution at this year. */
  layerPayment: number;
  /** Extras paid this year (flat nominal). */
  extraPayment: number;
}

export interface PerFundProjectionResult {
  fundId: Exclude<FundId, 'aggregate'>;
  startFy: number;
  params: PerFundScenarioParams;
  baselineRate: number;
  effectiveAssumedReturn: number;
  years: PerFundProjectedYear[];
  layers: AmortLayer[];
  /** Funded ratio at the final year of the projection. */
  finalFundedRatio: number;
  /** Cumulative employer contribution from startFy+1 through horizonYear. */
  cumulativeEmployerContrib: number;
}

/**
 * Build the default per-fund params: no shocks, statutory targets.
 * Equivalent to running the AV baseline directly.
 */
export function defaultPerFundParams(
  fundId: Exclude<FundId, 'aggregate'>,
): PerFundScenarioParams {
  return {
    assumedReturnDelta: 0,
    actualReturnDelta: 0,
    targetFundedRatio: STATUTORY_TARGET_FR,
    targetYear: STATUTORY_TARGET_YEAR[fundId],
    amortMethod: 'levelPercent',
    extraAnnualPayment: 0,
  };
}

/** Read an AV baseline row's required numeric field, throwing if missing. */
function readBaselineField(
  row: YearObservation,
  field: 'aal' | 'mva' | 'employerContribution' | 'employeeContribution' | 'benefitPayments' | 'payroll',
): number {
  const v = row[field];
  if (v === null || v === undefined) {
    throw new Error(
      `AV baseline row FY ${row.fy} is missing required field '${field}'.`,
    );
  }
  return v;
}

/**
 * Approximate total normal cost for an AV baseline row.
 *
 * MEABF and LABF publish `normalCostTotal` directly. PABF and FABF only
 * publish the employer share (`normalCostER`); for those we estimate total
 * NC as `normalCostER + employeeContribution`. EE contribution is statutorily
 * a fixed percent of pay, which serves as a close proxy for the EE share of
 * normal cost. Validated against GASB-disclosed service cost: the proxy is
 * within ~3-4% of the disclosed value for both PABF and FABF.
 *
 * Used when re-pricing NC under a non-zero `assumedReturnDelta`.
 */
function getNCTotalAtRow(row: YearObservation): number {
  if (row.normalCostTotal !== null && row.normalCostTotal !== undefined) {
    return row.normalCostTotal;
  }
  const ncEr = row.normalCostER ?? 0;
  const ee = row.employeeContribution ?? 0;
  return ncEr + ee;
}

/**
 * Run a per-fund scenario projection.
 *
 * AV-anchored: the AV's published `projectionsBaseline` is the no-shock
 * trajectory. Scenario shocks (actual-return deviations, extra ER payments)
 * are expressed as perturbations from that trajectory, with each year's
 * experience gain or loss spawning a new closed-period amortization layer
 * that runs to `targetYear`.
 *
 * Tracking convention: we project `actualMVA[t] = AV[t].mva + perturbation[t]`
 * rather than recomputing MVA from a recurrence. This keeps the baseline
 * scenario tied to the AV exactly (perturbation = 0 each year), and treats
 * any drift in AV's own MVA recurrence as part of the ground-truth baseline
 * rather than as phantom experience.
 *
 * Perturbation recurrence (linearizing AV's roll-forward):
 *   pi[t] = pi[t-1] * (1 + rActual)
 *         + fullDelta * baselineMVA[t-1]
 *         + ncDelta[t] + layerPayment[t] + extras_t - shortfall_t
 *
 * Where:
 *   fullDelta = assumedReturnDelta + actualReturnDelta  (realized minus AV)
 *   rActual   = baselineRate + fullDelta                (realized rate)
 *   ncDelta   = (ncScale - 1) * NC_total                (NC re-pricing)
 *
 * Experience gain (the year's "new news" — amortized into a fresh layer):
 *   gain[t] = actualReturnDelta * actualMVA[t-1] + extras_t
 *
 * Two contributors spawn per-year relief layers: actual return deviations
 * (the "experience" in the actuarial sense) and voluntary extras (which
 * shrink the UAAL faster and so should reduce future scheduled ER, matching
 * how an AV would re-amortize the smaller UAAL each subsequent year).
 * `assumedReturnDelta` is a one-time re-pricing handled by the unified
 * policy layer spawned at t_0, not by per-year experience layers.
 *
 * Not yet wired (subsequent build steps): target FR / target year override
 * layers (step 6). These slot into the same loop without changing the
 * recurrence.
 */
export function runPerFundProjection(
  fund: FundTimeSeries,
  params: PerFundScenarioParams,
): PerFundProjectionResult {
  const fundId = fund.metadata.id;
  if (fundId === 'aggregate') {
    throw new Error('runPerFundProjection cannot be called on the aggregate fund.');
  }
  const baseline = fund.projectionsBaseline;
  if (!baseline || baseline.length === 0) {
    throw new Error(`Fund ${fundId} has no projectionsBaseline.`);
  }
  const observations = fund.observations;
  if (observations.length === 0) {
    throw new Error(`Fund ${fundId} has no observations.`);
  }
  const lastObserved = observations[observations.length - 1];
  if (lastObserved.mva === null || lastObserved.mva === undefined) {
    throw new Error(
      `Fund ${fundId} last observed year FY ${lastObserved.fy} is missing MVA.`,
    );
  }

  const sensitivity: DiscountRateSensitivity = DISCOUNT_SENSITIVITY[fundId];
  const baselineRate = sensitivity.baselineRate;
  const r = baselineRate + params.assumedReturnDelta;
  const actualDelta = params.actualReturnDelta;
  // Realized return deviates from AV's baseline by (assumed + actual). The AV
  // trajectory was built at AV baseline; we project against a realized rate
  // of baselineRate + fullDelta. The perturbation recurrence's cross-term
  // (return on AV's MVA) must use fullDelta to capture the higher/lower
  // realized return implied by moving the assumed slider, not just the
  // experience deviation.
  const fullDelta = params.assumedReturnDelta + actualDelta;
  const rActual = baselineRate + fullDelta;
  const payrollGrowth = PAYROLL_GROWTH[fundId];

  // AAL re-pricing factor: GASB sensitivity gives TPL at baseline +/-1pp.
  // Linearly interpolated TPL at the new rate divided by TPL at baseline.
  // 1.0 when the slider is at baseline; >1 when rate moves down (AAL grows);
  // <1 when rate moves up (AAL shrinks). NC scales by the same ratio as
  // TPL — a conservative under-estimate of NC sensitivity (see comments in
  // discountSensitivity.ts).
  const drRatio =
    sensitivity.tplAtBaseline > 0
      ? interpolateTpl(r, sensitivity) / sensitivity.tplAtBaseline
      : 1;
  const ncScale = ncScaleFromRate(r, sensitivity);

  const startFy = lastObserved.fy;
  const horizonYear = params.horizonYear ?? params.targetYear;
  // If the user's targetYear/horizon extends past the AV's published last fy,
  // synthesize the missing rows via geometric extrapolation. See
  // `baselineExtension.ts` for the methodology and the validation tests in
  // `baselineExtension.test.ts` that pin down accuracy vs published AV rows.
  const extendedHorizon = Math.max(
    horizonYear,
    params.targetYear,
    baseline[baseline.length - 1].fy,
  );
  const { byFy: baselineByFy } = buildExtendedBaseline(
    baseline,
    extendedHorizon,
    fundId,
  );

  const layers: AmortLayer[] = [];

  // Unified funding-policy layer: sized analytically so the final perturbation
  // pi[T_user] brings projected MVA to target_FR * AAL_new[T_user] exactly.
  //
  // Three params trigger the layer to spawn:
  //   (1) assumedReturnDelta != 0  (rate slider — AAL re-pricing)
  //   (2) targetYear != AV.targetYear (user-set target year override)
  //   (3) targetFundedRatio != STATUTORY_TARGET_FR (user-set FR override)
  //
  // Extras are deliberately NOT in this list. Extras are a transparent
  // additive payment by intent — the user sees "ER = baseline schedule +
  // extras" each year and the fund grows accordingly. If extras compound
  // past the target funded ratio, that overshoot is the answer the user is
  // looking for. Absorbing extras into the unified layer would offset
  // scheduled ER by the same amount, defeating the slider's purpose.
  //
  // The desired final perturbation:
  //   pi[T_user] = target_FR * drRatio * AAL_AV[T_user] - AV.mva[T_user]
  //
  // This generalizes the rate-only case (T_user = AV.targetYear, target_FR =
  // 0.9, AV.mva[T] = 0.9 * AAL_AV[T]) to target_FR * (drRatio - 1) * AAL_AV[T]
  // and the target-override case (drRatio = 1) to (target_FR * AAL_AV[T_user] -
  // AV.mva[T_user]).
  //
  // The naive balance `(drRatio - 1) * AAL[firstFy]` over-sizes the layer
  // because it ignores three effects in the recurrence:
  //   (a) assumedDelta cross-term: realized return shifts by assumedDelta, so
  //       MVA grows at a different rate every year. FV summed across [firstFy, T].
  //   (b) NC re-pricing (ncDelta): recurring annual drag/relief from changed NC.
  //   (c) AAL_AV[T] is the right reference — not AAL[firstFy].
  // The actualReturnDelta portion of the cross-term is absorbed by experience
  // layers spawned year-by-year, NOT by this layer.
  //
  // Source label: 'aal-reprice' when only rate changed; 'target-override' when
  // target FR or target year deviates from AV defaults (with or without rate).
  const firstFy = baseline[0].fy;
  const targetRow = baselineByFy.get(params.targetYear);
  const isRateChange = Math.abs(drRatio - 1) > 1e-12;
  const isTargetOverride =
    params.targetYear !== STATUTORY_TARGET_YEAR[fundId] ||
    Math.abs(params.targetFundedRatio - STATUTORY_TARGET_FR) > 1e-9;

  if ((isRateChange || isTargetOverride) && targetRow) {
    const targetAal = readBaselineField(targetRow, 'aal');
    const targetAvMva = readBaselineField(targetRow, 'mva');
    const N = params.targetYear - firstFy + 1;

    // FV-at-targetYear of cross-term and NC delta contributions.
    // BMVA_prev[k=0] = lastObserved.mva; BMVA_prev[k>=1] = AV.MVA[firstFy+k-1].
    let bmvaCrossFv = 0;
    let ncDeltaFv = 0;
    let bmvaPrev = lastObserved.mva;
    for (let k = 0; k < N; k++) {
      const rowK = baselineByFy.get(firstFy + k);
      if (!rowK) break;
      const fvFactor = Math.pow(1 + r, N - 1 - k);
      bmvaCrossFv += bmvaPrev * fvFactor;
      const ncTot = getNCTotalAtRow(rowK);
      ncDeltaFv += (ncScale - 1) * ncTot * fvFactor;
      bmvaPrev = readBaselineField(rowK, 'mva');
    }

    const desiredFv = params.targetFundedRatio * drRatio * targetAal - targetAvMva;
    const balance =
      (desiredFv - params.assumedReturnDelta * bmvaCrossFv - ncDeltaFv) /
      Math.pow(1 + r, N);

    const source = isTargetOverride ? 'target-override' : 'aal-reprice';
    const layer = makeLayer({
      source,
      balance,
      startFy: firstFy,
      endFy: params.targetYear,
      rate: r,
      amortMethod: params.amortMethod,
      payrollGrowth,
    });
    if (layer) layers.push(layer);
  }

  const years: PerFundProjectedYear[] = [];
  let cumulativeEmployerContrib = 0;

  // Perturbation state. At t_0 (last observed year), actual MVA equals AV's
  // implicit starting MVA, so perturbation = 0. We carry prevBaselineMva /
  // prevActualMva across the loop.
  let perturbation = 0;
  let prevBaselineMva = lastObserved.mva;
  let prevActualMva = lastObserved.mva;

  for (let fy = baseline[0].fy; fy <= horizonYear; fy++) {
    const row = baselineByFy.get(fy);
    if (!row) {
      throw new Error(
        `Fund ${fundId} baseline is missing FY ${fy} (projects ${baseline[0].fy}-${baseline[baseline.length - 1].fy}).`,
      );
    }

    const aalAV = readBaselineField(row, 'aal');
    const aal = aalAV * drRatio;
    const baselineMva = readBaselineField(row, 'mva');
    const baselineER = readBaselineField(row, 'employerContribution');
    const ee = readBaselineField(row, 'employeeContribution');
    const benefits = readBaselineField(row, 'benefitPayments');
    const payroll = readBaselineField(row, 'payroll');

    // NC delta: direct adjustment to baseline_ER each year for the change in
    // normal cost under the new rate. Not a layer — it is a recurring annual
    // cost re-pricing, not a one-time UAAL amortization.
    const ncTotal = getNCTotalAtRow(row);
    const ncDelta = (ncScale - 1) * ncTotal;

    // Layers that already exist (spawned in prior years, or the AAL re-pricing
    // layer spawned at start) pay out this year.
    const layerPayment = sumLayerPayments(layers, fy);
    const scheduledER = baselineER + ncDelta + layerPayment;
    // Extras run from the first projected year for `extraPaymentYears`
    // consecutive years (default: full span through targetYear). After
    // that the user pays scheduled ER only — the relief layers spawned by
    // those prior extras continue paying out, reducing scheduled ER.
    const extrasYearsCount =
      params.extraPaymentYears ?? params.targetYear - firstFy + 1;
    const extras =
      fy < firstFy + extrasYearsCount && fy <= params.targetYear
        ? params.extraAnnualPayment
        : 0;
    const unfloorTotalER = scheduledER + extras;
    const totalER = Math.max(0, unfloorTotalER);
    const shortfall = unfloorTotalER - totalER; // <= 0, present only under the floor

    // Experience gain this year: deviation that should spawn an amortization
    // layer over the remaining horizon. Three contributors:
    //   - actualDelta * prevActualMva: returns deviation from the new assumed
    //     rate (the only "experience" in the actuarial sense)
    //   - extras: a voluntary cash payment that reduces UAAL faster, treated
    //     just like a positive return-experience gain — amortized into a
    //     relief layer that reduces future scheduled ER
    // Floor-clipped relief (shortfall) is NOT pulled back into the gain.
    // When relief overruns the city's ability to pay (ER floors at 0), the
    // missing relief is simply lost rather than being re-amortized back
    // into more relief — that path produces a runaway spiral in late years.
    const gain = actualDelta * prevActualMva + extras;

    // Update perturbation. See recurrence in the function-level docstring.
    // The cross-term uses fullDelta (assumed + actual) — the AV's MVA grew
    // at AV baseline rate, and actual MVA grows at baselineRate + fullDelta,
    // so the per-year deviation on AV.MVA[t-1] is fullDelta * AV.MVA[t-1].
    // Perturbation tracks actual MVA minus AV MVA, so it reflects the cash
    // the city ACTUALLY paid (totalER), not the unfloored amount.
    perturbation =
      perturbation * (1 + rActual) +
      fullDelta * prevBaselineMva +
      ncDelta +
      layerPayment +
      extras -
      shortfall;

    const actualMva = baselineMva + perturbation;
    const uaal = aal - actualMva;
    const fundedRatio = aal > 0 ? actualMva / aal : 0;

    // Spawn a new layer for this year's experience. It pays from next year
    // through the fund's target year. Skip if there's no future window left.
    const yearsRemaining = params.targetYear - fy;
    if (yearsRemaining > 0 && Math.abs(gain) >= LAYER_SPAWN_THRESHOLD) {
      const layer = makeLayer({
        source: 'return-experience',
        balance: -gain, // gain (positive) -> negative balance -> relief
        startFy: fy + 1,
        endFy: params.targetYear,
        rate: r,
        amortMethod: params.amortMethod,
        payrollGrowth,
      });
      if (layer) layers.push(layer);
    }

    cumulativeEmployerContrib += totalER;

    years.push({
      fy,
      aal,
      mva: actualMva,
      uaal,
      fundedRatio,
      employerContribution: totalER,
      employeeContribution: ee,
      benefitPayments: benefits,
      payroll,
      assumedReturn: r,
      actualReturn: rActual,
      layerPayment,
      extraPayment: extras,
    });

    prevBaselineMva = baselineMva;
    prevActualMva = actualMva;
  }

  const finalFundedRatio = years[years.length - 1]?.fundedRatio ?? 0;

  return {
    fundId,
    startFy,
    params,
    baselineRate,
    effectiveAssumedReturn: r,
    years,
    layers,
    finalFundedRatio,
    cumulativeEmployerContrib,
  };
}
