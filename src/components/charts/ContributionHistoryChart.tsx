'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBillions } from '@/lib/format';
import type { YearObservation } from '@/types/pension';

interface ContributionHistoryChartProps {
  historical: YearObservation[];
  projected?: YearObservation[];
  color: string;
  /** First fiscal year to display on the x-axis. Earlier years are dropped. */
  startFy?: number;
}

type Regime = 'historical' | 'projected';

interface Row {
  fy: number;
  value: number | null;
  regime: Regime;
}

export function ContributionHistoryChart({
  historical,
  projected,
  color,
  startFy = 2001,
}: ContributionHistoryChartProps) {
  const rows: Row[] = [];
  const seen = new Set<number>();

  for (const o of historical) {
    if (o.fy < startFy) continue;
    rows.push({
      fy: o.fy,
      value: o.employerContribution !== null ? o.employerContribution / 1e9 : null,
      regime: 'historical',
    });
    seen.add(o.fy);
  }

  if (projected) {
    for (const p of projected) {
      if (seen.has(p.fy)) continue;
      rows.push({
        fy: p.fy,
        value: p.employerContribution !== null ? p.employerContribution / 1e9 : null,
        regime: 'projected',
      });
    }
  }

  rows.sort((a, b) => a.fy - b.fy);

  const maxValue = rows.reduce((m, r) => (r.value !== null && r.value > m ? r.value : m), 0);
  const yMax = Math.ceil((maxValue + 0.5) * 2) / 2;

  const lastHistoricalFy = historical.length
    ? historical[historical.length - 1].fy
    : null;

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart
        data={rows}
        margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
        barCategoryGap="10%"
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
          width={50}
          domain={[0, yMax]}
        />
        <Tooltip
          cursor={{ fill: '#f8fafc' }}
          content={(props) => <RegimeTooltip {...props} />}
        />
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
          dataKey="value"
          name="value"
          isAnimationActive={false}
          radius={[2, 2, 0, 0]}
        >
          {rows.map((row, i) => (
            <Cell
              key={i}
              fill={color}
              fillOpacity={row.regime === 'projected' ? 0.35 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface RegimeTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Row }>;
}

function RegimeTooltip({ active, payload }: RegimeTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const label = row.regime === 'historical' ? 'Actual' : 'AV baseline';
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
        FY {row.fy}
      </div>
      <div style={{ color: '#475569' }}>
        {label}:{' '}
        <span
          style={{
            color: '#0f172a',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
          }}
        >
          {row.value !== null ? formatBillions(row.value * 1e9, 2) : '-'}
        </span>
      </div>
    </div>
  );
}
