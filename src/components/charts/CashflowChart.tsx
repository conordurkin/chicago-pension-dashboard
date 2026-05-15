'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBillions } from '@/lib/format';
import type { YearObservation } from '@/types/pension';

interface CashflowChartProps {
  observations: YearObservation[];
}

export function CashflowChart({ observations }: CashflowChartProps) {
  const data = observations.map((o) => ({
    fy: o.fy,
    employerContrib: o.employerContribution !== null ? o.employerContribution / 1e9 : null,
    employeeContrib: o.employeeContribution !== null ? o.employeeContribution / 1e9 : null,
    benefits: o.benefitPayments !== null ? -o.benefitPayments / 1e9 : null,
    netCashflow: o.netCashflow !== null ? o.netCashflow / 1e9 : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }} stackOffset="sign">
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
            const labels: Record<string, string> = {
              employerContrib: 'Employer contributions',
              employeeContrib: 'Employee contributions',
              benefits: 'Benefits paid',
              netCashflow: 'Net cashflow',
            };
            return [formatBillions(Math.abs(v) * 1e9), labels[String(name)] ?? String(name)];
          }}
        />
        <Legend
          verticalAlign="top"
          height={36}
          iconSize={10}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar
          dataKey="employerContrib"
          stackId="cashflow"
          fill="#1f77b4"
          name="Employer contributions"
        />
        <Bar
          dataKey="employeeContrib"
          stackId="cashflow"
          fill="#60a5fa"
          name="Employee contributions"
        />
        <Bar dataKey="benefits" stackId="cashflow" fill="#ef4444" name="Benefits paid" />
        <Line
          type="monotone"
          dataKey="netCashflow"
          stroke="#0f172a"
          strokeWidth={2}
          dot={false}
          name="Net cashflow"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
