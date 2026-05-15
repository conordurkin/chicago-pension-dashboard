/**
 * Projection engine for pension fund scenarios.
 *
 * Projects a fund's liability, assets, contributions, and funded ratio forward
 * year-by-year from the latest observed year. All math is deterministic and
 * runs client-side.
 *
 * Supports:
 * - Adjustable assumed (discount) return
 * - Multiple "actual return" schemes: meet assumption, miss by X, custom vector
 * - Level-dollar vs level-percent-of-pay amortization
 * - Extra one-time payments (e.g. POB infusion)
 * - Benefit-side payroll and benefit growth assumptions
 *
 * NOTE: This is a simplified actuarial model. It is intended for scenario
 * exploration and educational purposes, not for official funding policy
 * decisions. See the methodology page for assumptions and caveats.
 */

import type { YearObservation } from '@/types/pension';
import { levelDollarPayment, levelPercentPayment } from './annuity';

export type AmortMethod = 'levelDollar' | 'levelPercent';

export type ReturnScheme =
  | { kind: 'meet' }
  | { kind: 'missBy'; pct: number } // e.g. -0.01 = underperform by 1pp
  | { kind: 'constant'; rate: number }
  | { kind: 'custom'; returns: number[] };

export interface ProjectionParameters {
  /** Assumed (discount) return rate, decimal. */
  assumedReturn: number;
  /** Scheme for what actual returns to use in the projection. */
  returnScheme: ReturnScheme;
  /** Target funded ratio (decimal). */
  targetFundedRatio: number;
  /** Year by which to reach target. */
  targetYear: number;
  /** Amortization method. */
  amortMethod: AmortMethod;
  /** Assumed annual payroll growth (decimal). */
  payrollGrowth: number;
  /** Assumed annual benefit payment growth (decimal). */
  benefitGrowth: number;
  /** Extra one-time employer payments, as year -> dollars. */
  extraPayments?: Record<number, number>;
  /** Pension Obligation Bond: one-time infusion, with year and amount. */
  pob?: { year: number; amount: number };
  /** Horizon override (defaults to targetYear). */
  horizonYear?: number;
  /**
   * Override starting AAL. Used when the assumed return differs from the
   * fund's baseline discount rate — the AAL is then re-priced at the new
   * rate using the GASB sensitivity table before the projection rolls
   * forward.
   */
  startingAalOverride?: number;
  /**
   * Multiplier applied to starting normal cost (both ER and EE). Used in
   * tandem with `startingAalOverride` to approximate the NC re-pricing at
   * a non-baseline discount rate.
   */
  startingNormalCostScale?: number;
}

export interface ProjectedYear {
  fy: number;
  aal: number;
  mva: number;
  uaal: number;
  fundedRatio: number;
  employerContribution: number;
  employeeContribution: number;
  benefitPayments: number;
  actualReturn: number;
  assumedReturn: number;
}

export interface ProjectionResult {
  /** The latest actually-observed year used as the starting point. */
  startFy: number;
  params: ProjectionParameters;
  /** Projected years starting from startFy+1. */
  years: ProjectedYear[];
  /** The year in which the target funded ratio is first reached (or null). */
  targetYearReached: number | null;
  /** Funded ratio at the final year. */
  finalFundedRatio: number;
  /** Cumulative employer contributions over the projection horizon. */
  cumulativeEmployerContrib: number;
}

/** Pick the actual return for year `t` based on the return scheme. */
function resolveActualReturn(
  scheme: ReturnScheme,
  assumedReturn: number,
  yearIndex: number,
): number {
  switch (scheme.kind) {
    case 'meet':
      return assumedReturn;
    case 'missBy':
      return assumedReturn + scheme.pct;
    case 'constant':
      return scheme.rate;
    case 'custom':
      return scheme.returns[yearIndex % scheme.returns.length];
  }
}

/**
 * Run the projection.
 *
 * Starting state is taken from the latest YearObservation. Each subsequent year
 * applies the standard pension recurrence:
 *
 *   AAL[t]  = AAL[t-1] * (1 + r) + normalCost - benefits
 *   MVA[t]  = MVA[t-1] * (1 + actualReturn) + contribs - benefits
 *   UAAL[t] = AAL[t] - MVA[t]
 *
 * The employer contribution each year is:
 *   normalCost_ER + amortPayment(UAAL, years remaining to target)
 */
export function runProjection(
  latest: YearObservation,
  params: ProjectionParameters,
): ProjectionResult {
  const startFy = latest.fy;
  const horizonYear = params.horizonYear ?? params.targetYear;
  const horizon = Math.max(1, horizonYear - startFy);

  // Starting state
  let aal = params.startingAalOverride ?? latest.aal ?? latest.aalGASB25 ?? 0;
  let mva = latest.mva ?? 0;
  const ncScale = params.startingNormalCostScale ?? 1;
  let normalCostER =
    (latest.normalCostER ?? (latest.normalCostTotal ?? 0) * 0.3) * ncScale;
  let normalCostEE =
    (latest.normalCostEE ?? (latest.normalCostTotal ?? 0) * 0.5) * ncScale;
  let benefits = latest.benefitPayments ?? 0;

  // If we don't have normal cost, estimate it from payroll * 15%
  if (normalCostER === 0 && latest.payroll) {
    normalCostER = latest.payroll * 0.05;
  }
  if (normalCostEE === 0 && latest.payroll) {
    normalCostEE = latest.payroll * 0.09;
  }
  if (benefits === 0 && aal > 0) {
    benefits = aal * 0.05; // fallback
  }

  const years: ProjectedYear[] = [];
  let targetReached: number | null = null;
  let cumulativeEmployerContrib = 0;

  for (let i = 1; i <= horizon; i++) {
    const fy = startFy + i;
    const yearsRemaining = Math.max(1, params.targetYear - fy + 1);

    // 1. Roll forward liability (growth at discount rate, less expected net outflow)
    aal = aal * (1 + params.assumedReturn) + normalCostER + normalCostEE - benefits;

    // 2. Determine actual return and roll forward assets
    const actualReturn = resolveActualReturn(params.returnScheme, params.assumedReturn, i - 1);

    // Compute employer contribution. We want to amortize the gap between assets
    // and the *target* asset level (= targetFR * AAL), not to fully fund.
    const targetAssets = aal * params.targetFundedRatio;
    const unfundedToTarget = Math.max(0, targetAssets - mva);
    let amortPayment: number;
    if (params.amortMethod === 'levelDollar') {
      amortPayment = levelDollarPayment(
        unfundedToTarget,
        params.assumedReturn,
        yearsRemaining,
      );
    } else {
      amortPayment = levelPercentPayment(
        unfundedToTarget,
        params.assumedReturn,
        params.payrollGrowth,
        yearsRemaining,
      );
    }

    let employerContrib = normalCostER + amortPayment;
    const extra = params.extraPayments?.[fy] ?? 0;
    employerContrib += extra;

    const employeeContrib = normalCostEE;
    const pobInfusion = params.pob && params.pob.year === fy ? params.pob.amount : 0;

    mva =
      mva * (1 + actualReturn) +
      employerContrib +
      employeeContrib +
      pobInfusion -
      benefits;

    const uaal = aal - mva;
    const fundedRatio = aal > 0 ? mva / aal : 0;

    if (targetReached === null && fundedRatio >= params.targetFundedRatio) {
      targetReached = fy;
    }

    cumulativeEmployerContrib += employerContrib;

    years.push({
      fy,
      aal,
      mva,
      uaal,
      fundedRatio,
      employerContribution: employerContrib,
      employeeContribution: employeeContrib,
      benefitPayments: benefits,
      actualReturn,
      assumedReturn: params.assumedReturn,
    });

    // 3. Grow cost structures for next year
    normalCostER *= 1 + params.payrollGrowth;
    normalCostEE *= 1 + params.payrollGrowth;
    benefits *= 1 + params.benefitGrowth;
  }

  const finalFundedRatio = years[years.length - 1]?.fundedRatio ?? 0;

  return {
    startFy,
    params,
    years,
    targetYearReached: targetReached,
    finalFundedRatio,
    cumulativeEmployerContrib,
  };
}

/** Sensible defaults for scenario UI initialization from a fund's latest observation. */
export function defaultParamsFromLatest(
  latest: YearObservation,
  targetYear: number,
): ProjectionParameters {
  return {
    assumedReturn: latest.discountRate ?? 0.07,
    returnScheme: { kind: 'meet' },
    targetFundedRatio: 0.9,
    targetYear,
    amortMethod: 'levelPercent',
    payrollGrowth: 0.03,
    benefitGrowth: 0.03,
  };
}
