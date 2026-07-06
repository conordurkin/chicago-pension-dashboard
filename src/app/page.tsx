import Link from 'next/link';
import { HomeHeadlineChart } from '@/components/charts/HomeHeadlineChart';
import { KPITile } from '@/components/content/KPITile';
import { loadAllFunds } from '@/lib/data/loadFund';
import {
  formatBillions,
  formatDelta,
  formatDollarsLong,
  formatPercent,
} from '@/lib/format';
import { FUND_METADATA, AGGREGATE_METADATA } from '@/types/pension';

export default function HomePage() {
  const funds = loadAllFunds();
  const aggregate = funds.aggregate;
  const latest = aggregate.observations[aggregate.observations.length - 1];
  const prior = aggregate.observations[aggregate.observations.length - 2];

  const uaalDelta =
    latest.uaalMVA !== null && prior.uaalMVA !== null
      ? latest.uaalMVA - prior.uaalMVA
      : null;
  const frDelta =
    latest.fundedRatioMVA !== null && prior.fundedRatioMVA !== null
      ? latest.fundedRatioMVA - prior.fundedRatioMVA
      : null;
  const contribDelta =
    latest.employerContribution !== null && prior.employerContribution !== null
      ? latest.employerContribution - prior.employerContribution
      : null;
  const benefitsDelta =
    latest.benefitPayments !== null && prior.benefitPayments !== null
      ? latest.benefitPayments - prior.benefitPayments
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Hero */}
      <section className="mb-10">
        <h1 className="max-w-5xl text-balance text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Chicago&apos;s four city pension funds owe {formatDollarsLong(latest.uaalMVA, 1)}{' '}
          more than they have.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          What that means, how we got here, and what it&rsquo;ll take to get out.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/funds/aggregate"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Explore the Funds &rarr;
          </Link>
          <Link
            href="/history"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            How we got here
          </Link>
          <Link
            href="/scenarios"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            The road ahead
          </Link>
        </div>
      </section>

      {/* Headline KPIs */}
      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPITile
          label="Net Pension Liability"
          value={formatDollarsLong(latest.uaalMVA, 1)}
          delta={
            uaalDelta !== null
              ? `${formatDelta(uaalDelta, (v) => formatDollarsLong(v, 1))} YoY`
              : undefined
          }
          deltaTone={uaalDelta !== null && uaalDelta > 0 ? 'bad' : 'good'}
          hint="What the four funds owe current and future retirees beyond the money set aside to pay for it."
        />
        <KPITile
          label="Funded Ratio"
          value={formatPercent(latest.fundedRatioMVA, 1)}
          delta={
            frDelta !== null
              ? `${formatDelta(frDelta, (v) => `${(v * 100).toFixed(1)}pp`)} YoY`
              : undefined
          }
          deltaTone={frDelta !== null && frDelta > 0 ? 'good' : 'bad'}
          hint={
            <>
              For every dollar the funds owe in liabilities, they hold about{' '}
              {Math.round((latest.fundedRatioMVA ?? 0) * 100)} cents of assets today. Measured
              at market value; the funds&apos; own smoothed (actuarial) ratio runs slightly
              lower.{' '}
              <Link
                href="/methodology#market-vs-actuarial"
                className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              >
                What&apos;s the difference?
              </Link>
            </>
          }
        />
        <KPITile
          label="Employer Contribution"
          value={formatDollarsLong(latest.employerContribution, 1)}
          delta={
            contribDelta !== null
              ? `${formatDelta(contribDelta, (v) => formatDollarsLong(v, 1))} YoY`
              : undefined
          }
          deltaTone="neutral"
          hint={`What the City of Chicago paid into the four funds in FY${latest.fy}.`}
        />
        <KPITile
          label="Benefits Paid"
          value={formatDollarsLong(latest.benefitPayments, 1)}
          delta={
            benefitsDelta !== null
              ? `${formatDelta(benefitsDelta, (v) => formatDollarsLong(v, 1))} YoY`
              : undefined
          }
          deltaTone="neutral"
          hint={`What the four funds paid out to retirees and beneficiaries in FY${latest.fy}.`}
        />
      </section>

      {/* Combined headline chart (tabbed) */}
      <section className="mb-10">
        <HomeHeadlineChart
          observations={aggregate.observations}
          projections={aggregate.projectionsBaseline}
          color={AGGREGATE_METADATA.color}
          latestFy={latest.fy}
          latestEmployerContribution={latest.employerContribution}
          latestUaalMVA={latest.uaalMVA}
          targetFundedRatio={AGGREGATE_METADATA.targetFundedRatio}
        />
      </section>

      {/* Fund snapshot cards */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-slate-900">By fund</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['meabf', 'labf', 'pabf', 'fabf'] as const).map((id) => {
            const fund = funds[id];
            const meta = FUND_METADATA[id];
            const obs = fund.observations[fund.observations.length - 1];
            return (
              <Link
                key={id}
                href={`/funds/${id}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <h3 className="text-sm font-semibold text-slate-900">{meta.shortName}</h3>
                </div>
                <p className="line-clamp-2 min-h-8 text-xs leading-tight text-slate-500">
                  {meta.fullName.split('(')[0].trim()}
                </p>
                <div className="mt-3">
                  <div className="text-3xl font-semibold tabular-nums text-slate-900">
                    {formatPercent(obs.fundedRatioMVA, 1)}
                  </div>
                  <div className="text-xs text-slate-500">funded (market basis)</div>
                </div>
                <div className="mt-3 space-y-0.5 text-xs text-slate-600">
                  <div>
                    Net unfunded:{' '}
                    <span className="tabular-nums">{formatBillions(obs.uaalMVA, 2)}</span>
                  </div>
                  <div>
                    Assets: <span className="tabular-nums">{formatBillions(obs.mva, 2)}</span>
                  </div>
                  <div>
                    Liabilities:{' '}
                    <span className="tabular-nums">
                      {formatBillions(obs.aalGASB25, 2)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 text-xs font-medium text-slate-500 group-hover:text-slate-900">
                  View fund &rarr;
                </div>
              </Link>
            );
          })}
        </div>
      </section>

    </div>
  );
}
