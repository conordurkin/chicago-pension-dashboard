import { formatPercent } from '@/lib/format';

/**
 * Shared population-growth presets and helpers for the "growth makes this
 * easier" modules on the Impact and Scenarios pages.
 *
 * Presets are grounded in Census population data:
 *  - Decline: Chicago's 2000s / post-2020 losses ("slightly negative").
 *  - Recent trend: Chicago's 2010-2020 pace (+1.9%/decade ≈ +0.2%/yr).
 *  - Sun Belt pace: fastest-growing large US cities (Fort Worth +2.2%,
 *    Austin metro +2.3%, 2023-24).
 */

export interface GrowthPreset {
  label: string;
  rate: number;
  blurb: string;
}

export const POPULATION_GROWTH_PRESETS: GrowthPreset[] = [
  { label: 'Decline', rate: -0.005, blurb: "Chicago's 2000s / post-2020 losses" },
  { label: 'Recent trend', rate: 0.002, blurb: "Chicago's 2010-2020 pace, +0.2%/yr" },
  { label: 'Sun Belt pace', rate: 0.022, blurb: 'Fastest-growing big cities (Fort Worth, Austin)' },
];

export const GROWTH_SLIDER_MIN = -0.005;
export const GROWTH_SLIDER_MAX = 0.025;
export const GROWTH_DEFAULT_RATE = 0.002;

/** Format a rate with an explicit + / - sign, e.g. "+0.2%" or "-0.5%". */
export function signedPct(rate: number): string {
  const pct = formatPercent(Math.abs(rate), 1);
  if (rate > 0) return `+${pct}`;
  if (rate < 0) return `-${pct}`;
  return pct;
}
