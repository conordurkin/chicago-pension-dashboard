'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { YearObservation } from '@/types/pension';

interface ProjectedPoint {
  fy: number;
  fundedRatio: number;
}

interface ProjectionChartProps {
  historical: YearObservation[];
  projected: ProjectedPoint[];
  /** Optional actuary-provided baseline from the fund's latest AV. */
  baseline?: YearObservation[];
  color: string;
  targetFundedRatio: number;
  targetYear: number;
}

interface Row {
  fy: number;
  historical: number | null;
  projected: number | null;
  baseline: number | null;
}

export function ProjectionChart({
  historical,
  projected,
  baseline,
  color,
  targetFundedRatio,
  targetYear,
}: ProjectionChartProps) {
  // Build a fy -> row map so we can merge the baseline series onto the same axis.
  const byYear = new Map<number, Row>();
  const getRow = (fy: number): Row => {
    let r = byYear.get(fy);
    if (!r) {
      r = { fy, historical: null, projected: null, baseline: null };
      byYear.set(fy, r);
    }
    return r;
  };

  for (const o of historical) {
    getRow(o.fy).historical = o.fundedRatioMVA !== null ? o.fundedRatioMVA * 100 : null;
  }

  // Bridge: the last historical point is also the first projected/baseline point
  // so the lines connect visually.
  const lastHistorical = historical[historical.length - 1];
  if (lastHistorical && lastHistorical.fundedRatioMVA !== null) {
    const r = getRow(lastHistorical.fy);
    r.projected = lastHistorical.fundedRatioMVA * 100;
    r.baseline = lastHistorical.fundedRatioMVA * 100;
  }

  for (const p of projected) {
    getRow(p.fy).projected = p.fundedRatio * 100;
  }

  if (baseline) {
    for (const b of baseline) {
      getRow(b.fy).baseline = b.fundedRatioMVA !== null ? b.fundedRatioMVA * 100 : null;
    }
  }

  const rows = Array.from(byYear.values()).sort((a, b) => a.fy - b.fy);

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={rows} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
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
          tickFormatter={(v) => `${v}%`}
          domain={[0, 100]}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            fontSize: 12,
          }}
          formatter={(value, name) => {
            const v = typeof value === 'number' ? value : null;
            if (v === null) return ['—', String(name)];
            const label =
              name === 'historical'
                ? 'Historical'
                : name === 'projected'
                  ? 'Scenario'
                  : 'Actuary baseline';
            return [`${v.toFixed(1)}%`, label];
          }}
        />
        <ReferenceLine
          y={targetFundedRatio * 100}
          stroke="#94a3b8"
          strokeDasharray="4 4"
          label={{
            value: `${(targetFundedRatio * 100).toFixed(0)}% target`,
            position: 'insideTopRight',
            fill: '#64748b',
            fontSize: 11,
          }}
        />
        <ReferenceLine
          x={targetYear}
          stroke="#94a3b8"
          strokeDasharray="2 2"
          label={{
            value: `${targetYear}`,
            position: 'insideTopLeft',
            fill: '#64748b',
            fontSize: 11,
          }}
        />
        <Line
          type="monotone"
          dataKey="historical"
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          connectNulls
          name="historical"
          isAnimationActive={false}
        />
        {baseline && baseline.length > 0 && (
          <Line
            type="monotone"
            dataKey="baseline"
            stroke="#64748b"
            strokeWidth={1.5}
            strokeDasharray="2 3"
            dot={false}
            connectNulls
            name="baseline"
            isAnimationActive={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="projected"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          connectNulls
          name="projected"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
