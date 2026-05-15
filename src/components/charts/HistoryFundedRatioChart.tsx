'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltipCard } from '@/components/content/ChartTooltipCard';
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  type HistoryAnnotation,
} from '@/lib/data/historyAnnotations';
import { cn } from '@/lib/utils';
import { FUND_METADATA, type FundId, type YearObservation } from '@/types/pension';

interface HistoryFundedRatioChartProps {
  aggregate: YearObservation[];
  perFund: Record<Exclude<FundId, 'aggregate'>, YearObservation[]>;
  annotations: HistoryAnnotation[];
  aggregateColor: string;
}

const PER_FUND_IDS: Exclude<FundId, 'aggregate'>[] = ['meabf', 'labf', 'pabf', 'fabf'];

export function HistoryFundedRatioChart({
  aggregate,
  perFund,
  annotations,
  aggregateColor,
}: HistoryFundedRatioChartProps) {
  const [mode, setMode] = useState<'aggregate' | 'perFund'>('aggregate');

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {mode === 'aggregate' ? (
        <FundedRatioInner
          data={aggregate}
          color={aggregateColor}
          annotations={annotations}
          height={320}
          title="All four funds combined"
        />
      ) : (
        <div className="space-y-4">
          {PER_FUND_IDS.map((id) => (
            <FundedRatioInner
              key={id}
              data={perFund[id]}
              color={FUND_METADATA[id].color}
              annotations={annotations}
              height={180}
              title={FUND_METADATA[id].shortName}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface InnerProps {
  data: YearObservation[];
  color: string;
  annotations: HistoryAnnotation[];
  height: number;
  title: string;
  compact?: boolean;
}

function FundedRatioInner({
  data,
  color,
  annotations,
  height,
  title,
  compact,
}: InnerProps) {
  const rows = data.map((o) => ({
    fy: o.fy,
    fr: o.fundedRatioMVA !== null ? o.fundedRatioMVA * 100 : null,
  }));

  const dataByFy = new Map(rows.map((r) => [r.fy, r.fr]));

  const annotationsByFy = new Map<number, HistoryAnnotation[]>();
  for (const a of annotations) {
    const existing = annotationsByFy.get(a.fy);
    if (existing) existing.push(a);
    else annotationsByFy.set(a.fy, [a]);
  }

  return (
    <div>
      {compact && (
        <div className="mb-1 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-semibold text-slate-700">{title}</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
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
            tickFormatter={(v) => `${v}%`}
            domain={[0, (dataMax: number) => Math.ceil((dataMax + 5) / 20) * 20]}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            content={(props: unknown) => (
              <FundedRatioTooltip
                {...(props as Omit<FundedRatioTooltipProps, 'annotationsByFy'>)}
                annotationsByFy={annotationsByFy}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="fr"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          {annotations.map((a, i) => {
            const y = dataByFy.get(a.fy);
            if (y === null || y === undefined) return null;
            return (
              <ReferenceDot
                key={`${a.fy}-${i}`}
                x={a.fy}
                y={y}
                r={compact ? 3 : 4}
                fill={CATEGORY_COLOR[a.category]}
                stroke="white"
                strokeWidth={1.5}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface FundedRatioTooltipProps {
  active?: boolean;
  label?: number | string;
  payload?: ReadonlyArray<{ value?: number | string | null }>;
  annotationsByFy: Map<number, HistoryAnnotation[]>;
}

function FundedRatioTooltip({
  active,
  label,
  payload,
  annotationsByFy,
}: FundedRatioTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const fy = typeof label === 'number' ? label : Number(label);
  const fr = payload[0]?.value;
  const events = annotationsByFy.get(fy) ?? [];

  return (
    <ChartTooltipCard maxWidth={320}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: events.length > 0 ? 6 : 0,
        }}
      >
        <span style={{ fontWeight: 600, color: '#0f172a' }}>FY {fy}</span>
        <span style={{ color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
          {typeof fr === 'number' ? `${fr.toFixed(1)}% funded` : '-'}
        </span>
      </div>
      {events.map((a, i) => (
        <div
          key={`${a.fy}-${i}`}
          style={{
            borderTop: i === 0 ? '1px solid #e2e8f0' : 'none',
            paddingTop: i === 0 ? 6 : 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: CATEGORY_COLOR[a.category],
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{a.title}</span>
          </div>
          <div
            style={{
              marginTop: 2,
              marginLeft: 12,
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: CATEGORY_COLOR[a.category],
            }}
          >
            {CATEGORY_LABEL[a.category]}
          </div>
          <p
            style={{
              marginTop: 4,
              marginLeft: 12,
              color: '#475569',
              lineHeight: 1.45,
            }}
          >
            {a.summary}
          </p>
        </div>
      ))}
    </ChartTooltipCard>
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
