import { notFound } from 'next/navigation';
import { ChartContainer } from '@/components/content/ChartContainer';
import { AssetsLiabilitiesChart } from '@/components/charts/AssetsLiabilitiesChart';
import { FundedRatioChart } from '@/components/charts/FundedRatioChart';
import { isValidFundId, loadFund } from '@/lib/data/loadFund';
import { formatBillions, formatPercent } from '@/lib/format';
import { AGGREGATE_METADATA, FUND_METADATA, type FundId } from '@/types/pension';

interface PageProps {
  params: { fund: string };
}

export default function AssetsLiabilitiesPage({ params }: PageProps) {
  if (!isValidFundId(params.fund)) notFound();
  const fundId = params.fund as FundId;
  const ts = loadFund(fundId);
  const meta = fundId === 'aggregate' ? AGGREGATE_METADATA : FUND_METADATA[fundId];

  return (
    <div className="space-y-8">
      <ChartContainer
        title="Accrued liability vs. assets"
        subtitle="Market value (solid), actuarial smoothed value (dashed), liability (shaded)"
        explainer="Accrued liability is the present value of benefits already earned by current and former employees. The gap between the liability band and the market-value line is the unfunded liability on a market basis."
        source="Public Plans Database"
      >
        <AssetsLiabilitiesChart observations={ts.observations} color={meta.color} />
      </ChartContainer>

      <ChartContainer
        title="Funded ratio"
        subtitle="Market basis (solid), actuarial basis (dashed)"
        explainer="Funded ratio is assets divided by liabilities. The solid line uses market-value assets; the dashed line uses actuarial (smoothed) assets, which is what governs the legal funding policy."
        source="Public Plans Database"
      >
        <FundedRatioChart
          observations={ts.observations}
          color={meta.color}
          targetFundedRatio={meta.targetFundedRatio}
        />
      </ChartContainer>

      {/* Historical data table */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-semibold tracking-tight text-slate-900">
          Year-by-year detail
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-200 text-left">
                <th className="py-2 pr-4 font-medium">FY</th>
                <th className="py-2 pr-4 text-right font-medium">AAL</th>
                <th className="py-2 pr-4 text-right font-medium">MVA</th>
                <th className="py-2 pr-4 text-right font-medium">AVA</th>
                <th className="py-2 pr-4 text-right font-medium">UAAL (MVA)</th>
                <th className="py-2 pr-4 text-right font-medium">Funded (MVA)</th>
                <th className="py-2 pr-4 text-right font-medium">Funded (AVA)</th>
              </tr>
            </thead>
            <tbody>
              {[...ts.observations].reverse().map((o) => (
                <tr key={o.fy} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-700">{o.fy}</td>
                  <td className="py-2 pr-4 text-right">{formatBillions(o.aalGASB25)}</td>
                  <td className="py-2 pr-4 text-right">{formatBillions(o.mva)}</td>
                  <td className="py-2 pr-4 text-right">{formatBillions(o.ava)}</td>
                  <td className="py-2 pr-4 text-right">{formatBillions(o.uaalMVA)}</td>
                  <td className="py-2 pr-4 text-right">
                    {formatPercent(o.fundedRatioMVA)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatPercent(o.fundedRatioAVA)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function generateStaticParams() {
  return [
    { fund: 'aggregate' },
    { fund: 'meabf' },
    { fund: 'labf' },
    { fund: 'pabf' },
    { fund: 'fabf' },
  ];
}
