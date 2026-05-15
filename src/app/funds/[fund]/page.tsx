import { notFound } from 'next/navigation';
import { ChartContainer } from '@/components/content/ChartContainer';
import { KPITile } from '@/components/content/KPITile';
import { FundedRatioChart } from '@/components/charts/FundedRatioChart';
import { AssetsLiabilitiesChart } from '@/components/charts/AssetsLiabilitiesChart';
import { isValidFundId, loadFund } from '@/lib/data/loadFund';
import {
  formatBillions,
  formatDelta,
  formatPercent,
} from '@/lib/format';
import { AGGREGATE_METADATA, FUND_METADATA, type FundId } from '@/types/pension';

interface PageProps {
  params: { fund: string };
}

export default function FundOverviewPage({ params }: PageProps) {
  if (!isValidFundId(params.fund)) notFound();
  const fundId = params.fund as FundId;
  const ts = loadFund(fundId);
  const meta =
    fundId === 'aggregate' ? AGGREGATE_METADATA : FUND_METADATA[fundId];
  const latest = ts.observations[ts.observations.length - 1];
  const prior = ts.observations[ts.observations.length - 2];

  const uaalDelta =
    latest.uaalMVA !== null && prior.uaalMVA !== null
      ? latest.uaalMVA - prior.uaalMVA
      : null;
  const frDelta =
    latest.fundedRatioMVA !== null && prior.fundedRatioMVA !== null
      ? latest.fundedRatioMVA - prior.fundedRatioMVA
      : null;

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPITile
          label={`Funded (FY${latest.fy})`}
          value={formatPercent(latest.fundedRatioMVA, 1)}
          delta={
            frDelta !== null
              ? `${formatDelta(frDelta, (v) => `${(v * 100).toFixed(1)}pp`)} YoY`
              : undefined
          }
          deltaTone={frDelta !== null && frDelta > 0 ? 'good' : 'bad'}
          hint="Market basis"
        />
        <KPITile
          label="Unfunded Liability"
          value={formatBillions(latest.uaalMVA, 2)}
          delta={
            uaalDelta !== null
              ? `${formatDelta(uaalDelta, (v) => formatBillions(v, 2))} YoY`
              : undefined
          }
          deltaTone={uaalDelta !== null && uaalDelta > 0 ? 'bad' : 'good'}
          hint="AAL minus market assets"
        />
        <KPITile
          label="Market Assets"
          value={formatBillions(latest.mva, 2)}
          hint={`AAL: ${formatBillions(latest.aalGASB25, 2)}`}
        />
        <KPITile
          label="Assumed Return"
          value={formatPercent(latest.discountRate, 2)}
          hint={`Target: ${(meta.targetFundedRatio * 100).toFixed(0)}% by ${meta.targetYear}`}
        />
      </section>

      <ChartContainer
        title="Assets vs liabilities"
        subtitle={`${ts.observations[0].fy}\u2013${latest.fy}`}
        explainer={`Total accrued liability (${formatBillions(latest.aalGASB25, 1)} in FY${latest.fy}) shown as the shaded band. Market value of assets (${formatBillions(latest.mva, 1)}) as the solid line. The dashed line is the actuarial value, which smooths investment gains and losses over a few years.`}
        source="Public Plans Database"
      >
        <AssetsLiabilitiesChart observations={ts.observations} color={meta.color} />
      </ChartContainer>

      <ChartContainer
        title="Funded ratio"
        subtitle="Market basis (solid), actuarial basis (dashed)"
        explainer="Market-basis funded ratio uses the actual market value of assets on the balance sheet date. The actuarial basis uses a smoothed asset value that dampens short-term market swings. The dashed horizontal line is the statutory funding target."
        source="Public Plans Database"
      >
        <FundedRatioChart
          observations={ts.observations}
          color={meta.color}
          targetFundedRatio={meta.targetFundedRatio}
        />
      </ChartContainer>
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
