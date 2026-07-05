import Link from 'next/link';
import { AssetsLiabilitiesChart } from '@/components/charts/AssetsLiabilitiesChart';
import { HistoryCashflowChart } from '@/components/charts/HistoryCashflowChart';
import { HistoryContributionMixChart } from '@/components/charts/HistoryContributionMixChart';
import { HistoryFundedRatioChart } from '@/components/charts/HistoryFundedRatioChart';
import { loadAllFunds } from '@/lib/data/loadFund';
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  HISTORY_ANNOTATIONS,
} from '@/lib/data/historyAnnotations';
import { formatBillions, formatDollarsLong, formatPercent } from '@/lib/format';
import { AGGREGATE_METADATA } from '@/types/pension';

export const metadata = {
  title: 'How we got here — Chicago Pension Dashboard',
};

export default function HistoryPage() {
  const funds = loadAllFunds();
  const agg = funds.aggregate;
  const obs = agg.observations;

  const firstFy = obs[0].fy;
  const latestFy = obs[obs.length - 1].fy;
  const first = obs[0];
  const latest = obs[obs.length - 1];

  const perFundObs = {
    meabf: funds.meabf.observations,
    labf: funds.labf.observations,
    pabf: funds.pabf.observations,
    fabf: funds.fabf.observations,
  };

  const sortedAnnotations = [...HISTORY_ANNOTATIONS].sort((a, b) => a.fy - b.fy);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {/* Hero */}
      <section className="mb-10">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          How we got here
        </p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          How Chicago&apos;s pensions fell off a cliff.
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          A generation ago, Chicago&apos;s four city pension funds were in reasonable shape. Then
          the liabilities grew, and grew, and grew - and the contributions never caught up. Here&apos;s
          how it happened.
        </p>
      </section>

      {/* Section 1: Not always this bad */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          It wasn&apos;t always this bad.
        </h2>
        <p className="mb-5 text-slate-700">
          In {firstFy}, the four funds together held about{' '}
          {formatDollarsLong(first.mva, 1)} in assets against{' '}
          {formatDollarsLong(first.aalGASB25, 1)} in liabilities - a combined funded ratio of{' '}
          {formatPercent(first.fundedRatioMVA, 0)}. By {latestFy}, the assets have grown to
          just {formatDollarsLong(latest.mva, 1)} - but the liabilities have ballooned to{' '}
          {formatDollarsLong(latest.aalGASB25, 1)}, bringing the system&apos;s funded ratio
          down to {formatPercent(latest.fundedRatioMVA, 0)}.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SnapshotTile label={`FY${firstFy} funded`} value={formatPercent(first.fundedRatioMVA, 0)} />
          <SnapshotTile
            label={`FY${latestFy} funded`}
            value={formatPercent(latest.fundedRatioMVA, 0)}
          />
          <SnapshotTile
            label={`FY${firstFy} net unfunded`}
            value={formatBillions(first.uaalMVA, 1)}
          />
          <SnapshotTile
            label={`FY${latestFy} net unfunded`}
            value={formatBillions(latest.uaalMVA, 1)}
          />
        </div>
      </section>

      {/* Section 2: City contributions never kept up */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          The city usually didn&apos;t pay enough to cover liabilities...
        </h2>
        <p className="mb-5 text-slate-700">
          For most of the last quarter-century, what Chicago paid into its pension funds came
          in below what its own actuaries said was needed. The green bars below show the
          city&apos;s annual contribution; the red outlines show the actuarial requirement.
          In most years the city was actually paying its full legal contribution - but until the
          2015 and 2017 funding ramps, that legal contribution was a fixed multiple of payroll,
          with no link to liability growth. As liabilities ballooned, the formula stayed
          mechanical, and the gap between the bars and the outlines widened. Compounded over
          two decades, that gap is the system slipping further and further behind.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            What the city paid vs. what was required
          </h3>
          <p className="mb-4 text-sm text-slate-500">
            Solid green bars show what the city actually contributed. The red outline shows
            what the actuarially required contribution for the city actually was.
          </p>
          <HistoryCashflowChart aggregate={obs} perFund={perFundObs} />
          <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            The bars are still chasing the red lines. Since FY2022, the four funds&apos;
            &lsquo;pension ramps&rsquo; have fully phased in, with the city now paying close to
            the full actuarially required payment each year. It&apos;s worth pointing out that a
            structural shortfall does remain: the law targets 90% funded by 2055 (Police and
            Fire) and 2058 (Municipal and Laborers), while the actuarial line assumes 100%. Even
            at full legal compliance, that ten-point gap - plus the law&apos;s longer,
            back-loaded amortization - keeps the red lines above the bars. And notice how much
            the actuarial bill itself has grown: from{' '}
            {(() => {
              const adcByYear = new Map(obs.map((o) => [o.fy, o.adec]));
              const adc2001 = adcByYear.get(2001);
              return adc2001 ? formatBillions(adc2001, 1) : '$0.3B';
            })()}{' '}
            in FY2001 to{' '}
            {latest.adec ? formatBillions(latest.adec, 1) : '$3.2B'} today - the cost of unfunded
            liabilities compounding year after year for two decades.
          </p>
        </div>
      </section>

      {/* Section 3: Liabilities kept growing */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          ... so when markets stumbled, the liabilities pulled away.
        </h2>
        <p className="mb-5 text-slate-700">
          With contributions short, the funds were relying on investment returns alone. In good
          market years that quietly worked. In bad ones - 2001/02, 2008, 2022 - the asset base
          stalled or shrank while the liabilities kept marching upward. From {firstFy} to{' '}
          {latestFy}, Chicago&apos;s combined accrued liability grew by nearly $36 billion.
          Assets grew by less than $2 billion.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Assets vs. liabilities
          </h3>
          <p className="mb-4 text-sm text-slate-500">
            All four funds combined, {firstFy} - {latestFy}. The gap between the two is the
            system&apos;s total unfunded liability.
          </p>
          <AssetsLiabilitiesChart
            observations={obs}
            color={AGGREGATE_METADATA.color}
            liabilityColor="#7f1d1d"
            assetsColor="#166534"
          />
          <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            Particularly noteworthy is the green line&apos;s performance since 2007. Chicago&apos;s
            combined market-value assets peaked at about $14.6B that year. Even after a strong
            2025 in the markets, the system ended 2025 at roughly $14.2B - still below the
            pre-crisis high eighteen years later. Over the same period, the liability more than
            doubled, growing by over $27 billion. The funds aren&apos;t losing ground because
            assets collapsed; they&apos;re losing ground because assets have essentially treaded
            water for almost two decades while the bill kept climbing.
          </p>
        </div>
      </section>

      {/* Section 4: The funded ratio, annotated */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          The result: a generation of decline.
        </h2>
        <p className="mb-5 text-slate-700">
          The above produced a funded ratio that fell steadily from the late 1990s through the
          2010s. Along the way: economic shocks, repeated reform attempts struck down by the
          courts, and two belated funding-policy overhauls. Through it all, the trajectory was
          down.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Funded ratio (market value)
          </h3>
          <p className="mb-4 text-sm text-slate-500">
            All four funds combined, {firstFy} - {latestFy}.
          </p>
          <HistoryFundedRatioChart
            aggregate={obs}
            perFund={perFundObs}
            annotations={sortedAnnotations}
            aggregateColor={AGGREGATE_METADATA.color}
          />
        </div>

        {/* Annotations list */}
        <details className="group mt-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-900">
            <svg
              className="h-3 w-3 transition-transform group-open:rotate-90"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="4 2 8 6 4 10" />
            </svg>
            What happened, year by year ({sortedAnnotations.length} events)
          </summary>
          <ol className="mt-3 space-y-3">
            {sortedAnnotations.map((a, i) => (
              <li
                key={`${a.fy}-${i}`}
                className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex-shrink-0">
                  <div
                    className="flex h-8 w-12 flex-col items-center justify-center rounded-md text-xs font-semibold text-white"
                    style={{ backgroundColor: CATEGORY_COLOR[a.category] }}
                  >
                    {a.fy}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-slate-900">{a.title}</span>
                    <span
                      className="text-[10px] font-medium uppercase tracking-wide"
                      style={{ color: CATEGORY_COLOR[a.category] }}
                    >
                      {CATEGORY_LABEL[a.category]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{a.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        </details>
      </section>

      {/* Section 4b: Where the contributions go (today's punchline) */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          Today, most of what gets paid covers past sins, not new benefits.
        </h2>
        <p className="mb-5 text-slate-700">
          Every annual contribution splits into two pieces: the cost of benefits
          employees are earning <em>this year</em> (normal cost), and a payment
          toward the pile of past underfunding (amortization). For the last decade,
          the second piece has dwarfed the first - and under the AV baseline, it
          stays that way for the next three decades.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Where the city&apos;s pension contributions go
          </h3>
          <p className="mb-4 text-sm text-slate-500">
            Aggregate employer contribution split into normal cost vs. amortization,
            FY2001 through the statutory target years. Projected bars are partially
            transparent.
          </p>
          <HistoryContributionMixChart
            aggregate={agg}
            perFund={{
              meabf: funds.meabf,
              labf: funds.labf,
              pabf: funds.pabf,
              fabf: funds.fabf,
            }}
          />
          <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            In the early 2010s, normal cost looked like nearly half of every annual
            contribution - not because the split was balanced, but because the
            contributions themselves were so small. As the funding ramps phased in
            between FY2015 and FY2022, the city&apos;s total contribution roughly
            quintupled, and almost all of that increase went to amortizing past
            debt rather than new accruals.{' '}
            <strong className="font-semibold text-slate-900">
              Today, only about {formatPercent(latestNcShare(latest), 0)} of every
              dollar Chicago contributes covers benefits employees are earning this
              year.
            </strong>{' '}
            The other{' '}
            ~{formatPercent(1 - latestNcShare(latest), 0)} pays down decades of past
            underfunding - and under the AV baseline, that ratio holds for the next
            three decades.
          </p>
        </div>
      </section>

      {/* Section 5: Where we are now */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          Where we go from here.
        </h2>
        <p className="mb-5 text-slate-700">
          Since FY2022, Chicago has been paying the full contribution the law requires. The
          statutory schedule targets 90% funded by 2055 (Police and Fire) or 2058 (Municipal
          and Laborers), and the AV baseline projections actually reach it. But the road is
          long: getting there requires roughly {formatDollarsLong(estimateProjectedTotal(agg), 0)}{' '}
          in employer contributions between now and the target year - a commitment that will
          shape Chicago&apos;s budget for the next three decades.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/scenarios"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            The road ahead &rarr;
          </Link>
          <Link
            href="/funds/aggregate"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Explore the funds
          </Link>
        </div>
      </section>
    </div>
  );
}

function estimateProjectedTotal(agg: ReturnType<typeof loadAllFunds>['aggregate']): number {
  const proj = agg.projectionsBaseline ?? [];
  return proj.reduce((s, p) => s + (p.employerContribution ?? 0), 0);
}

function latestNcShare(
  obs: ReturnType<typeof loadAllFunds>['aggregate']['observations'][number],
): number {
  if (!obs.employerContribution || !obs.normalCostER) return 0;
  return obs.normalCostER / obs.employerContribution;
}

function SnapshotTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
