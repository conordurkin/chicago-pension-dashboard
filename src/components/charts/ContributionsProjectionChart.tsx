'use client';

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { YearObservation } from '@/types/pension';

interface ProjectedPoint {
  fy: number;
  employerContribution: number;
}

interface ContributionsProjectionChartProps {
  historical: YearObservation[];
  projected: ProjectedPoint[];
  /** Optional actuary-provided baseline from the fund's latest AV. */
  baseline?: YearObservation[];
  color: string;
  targetYear: number;
  /** Earliest FY to render on the X axis (e.g. 2001 to give context). */
  startFy?: number;
}

type Regime = 'historical' | 'projected';

interface Row {
  fy: number;
  /** Combined value (historical or scenario); rendered as a bar. */
  contribution: number | null;
  /** AV baseline value; rendered as the overlay line. */
  baseline: number | null;
  regime: Regime;
}

export function ContributionsProjectionChart({
  historical,
  projected,
  baseline,
  color,
  targetYear,
  startFy,
}: ContributionsProjectionChartProps) {
  const byYear = new Map<number, Row>();
  const getRow = (fy: number, regime: Regime): Row => {
    let r = byYear.get(fy);
    if (!r) {
      r = { fy, contribution: null, baseline: null, regime };
      byYear.set(fy, r);
    }
    return r;
  };

  let lastHistoricalFy: number | null = null;
  let lastHistoricalValue: number | null = null;
  for (const o of historical) {
    if (startFy && o.fy < startFy) continue;
    const ec = o.employerContribution;
    if (ec !== null && ec !== undefined) {
      getRow(o.fy, 'historical').contribution = ec / 1e9;
      lastHistoricalFy = o.fy;
      lastHistoricalValue = ec / 1e9;
    }
  }

  for (const p of projected) {
    if (p.fy > targetYear) continue;
    getRow(p.fy, 'projected').contribution = p.employerContribution / 1e9;
  }

  if (baseline) {
    for (const b of baseline) {
      if (b.fy > targetYear) continue;
      const ec = b.employerContribution;
      if (ec !== null && ec !== undefined) {
        const r = getRow(b.fy, byYear.get(b.fy)?.regime ?? 'projected');
        r.baseline = ec / 1e9;
      }
    }
  }

  // Bridge the baseline line to the last historical bar so the dotted line
  // visually originates from the top of the final historical bar.
  if (lastHistoricalFy !== null && lastHistoricalValue !== null) {
    const r = byYear.get(lastHistoricalFy);
    if (r) r.baseline = lastHistoricalValue;
  }

  const rows = Array.from(byYear.values()).sort((a, b) => a.fy - b.fy);

  const maxValue = rows.reduce((m, r) => {
    const v = Math.max(r.contribution ?? 0, r.baseline ?? 0);
    return v > m ? v : m;
  }, 0);
  const yMax = Math.ceil((maxValue + 0.5) / 1) * 1;

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart
        data={rows}
        margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
        barCategoryGap="15%"
      >
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
          tickFormatter={(v) => `$${v}B`}
          axisLine={false}
          tickLine={false}
          width={48}
          domain={[0, yMax]}
        />
        <Tooltip cursor={{ fill: '#f8fafc' }} content={(props) => <Tip {...props} />} />
        {lastHistoricalFy !== null && (
          <ReferenceLine
            x={lastHistoricalFy + 0.5}
            stroke="#94a3b8"
            strokeDasharray="2 2"
            label={{
              value: 'projected →',
              position: 'insideTopRight',
              fill: '#64748b',
              fontSize: 11,
            }}
          />
        )}
        <Bar
          dataKey="contribution"
          isAnimationActive={false}
          radius={[2, 2, 0, 0]}
        >
          {rows.map((row, i) => (
            <Cell
              key={i}
              fill={color}
              fillOpacity={row.regime === 'projected' ? 0.5 : 1}
            />
          ))}
        </Bar>
        {baseline && baseline.length > 0 && (
          <Line
            type="monotone"
            dataKey="baseline"
            stroke="#475569"
            strokeWidth={1.5}
            strokeDasharray="2 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Row }>;
}

function Tip({ active, payload }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const label = row.regime === 'historical' ? 'Actual' : 'Scenario';
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
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
        FY {row.fy}{' '}
        <span style={{ color: '#64748b', fontWeight: 400 }}>({label})</span>
      </div>
      <Row label={label} value={row.contribution} />
      {row.baseline !== null && row.regime === 'projected' && (
        <Row label="AV baseline" value={row.baseline} muted />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: number | null;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginBottom: 2,
      }}
    >
      <span style={{ color: muted ? '#64748b' : '#475569' }}>{label}</span>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: muted ? '#475569' : '#0f172a',
          fontWeight: 600,
        }}
      >
        {value !== null ? `$${value.toFixed(2)}B` : '-'}
      </span>
    </div>
  );
}
