/**
 * Amortization layer infrastructure for the v2 scenario engine.
 *
 * Each scenario shock spawns one or more closed-period amortization layers
 * on top of the AV's published baseline trajectory. Total scheduled
 * employer contribution at year t equals AV[t].employerContribution plus
 * the sum of every active layer's payment at t.
 *
 * Layers are immutable once created: the initial payment is solved once at
 * spawn time and the schedule grows at a fixed rate through the layer's end
 * year. This mirrors how funds actually do layered amortization — each
 * year's experience gain or loss becomes its own closed layer that runs to
 * the statutory target year and is never re-solved.
 */

export type AmortLayerSource =
  | 'aal-reprice'         // user changed assumed discount rate; AAL re-priced at t_0
  | 'return-experience'   // actual returns deviated from assumed; loss/gain at year t
  | 'target-override';    // user changed target FR or target year; spawned at t_0

export type AmortMethod = 'levelPercent' | 'levelDollar';

export interface AmortLayer {
  source: AmortLayerSource;
  /** First payment year (inclusive). */
  startFy: number;
  /** Last payment year (inclusive). */
  endFy: number;
  /** Signed payment at startFy. Positive = city pays more; negative = relief. */
  initialPayment: number;
  /**
   * Per-year growth rate of payments. Equals the fund's payroll growth for
   * level-percent layers; equals 0 for level-dollar layers.
   */
  growthRate: number;
}

/**
 * Solve the initial level-percent payment that amortizes a balance `B`
 * over `N` years at interest rate `r` and growth rate `g`.
 *
 *   B = sum_{k=0..N-1} P_0 * (1+g)^k / (1+r)^(k+1)
 *     = P_0 / (r - g) * (1 - ((1+g)/(1+r))^N)
 *
 * Solving for P_0:
 *   P_0 = B * (r - g) / (1 - ((1+g)/(1+r))^N)
 *
 * If r == g, reduces to P_0 = B / N (under the limit).
 *
 * `balance` may be signed: a negative balance (gain) yields a negative
 * payment (relief).
 */
export function solveLevelPercentInitialPayment(
  balance: number,
  rate: number,
  growth: number,
  years: number,
): number {
  if (years <= 0) return balance;
  if (Math.abs(rate - growth) < 1e-9) return balance / years;
  const ratio = (1 + growth) / (1 + rate);
  return (balance * (rate - growth)) / (1 - Math.pow(ratio, years));
}

/**
 * Solve the level-dollar payment that amortizes a balance over N years at
 * rate r. Signed: gain in -> relief out.
 */
export function solveLevelDollarPayment(
  balance: number,
  rate: number,
  years: number,
): number {
  if (years <= 0) return balance;
  if (Math.abs(rate) < 1e-9) return balance / years;
  return (balance * rate) / (1 - Math.pow(1 + rate, -years));
}

/**
 * Construct a new amortization layer for a given balance, rate, growth, and
 * end year. Returns null if the layer would have zero or negative duration.
 */
export function makeLayer(args: {
  source: AmortLayerSource;
  balance: number;
  startFy: number;
  endFy: number;
  rate: number;
  amortMethod: AmortMethod;
  payrollGrowth: number;
}): AmortLayer | null {
  const { source, balance, startFy, endFy, rate, amortMethod, payrollGrowth } =
    args;
  const years = endFy - startFy + 1;
  if (years <= 0) return null;
  if (Math.abs(balance) < 1) {
    // Zero-balance layer; skip to keep the active set tidy.
    return null;
  }
  const growthRate = amortMethod === 'levelPercent' ? payrollGrowth : 0;
  const initialPayment =
    amortMethod === 'levelPercent'
      ? solveLevelPercentInitialPayment(balance, rate, growthRate, years)
      : solveLevelDollarPayment(balance, rate, years);
  return {
    source,
    startFy,
    endFy,
    initialPayment,
    growthRate,
  };
}

/**
 * Compute a layer's payment at a given year.
 *
 *   payment(layer, t) = initialPayment * (1 + growthRate)^(t - startFy)
 *
 * Returns 0 if t is outside the layer's [startFy, endFy] window.
 */
export function layerPaymentAt(layer: AmortLayer, fy: number): number {
  if (fy < layer.startFy || fy > layer.endFy) return 0;
  const k = fy - layer.startFy;
  if (k === 0) return layer.initialPayment;
  return layer.initialPayment * Math.pow(1 + layer.growthRate, k);
}

/** Sum the payments of every active layer at a given fiscal year. */
export function sumLayerPayments(layers: readonly AmortLayer[], fy: number): number {
  let total = 0;
  for (const layer of layers) {
    total += layerPaymentAt(layer, fy);
  }
  return total;
}
