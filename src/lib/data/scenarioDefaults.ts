/**
 * Per-fund constants used by the scenario engine.
 *
 * Payroll growth rates are derived as the CAGR of each fund's projected
 * covered payroll from FY2026 through its statutory target year, taken
 * directly from the fund's FY2025 actuarial valuation projection schedule.
 * These rates are used for level-percent-of-pay amortization of scenario
 * layers (return-experience, target-override, etc.).
 *
 * The aggregate slot uses an MVA-weighted blend of the four funds, but the
 * aggregate engine projects each fund independently and sums — these are
 * here only as a fallback for code paths that need a single rate at the
 * aggregate level.
 */

import type { FundId } from '@/types/pension';

export const PAYROLL_GROWTH: Record<FundId, number> = {
  meabf: 0.0235,
  labf: 0.0199,
  pabf: 0.0272,
  fabf: 0.0257,
  aggregate: 0.0248,
};

/**
 * Each fund's statutory funding-target year, used as the default end of
 * amortization layers spawned during scenarios.
 */
export const STATUTORY_TARGET_YEAR: Record<Exclude<FundId, 'aggregate'>, number> = {
  meabf: 2058,
  labf: 2058,
  pabf: 2055,
  fabf: 2055,
};

/** Default statutory target funded ratio under P.A. 100-0023 for all four funds. */
export const STATUTORY_TARGET_FR = 0.9;
