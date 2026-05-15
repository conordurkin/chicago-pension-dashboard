'use client';

import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltipCard } from '@/components/content/ChartTooltipCard';
import { formatBillions } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FUND_METADATA, type FundId, type YearObservation } from '@/types/pension';

interface HistoryCashflowChartProps {
  aggregate: YearObservation[];
  perFund: Record<Exclude<FundId, 'aggregate'>, YearObservation[]>;
}

const PER_FUND_IDS: Exclude<FundId, 'aggregate'>[] = ['meabf', 'labf', 'pabf', 'fabf'];

export function HistoryCashflowChart({ aggregate, perFund }: HistoryCashflowChartProps) {
  const [mode, setMode] = useState<'aggregate' | 'perFund'>('aggregate');

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <Swatch color="#166534" label="City contribution" />
          <Swatch color="#7f1d1d" label="Actuarially required" kind="outline" />
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {mode === 'aggregate' ? (
        <CashflowInner data={aggregate} height={320} />
      ) : (
        <div className="space-y-4">
          {PER_FUND_IDS.map((id) => (
            <div key={id}>
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: FUND_METADATA[id].color }}
                />
                <span className="text-xs font-semibold text-slate-700">
                  {FUND_METADATA[id].shortName}
                </span>
              </div>
              <CashflowInner data={perFund[id]} height={160} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface InnerProps {
  data: YearObservation[];
  height: number;
  compact?: boolean;
}

function CashflowInner({ data, height, compact }: InnerProps) {
  const rows = data.map((o) => {
    const cityPaid = (o.employerContribution ?? 0) / 1e9;
    const adec = o.adec !== null ? o.adec / 1e9 : null;
    const shortfall = adec !== null ? adec - cityPaid : null;
    // rangeMax sets the bar's full vertical span so the custom shape can place
    // both the green fill and the ADC tick on a shared pixel scale.
    const rangeMax = Math.max(cityPaid, adec ?? 0);
    return {
      fy: o.fy,
      cityPaid,
      adec,
      shortfall,
      rangeMax,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={rows}
        margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
        barCategoryGap={compact ? '10%' : '6%'}
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
          tickFormatter={(v) => `$${v}B`}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={(props) => <CashflowTooltip {...props} />} />
        {!compact && <Legend wrapperStyle={{ display: 'none' }} />}
        <Bar
          dataKey="rangeMax"
          name="City contribution vs ADC"
          fill="transparent"
          shape={(props: unknown) => <CashflowBar {...(props as CashflowBarProps)} />}
          isAnimationActive={false}
        />
        <ReferenceLine y={0} stroke="#cbd5e1" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

interface CashflowBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: {
    cityPaid: number;
    adec: number | null;
    rangeMax: number;
  };
}

function CashflowBar({ x, y, width, height, payload }: CashflowBarProps) {
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    !payload
  ) {
    return null;
  }
  const { cityPaid, adec, rangeMax } = payload;
  if (rangeMax <= 0) return null;

  // The transparent Bar spans 0 → rangeMax, giving us a shared pixel scale.
  const baseline = y + height;
  const pixelsPerUnit = height / rangeMax;

  const cityPaidH = cityPaid * pixelsPerUnit;
  const cityPaidY = baseline - cityPaidH;

  let adecOutline = null;
  if (adec !== null && adec > 0) {
    const adecY = baseline - adec * pixelsPerUnit;
    // Three-sided column outline: up the left, across the top, down the right.
    // Bottom is left open since the x-axis already draws that edge.
    const path = `M ${x} ${baseline} L ${x} ${adecY} L ${x + width} ${adecY} L ${x + width} ${baseline}`;
    adecOutline = (
      <path d={path} fill="none" stroke="#7f1d1d" strokeWidth={1} strokeLinejoin="miter" />
    );
  }

  return (
    <g>
      <rect
        x={x}
        y={cityPaidY}
        width={width}
        height={cityPaidH}
        fill="#166534"
        fillOpacity={0.85}
      />
      {adecOutline}
    </g>
  );
}

interface CashflowTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: {
      fy: number;
      cityPaid: number;
      adec: number | null;
      shortfall: number | null;
    };
  }>;
}

function CashflowTooltip({ active, payload }: CashflowTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const overpaid = row.shortfall !== null && row.shortfall < 0;

  return (
    <ChartTooltipCard>
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
        FY {row.fy}
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ paddingRight: 10, color: '#166534' }}>City paid</td>
            <td
              style={{
                color: '#166534',
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
              }}
            >
              {formatBillions(row.cityPaid * 1e9, 2)}
            </td>
          </tr>
          {row.adec !== null && (
            <tr>
              <td style={{ paddingRight: 10, color: '#7f1d1d' }}>Required (ADC)</td>
              <td
                style={{
                  color: '#7f1d1d',
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'right',
                }}
              >
                {formatBillions(row.adec * 1e9, 2)}
              </td>
            </tr>
          )}
          {row.shortfall !== null && (
            <tr>
              <td
                style={{
                  paddingRight: 10,
                  color: '#475569',
                  borderTop: '1px solid #e2e8f0',
                  paddingTop: 3,
                  fontWeight: 600,
                }}
              >
                {overpaid ? 'Surplus vs ADC' : 'Shortfall vs ADC'}
              </td>
              <td
                style={{
                  color: overpaid ? '#166534' : '#b91c1c',
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'right',
                  fontWeight: 600,
                  borderTop: '1px solid #e2e8f0',
                  paddingTop: 3,
                }}
              >
                {overpaid ? '+' : '-'}
                {formatBillions(Math.abs(row.shortfall) * 1e9, 2)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </ChartTooltipCard>
  );
}

function Swatch({
  color,
  label,
  kind = 'bar',
}: {
  color: string;
  label: string;
  kind?: 'bar' | 'line' | 'dashed' | 'outline';
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {kind === 'bar' ? (
        <span
          className="inline-block h-2.5 w-4 rounded-sm"
          style={{ backgroundColor: color, opacity: 0.75 }}
        />
      ) : kind === 'outline' ? (
        <svg width="16" height="10" aria-hidden>
          <rect
            x="0.5"
            y="0.5"
            width="15"
            height="9"
            rx="2"
            ry="2"
            fill="none"
            stroke={color}
            strokeWidth="1"
          />
        </svg>
      ) : kind === 'dashed' ? (
        <svg width="16" height="4" aria-hidden>
          <line
            x1="0"
            y1="2"
            x2="16"
            y2="2"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="3 2"
          />
        </svg>
      ) : (
        <span
          className="inline-block h-0.5 w-4"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </span>
  );
}

interface ModeToggleProps {
  mode: 'aggregate' | 'perFund';
  onChange: (m: 'aggregate' | 'perFund') => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex gap-1 rounded-full border border-slate-200 p-0.5">
      {(['aggregate', 'perFund'] as const).map((m) => (
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
          {m === 'aggregate' ? 'Aggregate' : 'Per fund'}
        </button>
      ))}
    </div>
  );
}
