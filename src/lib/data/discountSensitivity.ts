/**
 * Discount-rate sensitivity anchors from each fund's GASB 67/68 disclosures
 * in the FY2024 actuarial valuation.
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
 * Each per-fund baseline rate is the "single equivalent" or "blended"
 * discount rate disclosed in the GASB 24 report, reflecting the rate at
 * which projected benefit payments are discounted. For PABF/MEABF/LABF this
 * is a blend of the long-term investment return assumption and a 20-year
 * tax-exempt municipal bond rate (because assets are projected to deplete
 * before all benefits are paid). FABF assets do not deplete, so its baseline
 * equals its 6.75% long-term return assumption directly.
 *
 * Aggregate anchors are simple sums of the four fund anchors. The aggregate
 * baseline rate is the TPL-weighted average of the four fund baselines.
 * Because the four fund baselines all cluster within 13 bps of each other
 * (6.62% to 6.75%), treating the aggregate as a single fund with one
 * baseline is a reasonable approximation for civic-illustration purposes.
 *
 * Sources: each fund's "Sensitivity of Net Pension Liability to the Single
 * Discount Rate Assumption" disclosure in its FY2024 GASB 67/68 report.
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
    tplAtMinus1pp: 8_355_220_331,
    tplAtBaseline: 7_487_555_410,
    tplAtPlus1pp: 6_758_720_260,
    fnpBaseline: 1_774_238_618,
    serviceCostBaseline: 114_995_200,
    source: 'FABF GASB 67/68 Report, December 31, 2024 — Sensitivity of NPL to the Single Discount Rate Assumption.',
  },
  meabf: {
    fundId: 'meabf',
    baselineRate: 0.0662,
    tplAtMinus1pp: 22_634_114_654,
    tplAtBaseline: 20_205_143_108,
    tplAtPlus1pp: 18_173_829_557,
    fnpBaseline: 5_057_271_406,
    serviceCostBaseline: 344_821_665,
    source: 'MEABF GASB 67/68 Report, December 31, 2024 — Sensitivity of NPL to the Single Discount Rate Assumption.',
  },
  labf: {
    fundId: 'labf',
    baselineRate: 0.0664,
    tplAtMinus1pp: 3_492_900_478,
    tplAtBaseline: 3_127_453_272,
    tplAtPlus1pp: 2_820_580_768,
    fnpBaseline: 1_260_169_474,
    serviceCostBaseline: 42_336_661,
    source: 'LABF GASB 67/68 Report, December 31, 2024 — Sensitivity of NPL to the Single Discount Rate Assumption.',
  },
  pabf: {
    fundId: 'pabf',
    baselineRate: 0.0666,
    tplAtMinus1pp: 20_372_257_023,
    tplAtBaseline: 18_130_036_559,
    tplAtPlus1pp: 16_265_815_619,
    fnpBaseline: 4_325_456_316,
    serviceCostBaseline: 302_649_657,
    source: 'PABF GASB 67/68 Report, December 31, 2024 — Sensitivity of NPL to the Single Discount Rate Assumption.',
  },
  // Aggregate: TPL anchors and FNP / service cost are simple sums of the four
  // funds. Baseline rate is the TPL-weighted average of the four baselines:
  //   (0.0675 * 7.488B + 0.0662 * 20.205B + 0.0664 * 3.127B + 0.0666 * 18.130B)
  //     / 48.950B  =  0.06656
  aggregate: {
    fundId: 'aggregate',
    baselineRate: 0.0666,
    tplAtMinus1pp: 54_854_492_486,
    tplAtBaseline: 48_950_188_349,
    tplAtPlus1pp: 44_018_946_204,
    fnpBaseline: 12_417_135_814,
    serviceCostBaseline: 804_803_183,
    source: 'Sum of MEABF + LABF + PABF + FABF FY2024 GASB 67/68 disclosures. Aggregate baseline is the TPL-weighted average of fund baselines.',
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
