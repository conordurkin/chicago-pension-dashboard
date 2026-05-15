'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltipCard } from '@/components/content/ChartTooltipCard';
import { formatBillions } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { FundTimeSeries, YearObservation } from '@/types/pension';

interface HistoryContributionMixChartProps {
  /** Aggregate fund series (observations + projectionsBaseline). */
  aggregate: FundTimeSeries;
  /**
   * Per-fund series used to back-fill MEABF/LABF projected normal cost — those
   * funds' AVs publish projected payroll but not projected NC_ER, so we
   * synthesize NC_ER as (most-recent historical normalCostRateER) × payroll.
   * PABF/FABF already have NC_ER populated in projections and are passed
   * through unchanged.
   */
  perFund: Record<'meabf' | 'labf' | 'pabf' | 'fabf', FundTimeSeries>;
}

type Mode = 'dollars' | 'share';

interface Row {
  fy: number;
  normalCost: number;
  amortization: number;
  total: number;
  ncShare: number;
  amortShare: number;
  isProjected: boolean;
  ncSynthesized: boolean;
}

const HIST_START_FY = 2001;

export function HistoryContributionMixChart({
  aggregate,
  perFund,
}: HistoryContributionMixChartProps) {
  const [mode, setMode] = useState<Mode>('dollars');

  const rows = useMemo(() => buildRows(aggregate, perFund), [aggregate, perFund]);
  const projectionStartFy = useMemo(
    () => rows.find((r) => r.isProjected)?.fy,
    [rows],
  );

  const displayRows = rows.map((r) => ({
    ...r,
    nc: mode === 'dollars' ? r.normalCost / 1e9 : r.ncShare * 100,
    amort: mode === 'dollars' ? r.amortization / 1e9 : r.amortShare * 100,
  }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <Swatch color="#0f766e" label="Funding new benefits (normal cost)" />
          <Swatch color="#7f1d1d" label="Paying down past debt (amortization)" />
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={displayRows}
          margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
          barCategoryGap="10%"
        >
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="fy"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickMargin={8}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={(v) => (mode === 'dollars' ? `$${v}B` : `${v}%`)}
            axisLine={false}
            tickLine={false}
            width={44}
            domain={mode === 'share' ? [0, 100] : undefined}
          />
          <Tooltip
            content={(props: unknown) => (
              <MixTooltip
                {...(props as Omit<MixTooltipProps, 'mode'>)}
                mode={mode}
              />
            )}
          />
          <Bar
            dataKey="nc"
            stackId="contrib"
            fill="#0f766e"
            isAnimationActive={false}
            shape={(props: unknown) => (
              <FadedRect {...(props as FadedRectProps)} />
            )}
          />
          <Bar
            dataKey="amort"
            stackId="contrib"
            fill="#7f1d1d"
            isAnimationActive={false}
            shape={(props: unknown) => (
              <FadedRect {...(props as FadedRectProps)} />
            )}
          />
          {projectionStartFy !== undefined && (
            <ReferenceLine
              x={projectionStartFy - 0.5}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              label={{
                value: 'Projected →',
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#64748b',
              }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildRows(
  aggregate: FundTimeSeries,
  perFund: HistoryContributionMixChartProps['perFund'],
): Row[] {
  const out: Row[] = [];

  for (const o of aggregate.observations) {
    if (o.fy < HIST_START_FY) continue;
    if (o.employerContribution === null || o.normalCostER === null) continue;
    out.push(toRow(o, false, false));
  }

  // For projections, the aggregate's normalCostER undercounts because
  // MEABF/LABF don't publish projected NC. Synthesize them: their most recent
  // observed normalCostRateER × projected payroll.
  const synth = {
    meabf: latestNcRate(perFund.meabf),
    labf: latestNcRate(perFund.labf),
  };

  const proj = aggregate.projectionsBaseline ?? [];
  for (const p of proj) {
    if (p.employerContribution === null) continue;

    const meabfNc = synthesizeNc(
      perFund.meabf.projectionsBaseline ?? [],
      p.fy,
      synth.meabf,
    );
    const labfNc = synthesizeNc(
      perFund.labf.projectionsBaseline ?? [],
      p.fy,
      synth.labf,
    );

    // Use the aggregate's reported NC (which already includes PABF + FABF,
    // both of which publish projected NC) plus the synthesized MEABF + LABF.
    const totalNc = (p.normalCostER ?? 0) + (meabfNc ?? 0) + (labfNc ?? 0);
    if (totalNc <= 0) continue;

    out.push({
      fy: p.fy,
      normalCost: totalNc,
      amortization: Math.max(0, p.employerContribution - totalNc),
      total: p.employerContribution,
      ncShare: totalNc / p.employerContribution,
      amortShare: Math.max(0, p.employerContribution - totalNc) / p.employerContribution,
      isProjected: true,
      ncSynthesized: meabfNc !== null || labfNc !== null,
    });
  }

  return out;
}

function toRow(o: YearObservation, isProjected: boolean, ncSynthesized: boolean): Row {
  const er = o.employerContribution ?? 0;
  const nc = o.normalCostER ?? 0;
  const amort = Math.max(0, er - nc);
  return {
    fy: o.fy,
    normalCost: nc,
    amortization: amort,
    total: er,
    ncShare: er > 0 ? nc / er : 0,
    amortShare: er > 0 ? amort / er : 0,
    isProjected,
    ncSynthesized,
  };
}

function latestNcRate(fund: FundTimeSeries): number | null {
  for (let i = fund.observations.length - 1; i >= 0; i--) {
    const r = fund.observations[i].normalCostRateER;
    if (r !== null) return r;
  }
  return null;
}

function synthesizeNc(
  proj: YearObservation[],
  fy: number,
  rate: number | null,
): number | null {
  if (rate === null) return null;
  const row = proj.find((p) => p.fy === fy);
  if (!row || row.payroll === null) return null;
  return rate * row.payroll;
}

interface FadedRectProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: { isProjected: boolean };
}

function FadedRect({ x, y, width, height, fill, payload }: FadedRectProps) {
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return null;
  }
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      fillOpacity={payload?.isProjected ? 0.45 : 0.9}
    />
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

interface ModeToggleProps {
  mode: Mode;
  onChange: (m: Mode) => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex gap-1 rounded-full border border-slate-200 p-0.5">
      {(['dollars', 'share'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium transition',
            mode === m
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {m === 'dollars' ? 'Dollars' : 'Share'}
        </button>
      ))}
    </div>
  );
}

interface MixTooltipProps {
  active?: boolean;
  label?: number | string;
  payload?: ReadonlyArray<{ payload?: Row }>;
  mode: Mode;
}

function MixTooltip({ active, label, payload, mode }: MixTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <ChartTooltipCard maxWidth={280}>
      <div
        style={{
          fontWeight: 600,
          color: '#0f172a',
          marginBottom: 4,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span>FY {label}</span>
        {row.isProjected && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: '#64748b',
            }}
          >
            Projected
          </span>
        )}
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          <Line
            color="#0f766e"
            label="Funding new benefits"
            dollars={row.normalCost}
            share={row.ncShare}
            mode={mode}
          />
          <Line
            color="#7f1d1d"
            label="Paying down past debt"
            dollars={row.amortization}
            share={row.amortShare}
            mode={mode}
          />
          <tr>
            <td
              style={{
                paddingRight: 10,
                color: '#0f172a',
                fontWeight: 600,
                borderTop: '1px solid #e2e8f0',
                paddingTop: 3,
              }}
            >
              Total contribution
            </td>
            <td
              style={{
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
                color: '#0f172a',
                fontWeight: 600,
                borderTop: '1px solid #e2e8f0',
                paddingTop: 3,
              }}
            >
              {formatBillions(row.total, 2)}
            </td>
          </tr>
        </tbody>
      </table>
      {row.ncSynthesized && (
        <p style={{ marginTop: 6, color: '#94a3b8', fontSize: 10, lineHeight: 1.4 }}>
          MEABF/LABF normal cost estimated as latest-observed rate × projected
          payroll (their AVs publish payroll but not NC).
        </p>
      )}
    </ChartTooltipCard>
  );
}

function Line({
  color,
  label,
  dollars,
  share,
  mode,
}: {
  color: string;
  label: string;
  dollars: number;
  share: number;
  mode: Mode;
}) {
  return (
    <tr>
      <td style={{ paddingRight: 10, color, paddingBottom: 2 }}>{label}</td>
      <td
        style={{
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          color,
          paddingBottom: 2,
        }}
      >
        {mode === 'dollars'
          ? `${formatBillions(dollars, 2)} (${(share * 100).toFixed(0)}%)`
          : `${(share * 100).toFixed(0)}% (${formatBillions(dollars, 2)})`}
      </td>
    </tr>
  );
}
