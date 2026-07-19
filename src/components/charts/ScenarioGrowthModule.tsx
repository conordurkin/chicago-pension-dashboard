'use client';

import { useMemo } from 'react';
import { parseAsFloat, parseAsStringLiteral, useQueryState } from 'nuqs';
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
 * "How growth changes this" per-capita module for the Scenarios page.
 *
 * Unlike the Impact-page version (which divides a *fixed* AV-baseline
 * contribution path), this divides the *live scenario* output by a growing
 * population. As the user moves the pension-policy sliders, the per-resident
 * numbers move too — and the growth slider layers a demographic denominator
 * on top.
 *
 * Two metrics:
 *  - Net liability per resident (the stock — what we owe per person). The
 *    scenario pays the UAAL down while growth spreads the shrinking balance
 *    over more people.
 *  - Contribution per resident (the flow — what each of us pays in per year).
 */

interface ProjectedPoint {
  fy: number;
  uaal: number;
  employerContribution: number;
}

interface ScenarioGrowthModuleProps {
  /** Live scenario projection years (already bounded to the target year). */
  projected: ProjectedPoint[];
  /** Base-year (latest actual FY) city population. */
  basePopulation: number;
  /** Base year the denominator is anchored to (latest actual FY). */
  baseYear: number;
  targetYear: number;
  color: string;
}

const METRICS = ['liability', 'contribution'] as const;

export function ScenarioGrowthModule({
  projected,
  basePopulation,
  baseYear,
  targetYear,
  color,
}: ScenarioGrowthModuleProps) {
  // URL-serialized (like the scenario params above) so shared links keep the
  // growth lens: ?growthMetric=contribution&growth=0.022
  const [metric, setMetric] = useQueryState(
    'growthMetric',
    parseAsStringLiteral(METRICS)
      .withDefault('liability')
      .withOptions({ clearOnDefault: true }),
  );
  const [rate, setRate] = useQueryState(
    'growth',
    parseAsFloat.withDefault(GROWTH_DEFAULT_RATE).withOptions({ clearOnDefault: true }),
  );

  const series = useMemo(
    () => projected.filter((p) => p.fy <= targetYear),
    [projected, targetYear],
  );

  const rows = useMemo(() => {
    return series.map((p) => {
      const value = metric === 'liability' ? p.uaal : p.employerContribution;
      const t = p.fy - baseYear;
      const flat = value / basePopulation;
      const grown = value / (basePopulation * Math.pow(1 + rate, t));
      return { fy: p.fy, flat, grown };
    });
  }, [series, metric, basePopulation, baseYear, rate]);

  const first = rows[0];
  const last = rows[rows.length - 1];
  const endFy = last?.fy ?? targetYear;
  const startFy = first?.fy ?? baseYear;

  const endDelta = last ? last.flat - last.grown : 0;
  const helping = endDelta >= 0; // growth lowers the per-resident figure

  // Cumulative per-resident contributions (flow only) over the horizon.
  const cumulative = useMemo(() => {
    if (metric !== 'contribution') return { flat: 0, grown: 0, delta: 0 };
    let flat = 0;
    let grown = 0;
    for (const p of series) {
      const t = p.fy - baseYear;
      flat += p.employerContribution / basePopulation;
      grown += p.employerContribution / (basePopulation * Math.pow(1 + rate, t));
    }
    return { flat, grown, delta: flat - grown };
  }, [series, metric, basePopulation, baseYear, rate]);

  // Stock decline across the projection (liability only): how far the
  // per-resident balance falls from the first to the last projected year,
  // under scenario + growth combined.
  const stockDrop =
    first && last && first.grown !== 0 ? (first.grown - last.grown) / first.grown : 0;

  const yTickFmt = (v: number) =>
    metric === 'liability' ? `$${(v / 1000).toFixed(0)}K` : `$${(v / 1000).toFixed(1)}K`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">
          Why growth matters
        </h3>
        <div className="text-sm text-slate-500">
          Population growth:{' '}
          <span className="font-semibold tabular-nums text-slate-900">
            {signedPct(rate)}/yr
          </span>
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        See how growth affects your scenario above, changing the contribution and net liabilities
        per capita under different growth scenarios for Chicago&apos;s population.
      </p>

      {/* Metric toggle */}
      <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
        <MetricTab active={metric === 'liability'} onClick={() => setMetric('liability')}>
          Net liability per resident
        </MetricTab>
        <MetricTab active={metric === 'contribution'} onClick={() => setMetric('contribution')}>
          Contribution per resident
        </MetricTab>
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
      <ResponsiveContainer width="100%" height={280}>
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
            tickFormatter={yTickFmt}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={(props) => <Tip {...props} />} />
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
            name="No growth"
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
          No population change
        </span>
      </div>

      {/* Live stat tiles */}
      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
        <Stat
          label={`${metric === 'liability' ? 'Liability' : 'Contribution'} per resident in FY${endFy}`}
          value={`$${formatNumber(last?.grown ?? 0, 0)}`}
          sub={`vs $${formatNumber(last?.flat ?? 0, 0)} with no growth`}
        />
        <Stat
          label={`${helping ? 'Lower' : 'Higher'} vs. no growth in FY${endFy}`}
          value={`$${formatNumber(Math.abs(endDelta), 0)}`}
          sub={`${formatPercent(
            last && last.flat > 0 ? Math.abs(endDelta) / last.flat : 0,
            0,
          )} ${helping ? 'smaller' : 'larger'} per-resident ${
            metric === 'liability' ? 'balance' : 'burden'
          }`}
          accent={helping ? 'good' : 'bad'}
        />
        {metric === 'liability' ? (
          <Stat
            label={`Net liability per resident, FY${startFy}–FY${endFy}`}
            value={`${stockDrop >= 0 ? '-' : '+'}${formatPercent(Math.abs(stockDrop), 0)}`}
            sub={`$${formatNumber(first?.grown ?? 0, 0)} → $${formatNumber(
              last?.grown ?? 0,
              0,
            )} per resident`}
            accent={stockDrop >= 0 ? 'good' : 'bad'}
          />
        ) : (
          <Stat
            label={`Cumulative ${helping ? 'saved' : 'added'} per resident, through FY${endFy}`}
            value={`$${formatNumber(Math.abs(cumulative.delta), 0)}`}
            sub={`of $${formatNumber(cumulative.flat, 0)} total at no growth`}
            accent={helping ? 'good' : 'bad'}
          />
        )}
      </div>
    </div>
  );
}

function MetricTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 font-medium transition ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
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
        <span style={{ color: '#94a3b8' }}>No growth</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
          ${formatNumber(row.flat, 0)}
        </span>
      </div>
    </div>
  );
}
