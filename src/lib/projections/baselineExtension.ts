/**
 * Baseline extrapolation past the AV's published projection horizon.
 *
 * Each fund's AV publishes `projectionsBaseline` out to some terminal year:
 *   MEABF -> 2075, LABF -> 2074, FABF -> 2062, PABF -> 2055 (statutory).
 *
 * When a scenario asks for a target year past this terminal year, we need
 * to extend the baseline. We do it via simple geometric extrapolation:
 *
 *   - Each field grows at its observed geometric rate over the AV's last
 *     `LOOKBACK_YEARS` rows.
 *   - For funds whose AV ends at/before their statutory target (PABF), ER
 *     undergoes a one-time step drop in the year after statutory, mirroring
 *     the amortization-off behavior seen in MEABF/LABF/FABF's post-target
 *     rows: ER = NC_ER + adminExpenses, then grows at payroll rate.
 *   - The synthesized rows preserve the existing AV rows untouched.
 *
 * Validation: when we truncate MEABF/LABF/FABF at their statutory target and
 * extrapolate forward, the synthesized rows should match the AV's published
 * post-target rows within a few percent for the headline fields (AAL, MVA,
 * payroll). See `tests/baselineExtension.test.ts`.
 */

import { DISCOUNT_SENSITIVITY } from '@/lib/data/discountSensitivity';
import { STATUTORY_TARGET_YEAR } from '@/lib/data/scenarioDefaults';
import type { FundId, YearObservation } from '@/types/pension';

const LOOKBACK_YEARS = 3;

/**
 * Number-valued YearObservation fields we extrapolate. Every other field
 * (allocation, membership, GASB-specific) is set to null in synthesized rows.
 */
const NUMERIC_FIELDS = [
  'aal',
  'aalGASB25',
  'tplGASB67',
  'mva',
  'ava',
  'mvaBeginning',
  'uaalAVA',
  'uaalMVA',
  'employerContribution',
  'employerContribRegular',
  'employerContribState',
  'employeeContribution',
  'totalContributions',
  'benefitPayments',
  'retBenefits',
  'colaBenefits',
  'refunds',
  'adminExpenses',
  'netCashflow',
  'normalCostTotal',
  'normalCostER',
  'normalCostEE',
  'payroll',
  'projectedPayroll',
] as const satisfies readonly (keyof YearObservation)[];

type NumericField = (typeof NUMERIC_FIELDS)[number];

function safeGet(row: YearObservation, field: NumericField): number | null {
  const v = row[field];
  return typeof v === 'number' ? v : null;
}

function geoRate(
  baseline: YearObservation[],
  field: NumericField,
  lookback: number,
): number {
  const lastIdx = baseline.length - 1;
  const last = safeGet(baseline[lastIdx], field);
  const startIdx = Math.max(0, lastIdx - lookback);
  const start = safeGet(baseline[startIdx], field);
  if (last === null || start === null || start <= 0 || last <= 0) return 0;
  const years = lastIdx - startIdx;
  if (years <= 0) return 0;
  return Math.pow(last / start, 1 / years) - 1;
}

/**
 * Build a map of every year in [firstFy, horizonFy] to its observation row.
 * Years past the AV's terminal year are synthesized via geometric
 * extrapolation; existing AV rows are preserved untouched.
 *
 * `flagExtrapolated`: if true, the synthesized rows carry `__extrapolated: true`
 * (a hidden marker for downstream code that wants to surface a provenance
 * note in the UI).
 */
export function buildExtendedBaseline(
  baseline: readonly YearObservation[],
  horizonFy: number,
  fundId: Exclude<FundId, 'aggregate'>,
  opts: { flagExtrapolated?: boolean } = {},
): {
  byFy: Map<number, YearObservation>;
  extrapolatedFys: number[];
} {
  const byFy = new Map<number, YearObservation>();
  for (const row of baseline) byFy.set(row.fy, row);

  const lastRow = baseline[baseline.length - 1];
  if (!lastRow || horizonFy <= lastRow.fy) {
    return { byFy, extrapolatedFys: [] };
  }

  const statutoryTarget = STATUTORY_TARGET_YEAR[fundId];
  const lastIsPreOrAtTarget = lastRow.fy <= statutoryTarget;

  // Geometric growth rates for each numeric field over the AV's last
  // LOOKBACK_YEARS rows. For funds whose AV runs past statutory, these
  // capture the post-target steady-state trajectory.
  const lookback = Math.min(LOOKBACK_YEARS, baseline.length - 1);
  const rates = {} as Record<NumericField, number>;
  for (const f of NUMERIC_FIELDS) {
    rates[f] = geoRate([...baseline], f, lookback);
  }

  // For funds whose AV ends at/before statutory (PABF), MVA's last few rows
  // are dominated by the FR ramp (5%+ MVA growth while AAL is flat). Locking
  // MVA to track AAL post-statutory preserves the final funded ratio and
  // matches the steady-state behavior observed in MEABF/LABF/FABF's
  // post-target rows.
  if (lastIsPreOrAtTarget) {
    rates.mva = rates.aal;
    rates.ava = rates.aal;
    rates.uaalAVA = rates.aal;
    rates.uaalMVA = rates.aal;
    rates.mvaBeginning = rates.aal;
  }

  // For funds whose AV ends at/before statutory (PABF), ER needs a regime
  // change in the first post-statutory year: amortization ramp turns off,
  // and ER drops to the level required to maintain FR at steady state.
  // The structural identity (from the AV's MVA roll-forward):
  //
  //   MVA[t] = MVA[t-1] * (1 + r) + ER[t] + EE[t] - benefits[t] - admin[t]
  //
  // Locking MVA growth to g_AAL (so funded ratio holds):
  //
  //   ER[t] = MVA[t-1] * (g_AAL - r) + benefits[t] + admin[t] - EE[t]
  //
  // Validated against MEABF/LABF/FABF's published post-target rows: this
  // formula predicts within 10-20% of actual (under-predicts modestly,
  // probably because the AV's roll-forward includes net investment
  // expense the identity doesn't capture). The naive "NC_ER + admin"
  // step-down was off by 2-10x — it ignored that at 90% funded the city
  // must keep filling negative cashflow.
  const baselineDiscountRate =
    lastRow.discountRate ?? DISCOUNT_SENSITIVITY[fundId].baselineRate;
  const aalGrowthRate = rates.aal;

  const extrapolatedFys: number[] = [];

  let prevSynthMva: number | null = lastRow.mva;

  for (let fy = lastRow.fy + 1; fy <= horizonFy; fy++) {
    const k = fy - lastRow.fy;
    const synth: Partial<Record<NumericField, number | null>> = {};
    for (const f of NUMERIC_FIELDS) {
      const base = safeGet(lastRow, f);
      synth[f] = base !== null ? base * Math.pow(1 + rates[f], k) : null;
    }

    // ER step-down: applies in every year past statutory, for funds where
    // the AV's last row is at/before statutory. Computed from the
    // roll-forward identity rather than as a fixed NC + admin floor.
    if (lastIsPreOrAtTarget && fy > statutoryTarget && prevSynthMva !== null) {
      const benefits = synth.benefitPayments ?? 0;
      const ee = synth.employeeContribution ?? 0;
      const admin = synth.adminExpenses ?? 0;
      const er =
        prevSynthMva * (aalGrowthRate - baselineDiscountRate) +
        benefits +
        admin -
        ee;
      synth.employerContribution = Math.max(0, er);
    }

    prevSynthMva = synth.mva ?? prevSynthMva;

    const row: YearObservation = {
      fy,
      // Numeric fields from extrapolation
      aal: synth.aal ?? null,
      aalGASB25: synth.aalGASB25 ?? null,
      tplGASB67: synth.tplGASB67 ?? null,
      mva: synth.mva ?? null,
      ava: synth.ava ?? null,
      mvaBeginning: synth.mvaBeginning ?? null,
      uaalAVA: synth.uaalAVA ?? null,
      uaalMVA: synth.uaalMVA ?? null,
      npl: null,
      fundedRatioAVA: null,
      fundedRatioMVA:
        synth.mva !== null && synth.aal !== null && synth.aal! > 0
          ? synth.mva! / synth.aal!
          : null,
      fundedRatioGASB67: null,
      discountRate: lastRow.discountRate,
      inflationAssumption: lastRow.inflationAssumption,
      uaalAmortPeriod: null,
      employerContribution: synth.employerContribution ?? null,
      employerContribRegular: synth.employerContribRegular ?? null,
      employerContribState: synth.employerContribState ?? null,
      employeeContribution: synth.employeeContribution ?? null,
      totalContributions: synth.totalContributions ?? null,
      adec: null,
      statutoryRequired: null,
      percentRequiredPaid: null,
      contribShortfall: null,
      benefitPayments: synth.benefitPayments ?? null,
      retBenefits: synth.retBenefits ?? null,
      colaBenefits: synth.colaBenefits ?? null,
      refunds: synth.refunds ?? null,
      adminExpenses: synth.adminExpenses ?? null,
      netCashflow: synth.netCashflow ?? null,
      totalAdditions: null,
      netInvestmentIncome: null,
      interestDividends: null,
      fairValueChange: null,
      return1yr: null,
      return5yr: null,
      return10yr: null,
      normalCostTotal: synth.normalCostTotal ?? null,
      normalCostER: synth.normalCostER ?? null,
      normalCostEE: synth.normalCostEE ?? null,
      normalCostRateTotal: null,
      normalCostRateER: null,
      uaalRate: null,
      payroll: synth.payroll ?? null,
      projectedPayroll: synth.projectedPayroll ?? null,
      actives: null,
      avgActiveSalary: null,
      avgActiveAge: null,
      avgActiveTenure: null,
      beneficiaries: null,
      avgBenefit: null,
      beneficiariesServiceRetirees: null,
      beneficiariesDisability: null,
      beneficiariesSurvivors: null,
      inactiveVested: null,
      totalMembership: null,
      activesPerBeneficiary: null,
      allocation: {
        equity: null,
        fixedIncome: null,
        realEstate: null,
        privateEquity: null,
        hedgeFunds: null,
        cash: null,
        other: null,
        altMisc: null,
      },
      burnRate: null,
    };

    if (opts.flagExtrapolated) {
      (row as unknown as Record<string, unknown>).__extrapolated = true;
    }

    byFy.set(fy, row);
    extrapolatedFys.push(fy);
  }

  return { byFy, extrapolatedFys };
}
