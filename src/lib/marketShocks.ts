/**
 * One-time market shock presets for the Scenarios page.
 *
 * A shock is a single-year override of the realized return, applied on top
 * of (and independent from) the flat "actual return minus assumption"
 * slider. "Correction"/"Bear market" are illustrative round numbers.
 * "2008-style crash" is grounded in what the four funds actually reported
 * for FY2008 (return1yr in each fund's observations): MEABF -28.2%,
 * LABF -29.2%, PABF -27.8%, FABF -36.1% — averaging to about -30%. FABF's
 * own 2008 loss ran closer to -36%, but since a shock preset applies
 * uniformly to whichever fund(s) are selected, -30% represents the four
 * funds' actual diversified-portfolio experience rather than an index proxy.
 */

export interface MarketShockPreset {
  label: string;
  delta: number;
  blurb: string;
}

export const MARKET_SHOCK_PRESETS: MarketShockPreset[] = [
  { label: 'Correction', delta: -0.1, blurb: 'A garden-variety 10% market pullback' },
  { label: 'Bear market', delta: -0.2, blurb: 'A ~20% downturn, e.g. 2022' },
  { label: '2008-style crash', delta: -0.3, blurb: 'Global Financial Crisis, CY2008 (average across the four funds)' },
];

/** Magnitude slider is losses only — no positive "shock". */
export const SHOCK_MAGNITUDE_MIN = -0.4;
export const SHOCK_MAGNITUDE_MAX = -0.01;
export const SHOCK_MAGNITUDE_DEFAULT = -0.1;
