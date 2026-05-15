/**
 * Aggregate scenario projection: runs the per-fund engine for all four
 * funds and sums per-year outputs. The aggregate view is never modeled as
 * a single synthetic fund; that approach (v1) papered over per-fund
 * heterogeneity in baseline rates, target years, and payroll growth.
 *
 * When the user is viewing aggregate and moves a slider (e.g. assumed
 * return delta), the same delta is applied to all four funds. Per-fund
 * sliders are a future enhancement.
 */

import { STATUTORY_TARGET_YEAR } from '@/lib/data/scenarioDefaults';
import type { FundId, FundTimeSeries } from '@/types/pension';
import { ALL_FUND_IDS } from '@/types/pension';
import {
  type PerFundProjectedYear,
  type PerFundProjectionResult,
  type PerFundScenarioParams,
  runPerFundProjection,
} from './perFund';

export interface AggregateProjectedYear {
  fy: number;
  aal: number;
  mva: number;
  uaal: number;
  fundedRatio: number;
  employerContribution: number;
  employeeContribution: number;
  benefitPayments: number;
  payroll: number;
  layerPayment: number;
  extraPayment: number;
}

export interface AggregateProjectionResult {
  startFy: number;
  /** The four per-fund projections, in canonical order. */
  perFund: Record<Exclude<FundId, 'aggregate'>, PerFundProjectionResult>;
  years: AggregateProjectedYear[];
  finalFundedRatio: number;
  cumulativeEmployerContrib: number;
}

/**
 * Build aggregate-level params per fund. The user-facing aggregate scenario
 * applies a single set of slider values to all four funds, except for
 * `targetYear`, which is per-fund unless the user overrides it.
 */
export function buildPerFundParams(
  base: Omit<PerFundScenarioParams, 'targetYear'> & {
    /** If provided, overrides each fund's statutory target year. */
    targetYearOverride?: number;
  },
): Record<Exclude<FundId, 'aggregate'>, PerFundScenarioParams> {
  const { targetYearOverride, ...rest } = base;
  const out = {} as Record<Exclude<FundId, 'aggregate'>, PerFundScenarioParams>;
  for (const id of ALL_FUND_IDS) {
    out[id] = {
      ...rest,
      targetYear: targetYearOverride ?? STATUTORY_TARGET_YEAR[id],
    };
  }
  return out;
}

/**
 * Run an aggregate projection by running each fund independently and
 * summing per-year outputs. The aggregate funded ratio is computed as
 * `sum(mva) / sum(aal)`.
 *
 * The aggregate horizon is the max of the per-fund horizons. For years
 * where one fund's projection has ended (e.g. PABF baseline stops at 2055
 * while MEABF runs to 2074), that fund contributes 0 to all sums in those
 * years. This is the right convention for the contributions chart — once
 * a fund hits its target year, its required ER drops to normal cost only
 * and the long-tail story is dominated by the funds that haven't yet
 * reached target.
 */
export function runAggregateProjection(
  funds: Record<Exclude<FundId, 'aggregate'>, FundTimeSeries>,
  paramsPerFund: Record<Exclude<FundId, 'aggregate'>, PerFundScenarioParams>,
): AggregateProjectionResult {
  const perFund = {} as Record<Exclude<FundId, 'aggregate'>, PerFundProjectionResult>;
  let maxHorizon = -Infinity;
  let minStartFy = Infinity;

  for (const id of ALL_FUND_IDS) {
    const result = runPerFundProjection(funds[id], paramsPerFund[id]);
    perFund[id] = result;
    if (result.years.length === 0) continue;
    maxHorizon = Math.max(maxHorizon, result.years[result.years.length - 1].fy);
    minStartFy = Math.min(minStartFy, result.startFy);
  }

  if (!Number.isFinite(maxHorizon) || !Number.isFinite(minStartFy)) {
    throw new Error('No per-fund projections produced any years.');
  }

  // Build an index per fund for fast year-by-year sums.
  const byFundByFy = new Map<
    Exclude<FundId, 'aggregate'>,
    Map<number, PerFundProjectedYear>
  >();
  for (const id of ALL_FUND_IDS) {
    const m = new Map<number, PerFundProjectedYear>();
    for (const y of perFund[id].years) m.set(y.fy, y);
    byFundByFy.set(id, m);
  }

  const years: AggregateProjectedYear[] = [];
  let cumulativeEmployerContrib = 0;
  const firstFy = Math.min(...ALL_FUND_IDS.map((id) => perFund[id].years[0]?.fy ?? Infinity));

  for (let fy = firstFy; fy <= maxHorizon; fy++) {
    let aal = 0;
    let mva = 0;
    let er = 0;
    let ee = 0;
    let benefits = 0;
    let payroll = 0;
    let layerPayment = 0;
    let extraPayment = 0;

    for (const id of ALL_FUND_IDS) {
      const y = byFundByFy.get(id)!.get(fy);
      if (!y) continue;
      aal += y.aal;
      mva += y.mva;
      er += y.employerContribution;
      ee += y.employeeContribution;
      benefits += y.benefitPayments;
      payroll += y.payroll;
      layerPayment += y.layerPayment;
      extraPayment += y.extraPayment;
    }

    const fundedRatio = aal > 0 ? mva / aal : 0;
    cumulativeEmployerContrib += er;
    years.push({
      fy,
      aal,
      mva,
      uaal: aal - mva,
      fundedRatio,
      employerContribution: er,
      employeeContribution: ee,
      benefitPayments: benefits,
      payroll,
      layerPayment,
      extraPayment,
    });
  }

  const finalFundedRatio = years[years.length - 1]?.fundedRatio ?? 0;

  return {
    startFy: minStartFy,
    perFund,
    years,
    finalFundedRatio,
    cumulativeEmployerContrib,
  };
}
