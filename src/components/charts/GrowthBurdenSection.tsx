'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber, formatPercent } from '@/lib/format';
import {
  GROWTH_DEFAULT_RATE,
  GROWTH_SLIDER_MAX,
  GROWTH_SLIDER_MIN,
  POPULATION_GROWTH_PRESETS,
  signedPct,
} from '@/lib/growth';

/**
 * Interactive "how growth makes this easier" module for Impact v2.
 *
 * Core idea: the pension obligation is essentially fixed in nominal dollars
 * (the AV-baseline employer-contribution path is set by statute/actuarial
 * formula, and the liabilities can't be cut under the Illinois Constitution).
 * Growth therefore helps entirely on the DENOMINATOR side — the same fixed
 * dollars spread across more residents become easier to bear.
 *
 * This holds the contribution path fixed and lets the user grow the city's
 * population at a chosen annual rate, then shows how the per-resident burden
 * bends away from a no-change baseline. Growth presets are grounded in real
 * Census population data — see the page copy / sources.
 */

interface ContribPoint {
  fy: number;
  employerContribution: number;
}

interface GrowthBurdenSectionProps {
  /** Latest-FY actual + AV-baseline projected employer contributions, fixed in $. */
  contributions: ContribPoint[];
  /** Base-year (latest FY) city population. */
  basePopulation: number;
  /** Base year the denominator is anchored to. */
  baseYear: number;
  color: string;
}

export function GrowthBurdenSection({
  contributions,
  basePopulation,
  baseYear,
  color,
}: GrowthBurdenSectionProps) {
  const [rate, setRate] = useState(GROWTH_DEFAULT_RATE);

  const series = useMemo(
    () => contributions.filter((c) => c.fy >= baseYear),
    [contributions, baseYear],
  );

  const rows = useMemo(() => {
    return series.map((c) => {
      const t = c.fy - baseYear;
      const flat = c.employerContribution / basePopulation;
      const grown = c.employerContribution / (basePopulation * Math.pow(1 + rate, t));
      return { fy: c.fy, flat, grown };
    });
  }, [series, basePopulation, baseYear, rate]);

  const last = rows[rows.length - 1];
  const endFy = last?.fy ?? baseYear;

  // Cumulative per-household over the full horizon makes "what growth buys"
  // (or costs, under decline) concrete.
  const cumulative = useMemo(() => {
    let flat = 0;
    let grown = 0;
    for (const c of series) {
      const t = c.fy - baseYear;
      flat += c.employerContribution / basePopulation;
      grown += c.employerContribution / (basePopulation * Math.pow(1 + rate, t));
    }
    return { flat, grown, delta: flat - grown };
  }, [series, basePopulation, baseYear, rate]);

  const endDelta = last ? last.flat - last.grown : 0;
  const helping = endDelta >= 0; // growth lowers the burden; decline raises it

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header + current rate */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">
          Annual employer contribution per resident
        </h3>
        <div className="text-sm text-slate-500">
          Population growth:{' '}
          <span className="font-semibold tabular-nums text-slate-900">
            {signedPct(rate)}/yr
          </span>
        </div>
      </div>

      {/* Slider + presets */}
      <div className="mb-5">
        <input
          type="range"
          min={GROWTH_SLIDER_MIN}
          max={GROWTH_SLIDER_MAX}
          step={0.001}
          value={rate}
          onChange={(e) => setRate(parseFloat(e.target.value))}
          className="w-full accent-violet-600"
          aria-label="Annual population growth rate"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>{signedPct(GROWTH_SLIDER_MIN)}</span>
          <span>{signedPct(GROWTH_SLIDER_MAX)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {POPULATION_GROWTH_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setRate(p.rate)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                Math.abs(rate - p.rate) < 0.0006
                  ? 'border-violet-300 bg-violet-50 text-violet-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title={p.blurb}
            >
              {p.label} ({signedPct(p.rate)})
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={rows} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="fy"
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickMargin={8}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(1)}K`}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={(props) => <Tip {...props} />} />
          {/* Shaded band under the with-growth line. */}
          <Area
            type="monotone"
            dataKey="grown"
            stroke="none"
            fill={color}
            fillOpacity={0.08}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="flat"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
            name="No change"
          />
          <Line
            type="monotone"
            dataKey="grown"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
            name="At chosen growth"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5" style={{ backgroundColor: color }} />
          At chosen growth rate
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-5 border-t-2 border-dashed"
            style={{ borderColor: '#94a3b8' }}
          />
          No change (today&apos;s base, held flat)
        </span>
      </div>

      {/* Live stat tiles */}
      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
        <Stat
          label={`Per resident in FY${endFy}`}
          value={`$${formatNumber(last?.grown ?? 0, 0)}`}
          sub={`vs $${formatNumber(last?.flat ?? 0, 0)} with no change`}
        />
        <Stat
          label={`${helping ? 'Lower' : 'Higher'} in FY${endFy}`}
          value={`$${formatNumber(Math.abs(endDelta), 0)}`}
          sub={`${formatPercent(
            last && last.flat > 0 ? Math.abs(endDelta) / last.flat : 0,
            0,
          )} ${helping ? 'smaller' : 'larger'} per-resident burden`}
          accent={helping ? 'good' : 'bad'}
        />
        <Stat
          label={`Cumulative ${helping ? 'saved' : 'added'} per resident, through FY${endFy}`}
          value={`$${formatNumber(Math.abs(cumulative.delta), 0)}`}
          sub={`of $${formatNumber(cumulative.flat, 0)} total at no change`}
          accent={helping ? 'good' : 'bad'}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'good' | 'bad';
}) {
  const valueColor =
    accent === 'good' ? 'text-violet-700' : accent === 'bad' ? 'text-red-700' : 'text-slate-900';
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { fy: number; flat: number; grown: number } }>;
}

function Tip({ active, payload }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid #e2e8f0',
        background: 'white',
        padding: '8px 10px',
        fontSize: 12,
        boxShadow: '0 4px 10px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>FY {row.fy}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: '#475569' }}>At chosen growth</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          ${formatNumber(row.grown, 0)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: '#94a3b8' }}>No change</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
          ${formatNumber(row.flat, 0)}
        </span>
      </div>
    </div>
  );
}
