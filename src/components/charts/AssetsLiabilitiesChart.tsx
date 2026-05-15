'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBillions } from '@/lib/format';
import type { YearObservation } from '@/types/pension';

interface AssetsLiabilitiesChartProps {
  observations: YearObservation[];
  color: string;
  /** Override for the liability area/stroke. Defaults to `color`. */
  liabilityColor?: string;
  /** Override for the market-assets line. Defaults to `color`. */
  assetsColor?: string;
}

interface Row {
  fy: number;
  aal: number | null;
  mva: number | null;
  ava: number | null;
  gap: [number, number] | null;
  uaal: number | null;
}

export function AssetsLiabilitiesChart({
  observations,
  color,
  liabilityColor,
  assetsColor,
}: AssetsLiabilitiesChartProps) {
  const liabStroke = liabilityColor ?? color;
  const assetStroke = assetsColor ?? color;

  const data: Row[] = observations.map((o) => {
    // Use GASB 25 AAL for cross-year consistency. The canonical `aal` field
    // uses GASB 67 TPL when available, but its depletion-date blended-rate
    // mechanism inflates MEABF/LABF liability in FY2014-16 (pre-P.A. 100-0023),
    // creating a visual hump that's an artifact of disclosure rules, not
    // funding reality. Matches the basis used for `fundedRatioMVA`.
    const aal = o.aalGASB25 !== null ? o.aalGASB25 / 1e9 : null;
    const mva = o.mva !== null ? o.mva / 1e9 : null;
    const ava = o.ava !== null ? o.ava / 1e9 : null;
    const gap: [number, number] | null =
      aal !== null && mva !== null ? [mva, aal] : null;
    const uaal = aal !== null && mva !== null ? aal - mva : null;
    return { fy: o.fy, aal, mva, ava, gap, uaal };
  });

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
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
          content={(props) => (
            <GapTooltip
              {...props}
              liabStroke={liabStroke}
              assetStroke={assetStroke}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="mva"
          stroke="none"
          fill={assetStroke}
          fillOpacity={0.12}
          connectNulls
          name="mva-fill"
          activeDot={false}
          legendType="none"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="gap"
          stroke="none"
          fill={liabStroke}
          fillOpacity={0.18}
          connectNulls
          name="gap"
          activeDot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="aal"
          stroke={liabStroke}
          strokeWidth={2.5}
          dot={false}
          connectNulls
          name="aal"
        />
        <Line
          type="monotone"
          dataKey="mva"
          stroke={assetStroke}
          strokeWidth={2.5}
          dot={false}
          connectNulls
          name="mva"
        />
        <Line
          type="monotone"
          dataKey="ava"
          stroke={assetStroke}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          connectNulls
          name="ava"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

interface GapTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Row }>;
  label?: number | string;
  liabStroke: string;
  assetStroke: string;
}

function GapTooltip({ active, payload, label, liabStroke, assetStroke }: GapTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const rows: { label: string; value: number | null; swatch?: string; emphasis?: boolean }[] = [
    { label: 'Liability', value: row.aal, swatch: liabStroke },
    { label: 'Market assets', value: row.mva, swatch: assetStroke },
  ];
  if (row.ava !== null) {
    rows.push({ label: 'Actuarial assets', value: row.ava, swatch: assetStroke });
  }
  rows.push({ label: 'Net unfunded', value: row.uaal, emphasis: true });

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
        FY {label}
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={{ paddingRight: 10, color: '#475569', verticalAlign: 'middle' }}>
                {r.swatch && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 2,
                      marginRight: 6,
                      background: r.swatch,
                      verticalAlign: 'middle',
                    }}
                  />
                )}
                {r.label}
              </td>
              <td
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'right',
                  color: r.emphasis ? '#0f172a' : '#0f172a',
                  fontWeight: r.emphasis ? 600 : 400,
                  borderTop: r.emphasis ? '1px solid #e2e8f0' : undefined,
                  paddingTop: r.emphasis ? 3 : undefined,
                }}
              >
                {r.value !== null ? formatBillions(r.value * 1e9, 2) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
