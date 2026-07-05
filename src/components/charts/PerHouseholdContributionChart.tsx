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
import type { YearObservation } from '@/types/pension';

interface PerHouseholdContributionChartProps {
  historical: YearObservation[];
  projected?: YearObservation[];
  /** Number of Chicago households used as the divisor. */
  households: number;
  color: string;
  startFy?: number;
  /** Annual NC growth assumption applied to the latest-FY base for projection years. */
  ncGrowthRate?: number;
}

type Regime = 'historical' | 'projected';

interface Row {
  fy: number;
  ncPerHousehold: number | null;
  amortPerHousehold: number | null;
  totalPerHousehold: number | null;
  total: number | null;
  regime: Regime;
}

export function PerHouseholdContributionChart({
  historical,
  projected,
  households,
  color,
  startFy = 2001,
  ncGrowthRate = 0.03,
}: PerHouseholdContributionChartProps) {
  // Base the projected normal-cost split on the latest observed year with
  // employer normal cost reported.
  const ncBaseObs = [...historical]
    .reverse()
    .find((o) => o.normalCostER !== null);
  const ncBase = ncBaseObs?.normalCostER ?? null;
  const ncBaseFy = ncBaseObs?.fy ?? 0;

  const rows: Row[] = [];
  const seen = new Set<number>();

  for (const o of historical) {
    if (o.fy < startFy) continue;
    const total = o.employerContribution;
    const nc = o.normalCostER;
    const amort = total !== null && nc !== null ? Math.max(0, total - nc) : null;
    rows.push({
      fy: o.fy,
      ncPerHousehold: nc !== null ? nc / households : null,
      amortPerHousehold: amort !== null ? amort / households : null,
      totalPerHousehold: total !== null ? total / households : null,
      total,
      regime: 'historical',
    });
    seen.add(o.fy);
  }

  if (projected) {
    for (const p of projected) {
      if (seen.has(p.fy)) continue;
      const total = p.employerContribution;
      const ncProjected =
        ncBase !== null
          ? ncBase * Math.pow(1 + ncGrowthRate, p.fy - ncBaseFy)
          : null;
      const amort =
        total !== null && ncProjected !== null ? Math.max(0, total - ncProjected) : null;
      rows.push({
        fy: p.fy,
        ncPerHousehold: ncProjected !== null ? ncProjected / households : null,
        amortPerHousehold: amort !== null ? amort / households : null,
        totalPerHousehold: total !== null ? total / households : null,
        total,
        regime: 'projected',
      });
    }
  }

  rows.sort((a, b) => a.fy - b.fy);

  const lastHistoricalFy = historical.length ? historical[historical.length - 1].fy : null;
  const maxValue = rows.reduce(
    (m, r) => (r.totalPerHousehold !== null && r.totalPerHousehold > m ? r.totalPerHousehold : m),
    0,
  );
  const yMax = Math.ceil((maxValue + 200) / 500) * 500;

  return (
    <ResponsiveContainer width="100%" height={300}>
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
          tickFormatter={(v) => `$${(v / 1000).toFixed(1)}K`}
          axisLine={false}
          tickLine={false}
          width={56}
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
          dataKey="ncPerHousehold"
          stackId="contrib"
          isAnimationActive={false}
          radius={[0, 0, 0, 0]}
        >
          {rows.map((row, i) => (
            <Cell
              key={i}
              fill="#94a3b8"
              fillOpacity={row.regime === 'projected' ? 0.45 : 1}
            />
          ))}
        </Bar>
        <Bar
          dataKey="amortPerHousehold"
          stackId="contrib"
          isAnimationActive={false}
          radius={[2, 2, 0, 0]}
        >
          {rows.map((row, i) => (
            <Cell
              key={i}
              fill={color}
              fillOpacity={row.regime === 'projected' ? 0.45 : 1}
            />
          ))}
        </Bar>
      </BarChart>
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
  const label = row.regime === 'historical' ? 'Actual' : 'AV baseline';
  const nc = row.ncPerHousehold !== null ? Math.round(row.ncPerHousehold) : null;
  const amort = row.amortPerHousehold !== null ? Math.round(row.amortPerHousehold) : null;
  const total = row.totalPerHousehold !== null ? Math.round(row.totalPerHousehold) : null;
  const amortShare =
    row.amortPerHousehold !== null && row.totalPerHousehold && row.totalPerHousehold > 0
      ? row.amortPerHousehold / row.totalPerHousehold
      : null;
  const totalDollarsCitywide = row.total !== null ? row.total / 1e9 : null;

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
        FY {row.fy} <span style={{ color: '#64748b', fontWeight: 400 }}>({label})</span>
      </div>
      <Line label="Normal cost" value={nc} swatch="#94a3b8" />
      <Line label="Amortization" value={amort} swatch="#0f172a" emphasis />
      <div
        style={{
          marginTop: 4,
          paddingTop: 4,
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ color: '#475569' }}>Total per household</span>
        <span
          style={{
            color: '#0f172a',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
          }}
        >
          {total !== null ? `$${total.toLocaleString('en-US')}` : '-'}
        </span>
      </div>
      {amortShare !== null && (
        <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
          {Math.round(amortShare * 100)}% goes to paying down legacy unfunded liability
        </div>
      )}
      {totalDollarsCitywide !== null && (
        <div style={{ color: '#64748b', fontSize: 11 }}>
          Citywide total:{' '}
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            ${totalDollarsCitywide.toFixed(2)}B
          </span>
        </div>
      )}
    </div>
  );
}

interface LineProps {
  label: string;
  value: number | null;
  swatch: string;
  emphasis?: boolean;
}

function Line({ label, value, swatch, emphasis }: LineProps) {
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
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569' }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            background: swatch,
            borderRadius: 2,
          }}
        />
        {label}
      </span>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: '#0f172a',
          fontWeight: emphasis ? 600 : 400,
        }}
      >
        {value !== null ? `$${value.toLocaleString('en-US')}` : '-'}
      </span>
    </div>
  );
}
