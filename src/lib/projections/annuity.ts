/**
 * Amortization / annuity factor helpers for pension funding projections.
 */

/**
 * Level-dollar amortization payment.
 *
 * Given a UAAL, an interest rate, and a number of years, returns the level
 * annual payment needed to fully amortize the UAAL over that period.
 *
 * PMT = UAAL * i / (1 - (1 + i)^-n)
 *
 * @param uaal       Unfunded liability dollar amount
 * @param rate       Per-period interest rate (decimal)
 * @param years      Number of periods (years)
 */
export function levelDollarPayment(uaal: number, rate: number, years: number): number {
  if (years <= 0) return uaal; // degenerate: pay it all today
  if (rate === 0) return uaal / years;
  return (uaal * rate) / (1 - Math.pow(1 + rate, -years));
}

/**
 * Level-percent-of-pay initial amortization payment.
 *
 * Given a UAAL, an interest rate, a payroll growth rate, and a number of years,
 * returns the initial payment such that subsequent payments grow with payroll
 * and collectively amortize the UAAL over the period.
 *
 * PMT_0 = UAAL * (i - g) / (1 - ((1 + g) / (1 + i))^n)
 *
 * @param uaal       Unfunded liability dollar amount
 * @param rate       Interest rate (decimal)
 * @param growth     Payroll growth rate (decimal)
 * @param years      Number of years
 */
export function levelPercentPayment(
  uaal: number,
  rate: number,
  growth: number,
  years: number,
): number {
  if (years <= 0) return uaal;
  if (rate === growth) return uaal / years; // limit case
  const ratio = (1 + growth) / (1 + rate);
  return (uaal * (rate - growth)) / (1 - Math.pow(ratio, years));
}
