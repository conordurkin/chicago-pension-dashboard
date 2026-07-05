'use client';

import { useMemo, useState } from 'react';
import { AssetsLiabilitiesChart } from '@/components/charts/AssetsLiabilitiesChart';
import { ContributionHistoryChart } from '@/components/charts/ContributionHistoryChart';
import { FundedRatioChart } from '@/components/charts/FundedRatioChart';
import { formatDollarsLong } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { YearObservation } from '@/types/pension';

type TabId = 'contributions' | 'assets' | 'funded';

interface HomeHeadlineChartProps {
  observations: YearObservation[];
  projections?: YearObservation[];
  color: string;
  latestFy: number;
  latestEmployerContribution: number | null;
  latestUaalMVA: number | null;
  targetFundedRatio?: number;
}

const TAB_OPTIONS: { id: TabId; label: string }[] = [
  { id: 'assets', label: 'Assets vs. liabilities' },
  { id: 'funded', label: 'Funded ratio' },
  { id: 'contributions', label: 'Contributions' },
];

export function HomeHeadlineChart({
  observations,
  projections,
  color,
  latestFy,
  latestEmployerContribution,
  latestUaalMVA,
  targetFundedRatio = 0.9,
}: HomeHeadlineChartProps) {
  const [tab, setTab] = useState<TabId>('assets');

  const proj = projections ?? [];
  const firstProjectedYear = proj[0]?.fy ?? null;
  const lastProjectedYear = proj[proj.length - 1]?.fy ?? null;

  const projectedEmployerTotal = useMemo(
    () => proj.reduce<number>((s, p) => s + (p.employerContribution ?? 0), 0),
    [proj],
  );

  const config = {
    contributions: {
      title: 'What the city pays',
      subtitle: 'Annual employer contributions to the four funds (historical and projected)',
      explainer: `Dark bars are what the City of Chicago actually contributed to the four funds each year. Light bars are the contributions projected under each fund's 2025 actuarial valuation baseline. Before 2015, contributions were set by statutory multipliers untied to what the funds actually owed (which helped produce the underfunded system we're left with today). 2015 was the first step up the ramp for Police and Fire, with Municipal and Laborers following in 2017. By 2022 the city had fully 'climbed the ramp,' with all four funds receiving their full statutorily required contributions. Payments are forecast to remain elevated through 2055 to amortize our unfunded liabilities and bring the system up to the 90% funded target.`,
      source: 'Public Plans Database + 2025 actuarial valuations + FY2025 fund reports',
    },
    assets: {
      title: 'Market assets vs. total liabilities',
      subtitle: 'All four funds combined, 1997 - present',
      explainer: `The maroon line shows what the four funds owe to current and future retirees - accrued liabilities. The green line shows what the funds actually hold in market-value assets today. The shaded area between them is the gap - money Chicago has promised but hasn't set aside. As of FY${latestFy}, that gap stands at ${formatDollarsLong(latestUaalMVA, 1)}.`,
      source: 'Public Plans Database',
    },
    funded: {
      title: 'Funded ratio over time',
      subtitle: 'All four funds combined, market basis',
      explainer:
        'The funded ratio is the market value of assets divided by total accrued liabilities. A ratio of 100% means the fund has enough assets set aside to cover all future liabilities. By state law, the statutory target is 90% by 2055 (Police, Fire) or 2058 (Municipal, Laborers).',
      source: 'Public Plans Database',
    },
  }[tab];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Tab selector */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TAB_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setTab(opt.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              tab === opt.id
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <header className="mb-4">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">
          {config.title}
        </h3>
        {config.subtitle && <p className="text-sm text-slate-500">{config.subtitle}</p>}
      </header>

      {tab === 'contributions' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-4 rounded-sm"
                style={{ backgroundColor: color }}
              />
              Historical (actual)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-4 rounded-sm"
                style={{ backgroundColor: color, opacity: 0.35 }}
              />
              Projected (2025 AV baseline)
            </span>
          </div>
          <ContributionHistoryChart
            historical={observations}
            projected={projections}
            color={color}
            startFy={2001}
          />
          {projectedEmployerTotal > 0 && firstProjectedYear && lastProjectedYear && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Last year&apos;s contribution
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {latestEmployerContribution !== null
                    ? formatDollarsLong(latestEmployerContribution, 2)
                    : '—'}
                </div>
                <div className="text-xs text-slate-500">FY{latestFy}, actual</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Projected Future Total
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {formatDollarsLong(projectedEmployerTotal, 0)}
                </div>
                <div className="text-xs text-slate-500">
                  FY{firstProjectedYear} - FY{lastProjectedYear}, AV baseline
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'assets' && (
        <AssetsLiabilitiesChart
          observations={observations}
          color={color}
          liabilityColor="#7f1d1d"
          assetsColor="#166534"
        />
      )}

      {tab === 'funded' && (
        <FundedRatioChart
          observations={observations}
          color={color}
          targetFundedRatio={targetFundedRatio}
        />
      )}

      {config.explainer && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">
          {config.explainer}
        </p>
      )}
    </section>
  );
}
