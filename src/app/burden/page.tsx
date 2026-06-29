import Link from 'next/link';
import { PerHouseholdContributionChart } from '@/components/charts/PerHouseholdContributionChart';
import { GrowthBurdenSection } from '@/components/charts/GrowthBurdenSection';
import { KPITile } from '@/components/content/KPITile';
import { loadAllFunds } from '@/lib/data/loadFund';
import {
  CHICAGO_DEMOGRAPHICS,
  CITY_FISCAL_HISTORY,
  CITY_CONTEXT_SOURCES,
} from '@/lib/data/cityContext';
import {
  formatBillions,
  formatDollarsLong,
  formatNumber,
  formatPercent,
} from '@/lib/format';
import { AGGREGATE_METADATA } from '@/types/pension';

export const metadata = {
  title: 'Impact — Chicago Pension Dashboard',
};

export default function BurdenPage() {
  const funds = loadAllFunds();
  const agg = funds.aggregate;
  const obs = agg.observations;
  const proj = agg.projectionsBaseline ?? [];
  const latest = obs[obs.length - 1];

  const { households, population } = CHICAGO_DEMOGRAPHICS;

  const uaal = latest.uaalMVA ?? 0;
  const erContribution = latest.employerContribution ?? 0;

  const uaalPerHousehold = uaal / households;
  const uaalPerResident = uaal / population;
  const annualPerHousehold = erContribution / households;

  const cumulativeProjected = proj.reduce(
    (s, p) => s + (p.employerContribution ?? 0),
    0,
  );
  const cumulativePerHousehold = cumulativeProjected / households;
  const projectionEndFy = proj.length > 0 ? proj[proj.length - 1].fy : null;

  const fy2024 = CITY_FISCAL_HISTORY[2];
  const pensionLevy2024 = fy2024.pensionPropertyTaxLevy;
  const debtLevy2024 = fy2024.cityPropertyTaxDebtService ?? 0;
  const libraryLevy2024 = fy2024.cityPropertyTaxLibrary ?? 0;
  const cityLevyTotal2024 =
    fy2024.cityPropertyTaxLevyTotal ?? pensionLevy2024 + debtLevy2024 + libraryLevy2024;
  const pensionShareOfCityLevy = pensionLevy2024 / cityLevyTotal2024;
  const debtShareOfCityLevy = debtLevy2024 / cityLevyTotal2024;
  const libraryShareOfCityLevy = libraryLevy2024 / cityLevyTotal2024;
  const propertyTaxPerHousehold = pensionLevy2024 / households;

  // Fixed nominal contribution path for the growth module: FY2024 actual,
  // then the AV-baseline projection. The obligation does not move; only the
  // population denominator grows.
  const growthContributions = [
    { fy: latest.fy, employerContribution: erContribution },
    ...proj
      .filter((p) => p.fy > latest.fy && p.employerContribution !== null)
      .map((p) => ({ fy: p.fy, employerContribution: p.employerContribution as number })),
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {/* Hero */}
      <section className="mb-10">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Impact
        </p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          What this costs Chicago.
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          So what? Headline numbers like {formatDollarsLong(uaal, 1)} are abstract. Here&apos;s
          what our pension liability actually costs Chicagoans.
        </p>
      </section>

      {/* Top-line tiles */}
      <section className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPITile
          label="Net unfunded per household"
          value={`$${formatNumber(uaalPerHousehold, 0)}`}
          hint="Chicago's pension shortfall, divided across the city's roughly 1.16M households."
        />
        <KPITile
          label="Net unfunded per resident"
          value={`$${formatNumber(uaalPerResident, 0)}`}
          hint="Same shortfall on a per-person basis (population ~2.71M)."
        />
        <KPITile
          label="Annual contribution per household"
          value={`$${formatNumber(annualPerHousehold, 0)}`}
          hint={`What Chicago paid into the four pension funds in FY${latest.fy}, per household.`}
        />
        <KPITile
          label="Property tax to pensions per household"
          value={`$${formatNumber(propertyTaxPerHousehold, 0)}`}
          hint="Chicago's dedicated pension property tax levy, per household."
        />
      </section>

      {/* Section 1: Per-household contribution over time */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          What it costs you, year by year.
        </h2>
        <p className="mb-5 text-slate-700">
          To deal with our unfunded liability, Chicago&apos;s annual pension contribution has
          grown nearly <span className="font-semibold">six-fold</span> since 2010. By FY
          {latest.fy} the city was paying ${formatNumber(annualPerHousehold, 0)} per
          household into the four funds to keep the system on its statutory glide path. Under
          the AV baseline, that figure stays elevated through the late 2050s.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Annual employer contribution per household
          </h3>
          <p className="mb-4 text-sm text-slate-500">
            City contribution to the four funds divided by Chicago&apos;s ~
            {formatNumber(households / 1000, 0)}K households.
          </p>
          <PerHouseholdContributionChart
            historical={obs}
            projected={proj}
            households={households}
            color={AGGREGATE_METADATA.color}
            startFy={2001}
          />
          <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            The lighter bits are the normal cost (the ongoing cost of benefits being earned by
            current workers); the darker, larger portions are amortizing the legacy unfunded
            liability.
          </p>
        </div>
      </section>

      {/* Section: Growth */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          How growth makes this easier
        </h2>
        <p className="mb-3 text-slate-700">
          Here&apos;s the key thing to understand: our liabilities are{' '}
          <em className="font-medium text-slate-900">fixed dollar amounts</em>. Based on the
          Illinois Constitution, we have no real way of reducing those liabilities in absolute
          terms - but because they&apos;re fixed liabilities, they also don&apos;t scale up as
          the city grows. Growth to our tax base or population spread the burden over a larger
          populace - making our path out that much easier to bear.
        </p>
        <p className="mb-3 text-slate-700">
          From 2010 to 2020, Chicago grew by just ~1.9% (about +0.2% per year). Over the same
          decade, Sun Belt cities like Austin and Fort Worth grew by roughly 2% per year - about
          ten times faster. And that compounds: an extra ~2 percentage points of population
          growth a year would lower the per-person burden by{' '}
          <span className="font-semibold">nearly 50% by 2055</span>.
        </p>
        <p className="mb-5 text-slate-700">
          Use the controls below to control the denominator and watch how faster growth rates
          make our challenge easier.
        </p>
        <GrowthBurdenSection
          contributions={growthContributions}
          basePopulation={population}
          baseYear={fy2024.fy}
          color={AGGREGATE_METADATA.color}
        />
        <p className="mt-4 text-sm text-slate-500">
          Growth presets are grounded in Census data. <span className="font-medium">Recent
          trend</span> is Chicago&apos;s 2010-2020 pace (+1.9% over the decade, about +0.2%/yr);{' '}
          <span className="font-medium">Sun Belt pace</span> matches the fastest-growing large
          U.S. cities (Fort Worth +2.2%, Austin metro +2.3%, 2023-24); and{' '}
          <span className="font-medium">Decline</span> reflects the city&apos;s 2000s and
          post-2020 losses.
        </p>
      </section>

      {/* Section 2: Property tax pension levy */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          {formatPercent(pensionShareOfCityLevy, 0)} of your tax bill from the City of Chicago goes to pensions.
        </h2>
        <p className="mb-5 text-slate-700">
          Chicago&apos;s property tax levy funds three things: pensions, debt service on city
          bonds, and the public library system. In FY{fy2024.fy}, of the city&apos;s{' '}
          {formatBillions(cityLevyTotal2024, 2)} property tax levy,{' '}
          <span className="font-semibold">
            {formatBillions(pensionLevy2024, 2)} ({formatPercent(pensionShareOfCityLevy, 0)})
          </span>{' '}
          went to the four pension funds. That works out to about{' '}
          <span className="font-semibold">
            ${formatNumber(propertyTaxPerHousehold, 0)} per household in Chicago
          </span>
          .
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            FY{fy2024.fy} City of Chicago property tax levy, by purpose
          </h3>
          <p className="mb-4 text-sm text-slate-500">
            Total levy of {formatBillions(cityLevyTotal2024, 2)}, allocated as set by the
            City&apos;s annual appropriation ordinance.
          </p>
          <LevyStackedBar
            segments={[
              {
                label: 'Pension funds (PABF, FABF, MEABF, LABF)',
                amount: pensionLevy2024,
                share: pensionShareOfCityLevy,
                color: '#7f1d1d',
              },
              {
                label: 'Long-term debt service',
                amount: debtLevy2024,
                share: debtShareOfCityLevy,
                color: '#475569',
              },
              {
                label: 'Chicago Public Library',
                amount: libraryLevy2024,
                share: libraryShareOfCityLevy,
                color: '#94a3b8',
              },
            ]}
          />
          <p className="mt-4 border-t border-slate-100 pt-3 text-sm italic text-slate-600">
            <span className="font-semibold not-italic text-slate-700">Worth noting:</span> the
            City of Chicago is only one of several taxing bodies on your property tax bill.
            CPS is the largest slice, and Cook County, parks, and water reclamation each take
            a piece - the city&apos;s portion is roughly one-fifth of a typical Chicago
            homeowner&apos;s total bill.
          </p>
        </div>
      </section>

      {/* Section 3: Long-run obligation */}
      <section className="mb-12">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900">
          Over the next 30 years, that adds up.
        </h2>
        <p className="mb-5 text-slate-700">
          Under the AV baseline schedule, Chicago is on the hook for roughly{' '}
          {formatDollarsLong(cumulativeProjected, 0)} in employer pension contributions
          between now and {projectionEndFy ?? '2055'}. That&apos;s more than $
          {formatNumber(Math.floor(cumulativePerHousehold / 1000) * 1000, 0)} per household.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label={`Cumulative through FY${projectionEndFy ?? 2055}`}
              value={formatDollarsLong(cumulativeProjected, 0)}
            />
            <Stat
              label="Per household"
              value={`$${formatNumber(cumulativePerHousehold, 0)}`}
            />
            <Stat
              label="Per resident"
              value={`$${formatNumber(cumulativeProjected / population, 0)}`}
            />
          </div>
        </div>
      </section>

      {/* Sources / footer */}
      <section className="mb-12 border-t border-slate-200 pt-6 text-xs text-slate-500">
        <p className="mb-1 font-semibold text-slate-700">Sources</p>
        <p>{CITY_CONTEXT_SOURCES.demographics}</p>
        <p>{CITY_CONTEXT_SOURCES.fiscalHistory}</p>
        <p>{CITY_CONTEXT_SOURCES.departments}</p>
        <p className="mt-2">
          Pension contribution and UAAL figures are from the dashboard&apos;s aggregate fund
          time series; see the{' '}
          <Link href="/methodology" className="underline hover:text-slate-700">
            methodology page
          </Link>{' '}
          for derivation.
        </p>
      </section>
    </div>
  );
}

interface LevySegment {
  label: string;
  amount: number;
  share: number;
  color: string;
}

function LevyStackedBar({ segments }: { segments: LevySegment[] }) {
  return (
    <div>
      <div className="flex h-10 w-full overflow-hidden rounded-md">
        {segments.map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-center text-xs font-semibold text-white"
            style={{
              width: `${s.share * 100}%`,
              backgroundColor: s.color,
            }}
            title={`${s.label}: ${formatBillions(s.amount, 2)} (${formatPercent(s.share, 0)})`}
          >
            {s.share >= 0.1 ? formatPercent(s.share, 0) : ''}
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        {segments.map((s) => (
          <div
            key={s.label}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="flex items-center gap-2 text-slate-700">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
            <span className="tabular-nums text-slate-900">
              {formatBillions(s.amount, 2)}{' '}
              <span className="text-slate-500">({formatPercent(s.share, 0)})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
