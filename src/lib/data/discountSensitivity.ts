/**
 * Discount-rate sensitivity anchors from each fund's GASB 67/68 disclosures
 * as of December 31, 2025 (FY2025).
 *
 * GASB requires plans to disclose the Net Pension Liability (NPL) at the
 * baseline discount rate as well as 1pp above and below it. We use these
 * three anchor points to linearly interpolate the Total Pension Liability
 * (TPL = AAL) at any rate within ±1pp of baseline. This is the method
 * powering the "assumed return" slider on the Scenarios page: when the
 * user picks a different discount rate, the projection's starting AAL is
 * recomputed from these anchors instead of being held fixed.
 *
 * NPL = TPL - FNP (Plan Fiduciary Net Position). FNP is the actual market
 * value of plan assets at the measurement date and does NOT change with
 * the discount rate assumption — so TPL anchors are derived as
 * NPL_anchor + FNP.
 *
 * GASB does not require disclosure of Normal Cost (Service Cost) sensitivity
 * to the discount rate. NC has higher duration than TPL because new accruals
 * pay out further into the future. We approximate NC sensitivity by scaling
 * NC by the same percentage change as TPL — a conservative under-estimate
 * (typical NC duration is roughly 1.5x TPL duration). For the civic-narrative
 * use case this is close enough; the dominant scenario effect comes from the
 * AAL/UAAL re-pricing.
 *
 * Each per-fund baseline rate is the Single Equivalent Discount Rate (SEDR)
 * disclosed for the 12/31/2025 measurement date. As of FY2025, MEABF and
 * FABF discount at their full 6.75% long-term return assumption (assets are
 * no longer projected to deplete under the statutory funding schedule);
 * LABF (6.70%) and PABF (6.65%) remain slightly blended with the 4.83%
 * 20-year tax-exempt municipal bond rate.
 *
 * Aggregate anchors are simple sums of the four fund anchors. The aggregate
 * baseline rate is the TPL-weighted average of the four fund baselines.
 * Because the four fund baselines all cluster within 10 bps of each other
 * (6.65% to 6.75%), treating the aggregate as a single fund with one
 * baseline is a reasonable approximation for civic-illustration purposes.
 *
 * Sources: FABF 12/31/2025 AV GASB section; PABF FY2025 audited financial
 * statements Note 9; MEABF and LABF sensitivity tables from the City of
 * Chicago FY2025 ACFR pension note (dollars in thousands there, so those
 * two funds' anchors carry thousands precision).
 */

import type { FundId } from '@/types/pension';

export interface DiscountRateSensitivity {
  fundId: FundId;
  baselineRate: number;
  /** Total Pension Liability at baseline rate minus 1pp. */
  tplAtMinus1pp: number;
  /** Total Pension Liability at baseline rate. */
  tplAtBaseline: number;
  /** Total Pension Liability at baseline rate plus 1pp. */
  tplAtPlus1pp: number;
  /** Plan Fiduciary Net Position (market value of assets, fixed across rates). */
  fnpBaseline: number;
  /** Service cost (employer + employee normal cost) at baseline. */
  serviceCostBaseline: number;
  /** Citation for the source disclosure. */
  source: string;
}

export const DISCOUNT_SENSITIVITY: Record<FundId, DiscountRateSensitivity> = {
  fabf: {
    fundId: 'fabf',
    baselineRate: 0.0675,
    tplAtMinus1pp: 8_970_663_456,
    tplAtBaseline: 8_029_795_014,
    tplAtPlus1pp: 7_240_069_231,
    fnpBaseline: 2_027_244_092,
    serviceCostBaseline: 113_801_870,
    source: 'FABF Actuarial Valuation, December 31, 2025, GASB 67/68 section — Sensitivity of NPL to changes in the discount rate.',
  },
  meabf: {
    fundId: 'meabf',
    baselineRate: 0.0675,
    tplAtMinus1pp: 23_007_139_834,
    tplAtBaseline: 20_564_556_747,
    tplAtPlus1pp: 18_519_693_834,
    fnpBaseline: 5_794_678_834,
    serviceCostBaseline: 373_274_000,
    source: 'City of Chicago FY2025 ACFR pension note — MEABF sensitivity of NPL to the discount rate (12/31/2025).',
  },
  labf: {
    fundId: 'labf',
    baselineRate: 0.067,
    tplAtMinus1pp: 3_513_940_384,
    tplAtBaseline: 3_150_237_384,
    tplAtPlus1pp: 2_844_579_384,
    fnpBaseline: 1_389_298_384,
    serviceCostBaseline: 43_554_000,
    source: 'City of Chicago FY2025 ACFR pension note — LABF sensitivity of NPL to the discount rate (12/31/2025).',
  },
  pabf: {
    fundId: 'pabf',
    baselineRate: 0.0665,
    tplAtMinus1pp: 21_230_224_156,
    tplAtBaseline: 18_886_619_087,
    tplAtPlus1pp: 16_938_524_498,
    fnpBaseline: 4_993_424_701,
    serviceCostBaseline: 314_750_903,
    source: 'PABF FY2025 Audited Financial Statements, Note 9 — Sensitivity of NPL to the Single Discount Rate assumption (12/31/2025).',
  },
  // Aggregate: TPL anchors and FNP / service cost are simple sums of the four
  // funds. Baseline rate is the TPL-weighted average of the four baselines:
  //   (0.0675 * 20.565B + 0.0670 * 3.150B + 0.0665 * 18.887B + 0.0675 * 8.030B)
  //     / 50.631B  =  0.06710
  aggregate: {
    fundId: 'aggregate',
    baselineRate: 0.0671,
    tplAtMinus1pp: 56_721_967_830,
    tplAtBaseline: 50_631_208_232,
    tplAtPlus1pp: 45_542_866_947,
    fnpBaseline: 14_204_646_011,
    serviceCostBaseline: 845_380_773,
    source: 'Sum of MEABF + LABF + PABF + FABF FY2025 GASB 67/68 disclosures. Aggregate baseline is the TPL-weighted average of fund baselines.',
  },
};

/**
 * Linearly interpolate Total Pension Liability at a given discount rate,
 * using the GASB sensitivity anchors. Rate is clamped to ±1pp of baseline.
 */
export function interpolateTpl(
  rate: number,
  s: DiscountRateSensitivity,
): number {
  const clamped = clampRateToRange(rate, s);
  if (clamped <= s.baselineRate) {
    // Interpolate between -1pp and baseline.
    const t = (s.baselineRate - clamped) / 0.01; // 0 at baseline, 1 at -1pp
    return s.tplAtBaseline + t * (s.tplAtMinus1pp - s.tplAtBaseline);
  }
  // Interpolate between baseline and +1pp.
  const t = (clamped - s.baselineRate) / 0.01;
  return s.tplAtBaseline + t * (s.tplAtPlus1pp - s.tplAtBaseline);
}

/**
 * Approximate the percent change in normal cost from baseline implied by
 * scaling proportional to the TPL change. This understates NC sensitivity
 * (NC has longer duration than TPL) but is a defensible approximation in
 * the absence of disclosed NC sensitivity. Returns a multiplier (e.g. 1.10
 * means NC scales up 10%).
 */
export function ncScaleFromRate(
  rate: number,
  s: DiscountRateSensitivity,
): number {
  const tplAtRate = interpolateTpl(rate, s);
  return tplAtRate / s.tplAtBaseline;
}

/** Clamp a discount rate to within ±1pp of the fund's baseline. */
export function clampRateToRange(
  rate: number,
  s: DiscountRateSensitivity,
): number {
  const min = s.baselineRate - 0.01;
  const max = s.baselineRate + 0.01;
  return Math.min(Math.max(rate, min), max);
}

/** Slider bounds for the Scenarios page assumed-return control. */
export function rateRange(s: DiscountRateSensitivity): { min: number; max: number } {
  // Round to 4 decimal places to avoid FP artifacts (e.g. 0.0666 - 0.01
  // would otherwise land at 0.056600000000000004, which prevents an HTML
  // range input with step=0.005 from reaching the upper bound).
  return {
    min: Math.round((s.baselineRate - 0.01) * 10000) / 10000,
    max: Math.round((s.baselineRate + 0.01) * 10000) / 10000,
  };
}
