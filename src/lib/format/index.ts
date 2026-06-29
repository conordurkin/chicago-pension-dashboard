/**
 * Number formatting helpers. Used across all charts and tiles.
 */

/** Format a dollar value with compact notation ($1.23B, $456M, $78.9K). */
export function formatDollarsCompact(n: number | null, decimals = 2): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(decimals)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(decimals)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Format a dollar value in billions, e.g. $5.71B. */
export function formatBillions(n: number | null, decimals = 2): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return `$${(n / 1e9).toFixed(decimals)}B`;
}

/** Format a dollar value with the unit spelled out, e.g. $36.5 Billion / $125 Million. */
export function formatDollarsLong(n: number | null, decimals = 1): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(decimals)} trillion`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(decimals)} billion`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(decimals)} million`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Format a decimal as a percentage with configurable precision. */
export function formatPercent(n: number | null, decimals = 1): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(decimals)}%`;
}

/** Format a raw number with thousands separators. */
export function formatNumber(n: number | null, decimals = 0): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format a signed delta with explicit +/- sign (e.g. +$1.2B, -5.3%). */
export function formatDelta(
  n: number | null,
  fmt: (v: number) => string = (v) => formatDollarsCompact(v),
): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmt(n)}`;
}
