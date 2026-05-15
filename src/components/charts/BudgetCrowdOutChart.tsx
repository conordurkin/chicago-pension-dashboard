'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBillions, formatPercent } from '@/lib/format';

interface BudgetCrowdOutChartProps {
  /** Anchor years with both pension contributions and total appropriations. */
  rows: Array<{
    fy: number;
    pensionContribution: number;
    totalAppropriations: number;
  }>;
}

const PENSION_COLOR = '#7f1d1d';
const OTHER_COLOR = '#cbd5e1';

export function BudgetCrowdOutChart({ rows }: BudgetCrowdOutChartProps) {
  const data = rows.map((r) => {
    const pension = r.pensionContribution / 1e9;
    const other = (r.totalAppropriations - r.pensionContribution) / 1e9;
    return {
      fy: r.fy,
      pension,
      other,
      pensionShare: r.pensionContribution / r.totalAppropriations,
      total: r.totalAppropriations / 1e9,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid stroke="#f1f5f9" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => `$${v}B`}
          tick={{ fontSize: 12, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="fy"
          tick={{ fontSize: 12, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `FY${v}`}
          width={56}
        />
        <Tooltip content={(props) => <Tip {...props} />} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
          formatter={(v) =>
            v === 'pension' ? 'Pension contributions' : 'All other appropriations'
          }
        />
        <Bar dataKey="pension" stackId="cf" fill={PENSION_COLOR} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={PENSION_COLOR} />
          ))}
        </Bar>
        <Bar dataKey="other" stackId="cf" fill={OTHER_COLOR} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={OTHER_COLOR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: {
      fy: number;
      pension: number;
      other: number;
      pensionShare: number;
      total: number;
    };
  }>;
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
      <div style={{ color: PENSION_COLOR, marginBottom: 2 }}>
        Pensions:{' '}
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {formatBillions(row.pension * 1e9, 2)} ({formatPercent(row.pensionShare, 1)})
        </span>
      </div>
      <div style={{ color: '#475569' }}>
        Other:{' '}
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {formatBillions(row.other * 1e9, 2)}
        </span>
      </div>
      <div
        style={{
          marginTop: 4,
          paddingTop: 4,
          borderTop: '1px solid #e2e8f0',
          color: '#0f172a',
        }}
      >
        Total appropriations:{' '}
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {formatBillions(row.total * 1e9, 2)}
        </span>
      </div>
    </div>
  );
}
