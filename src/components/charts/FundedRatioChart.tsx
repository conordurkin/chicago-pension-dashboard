'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { YearObservation } from '@/types/pension';

interface FundedRatioChartProps {
  observations: YearObservation[];
  color: string;
  targetFundedRatio?: number;
}

export function FundedRatioChart({
  observations,
  color,
  targetFundedRatio = 0.9,
}: FundedRatioChartProps) {
  const data = observations.map((o) => ({
    fy: o.fy,
    mva: o.fundedRatioMVA !== null ? o.fundedRatioMVA * 100 : null,
  }));

  const latestPoint = [...data].reverse().find((d) => d.mva !== null);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
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
          formatter={(value) => {
            const v = typeof value === 'number' ? value : null;
            if (v === null) return ['-', 'Funded ratio'];
            return [`${v.toFixed(1)}%`, 'Funded ratio'];
          }}
          labelFormatter={(fy) => `FY ${fy}`}
        />
        <ReferenceLine
          y={targetFundedRatio * 100}
          stroke="#94a3b8"
          strokeDasharray="4 4"
          label={{
            value: `Target ${(targetFundedRatio * 100).toFixed(0)}%`,
            position: 'insideTopRight',
            fill: '#64748b',
            fontSize: 11,
          }}
        />
        <Line
          type="monotone"
          dataKey="mva"
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          connectNulls
          name="mva"
          isAnimationActive={false}
        />
        {latestPoint && latestPoint.mva !== null && (
          <ReferenceDot
            x={latestPoint.fy}
            y={latestPoint.mva}
            r={5}
            fill={color}
            stroke="white"
            strokeWidth={2}
            label={(renderProps) => {
              const vb = (renderProps as { viewBox?: { cx?: number; cy?: number; x?: number; y?: number } })
                .viewBox ?? {};
              const cx = vb.cx ?? vb.x ?? 0;
              const cy = vb.cy ?? vb.y ?? 0;
              return (
                <text
                  x={cx}
                  y={cy - 12}
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={600}
                  fill="#0f172a"
                >
                  {`FY${String(latestPoint.fy).slice(-2)}: ${latestPoint.mva!.toFixed(1)}%`}
                </text>
              );
            }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
