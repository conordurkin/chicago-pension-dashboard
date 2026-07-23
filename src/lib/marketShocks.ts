/**
 * One-time market shock presets for the Scenarios page.
 *
 * A shock is a single-year override of the realized return, applied on top
 * of (and independent from) the flat "actual return minus assumption"
 * slider. Magnitudes are illustrative round numbers / well-known historical
 * single-year equity drawdowns, not fund-specific realized returns.
 */

export interface MarketShockPreset {
  label: string;
  delta: number;
  blurb: string;
}

export const MARKET_SHOCK_PRESETS: MarketShockPreset[] = [
  { label: 'Correction', delta: -0.1, blurb: 'A garden-variety 10% market pullback' },
  { label: 'Bear market', delta: -0.2, blurb: 'A ~20% downturn, e.g. 2022' },
  { label: '2008-style crash', delta: -0.37, blurb: 'Global Financial Crisis, CY2008 (S&P 500 total return)' },
];

export const SHOCK_MAGNITUDE_MIN = -0.4;
export const SHOCK_MAGNITUDE_MAX = 0.1;
