'use client';

import { useMemo, type ReactNode } from 'react';
import {
  parseAsFloat,
  parseAsInteger,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs';
import { ChartContainer } from '@/components/content/ChartContainer';
import { KPITile } from '@/components/content/KPITile';
import { ProjectionChart } from '@/components/charts/ProjectionChart';
import { ContributionsProjectionChart } from '@/components/charts/ContributionsProjectionChart';
import { ScenarioGrowthModule } from '@/components/charts/ScenarioGrowthModule';
import { CHICAGO_DEMOGRAPHICS } from '@/lib/data/cityContext';
import {
  defaultPerFundParams,
  runPerFundProjection,
  type PerFundProjectedYear,
  type PerFundScenarioParams,
} from '@/lib/projections/perFund';
import {
  buildPerFundParams,
  runAggregateProjection,
  type AggregateProjectedYear,
} from '@/lib/projections/aggregate';
import { DISCOUNT_SENSITIVITY, rateRange } from '@/lib/data/discountSensitivity';
import { STATUTORY_TARGET_FR } from '@/lib/data/scenarioDefaults';
import { formatBillions, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AGGREGATE_METADATA,
  ALL_FUND_IDS,
  FUND_METADATA,
  type FundId,
  type FundTimeSeries,
} from '@/types/pension';

const FUND_OPTIONS: { id: FundId; label: string }[] = [
  { id: 'aggregate', label: 'All Four' },
  { id: 'meabf', label: 'Municipal' },
  { id: 'labf', label: 'Laborers' },
  { id: 'pabf', label: 'Police' },
  { id: 'fabf', label: 'Fire' },
];

interface ScenariosClientProps {
  funds: Record<FundId, FundTimeSeries>;
}

export function ScenariosClient({ funds }: ScenariosClientProps) {
  const [fundId, setFundId] = useQueryState(
    'fund',
    parseAsStringLiteral(['aggregate', 'meabf', 'labf', 'pabf', 'fabf'] as const)
      .withDefault('aggregate')
      .withOptions({ clearOnDefault: true }),
  );
  const ts = funds[fundId];
  const meta = fundId === 'aggregate' ? AGGREGATE_METADATA : FUND_METADATA[fundId];
  const latest = ts.observations[ts.observations.length - 1];
  const sensitivity = DISCOUNT_SENSITIVITY[fundId];
  const { min: rateMin, max: rateMax } = rateRange(sensitivity);

  // `assumedReturn` and `targetYear` defaults vary by fund, so we keep them
  // nullable in the URL — when absent, fall back to the current fund's
  // baseline. Switching funds clears these so the new fund's defaults apply.
  const [assumedReturnRaw, setAssumedReturnRaw] = useQueryState('return', parseAsFloat);
  const [actualReturnDelta, setActualReturnDelta] = useQueryState(
    'delta',
    parseAsFloat.withDefault(0).withOptions({ clearOnDefault: true }),
  );
  const [targetYearRaw, setTargetYearRaw] = useQueryState('target', parseAsInteger);
  const [targetFundedRatio, setTargetFundedRatio] = useQueryState(
    'tfr',
    parseAsFloat.withDefault(STATUTORY_TARGET_FR).withOptions({ clearOnDefault: true }),
  );
  const [extraAnnualPayment, setExtraAnnualPayment] = useQueryState(
    'extra',
    parseAsFloat.withDefault(0).withOptions({ clearOnDefault: true }),
  );
  const [extraPaymentYears, setExtraPaymentYears] = useQueryState(
    'extraYears',
    parseAsInteger.withDefault(10).withOptions({ clearOnDefault: true }),
  );
  const [chartTab, setChartTab] = useQueryState(
    'tab',
    parseAsStringLiteral(['fundedRatio', 'contributions'] as const)
      .withDefault('contributions')
      .withOptions({ clearOnDefault: true }),
  );

  const assumedReturn = assumedReturnRaw ?? sensitivity.baselineRate;
  const targetYear = targetYearRaw ?? meta.targetYear;

  // The v2 engine takes a delta from each fund's baseline rate. At the
  // aggregate level we use the TPL-weighted baseline as the slider anchor;
  // the same delta then applies to all four funds.
  const assumedReturnDelta = assumedReturn - sensitivity.baselineRate;

  const isAtDefaults =
    assumedReturnRaw === null &&
    actualReturnDelta === 0 &&
    targetYearRaw === null &&
    targetFundedRatio === STATUTORY_TARGET_FR &&
    extraAnnualPayment === 0 &&
    extraPaymentYears === 10;

  const result = useMemo(() => {
    const sharedExtras = extraAnnualPayment * 1e9;
    if (fundId === 'aggregate') {
      // Aggregate extras slider is the TOTAL across all four funds, split
      // pro-rata by each fund's current UAAL. Funds with more underfunding
      // absorb a proportionally larger share, which matches how a city-wide
      // accelerated pay-down would be allocated in practice.
      const uaalByFund: Record<Exclude<FundId, 'aggregate'>, number> = {
        meabf: 0,
        labf: 0,
        pabf: 0,
        fabf: 0,
      };
      let totalUaal = 0;
      for (const id of ALL_FUND_IDS) {
        const obs = funds[id].observations[funds[id].observations.length - 1];
        const u = Math.max(0, (obs.aal ?? 0) - (obs.mva ?? 0));
        uaalByFund[id] = u;
        totalUaal += u;
      }
      const paramsPerFund = buildPerFundParams({
        assumedReturnDelta,
        actualReturnDelta,
        targetFundedRatio,
        amortMethod: 'levelPercent',
        extraAnnualPayment: 0,
        extraPaymentYears,
        targetYearOverride: targetYear,
      });
      for (const id of ALL_FUND_IDS) {
        const weight = totalUaal > 0 ? uaalByFund[id] / totalUaal : 0.25;
        paramsPerFund[id] = {
          ...paramsPerFund[id],
          extraAnnualPayment: sharedExtras * weight,
        };
      }
      const agg = runAggregateProjection(
        ALL_FUND_IDS.reduce(
          (acc, id) => {
            acc[id] = funds[id];
            return acc;
          },
          {} as Record<Exclude<FundId, 'aggregate'>, FundTimeSeries>,
        ),
        paramsPerFund,
      );
      return {
        kind: 'aggregate' as const,
        years: agg.years,
        finalFundedRatio: agg.finalFundedRatio,
        cumulativeEmployerContrib: agg.cumulativeEmployerContrib,
      };
    }
    const params: PerFundScenarioParams = {
      ...defaultPerFundParams(fundId),
      assumedReturnDelta,
      actualReturnDelta,
      targetFundedRatio,
      targetYear,
      extraAnnualPayment: sharedExtras,
      extraPaymentYears,
    };
    const r = runPerFundProjection(ts, params);
    return {
      kind: 'perFund' as const,
      years: r.years,
      finalFundedRatio: r.finalFundedRatio,
      cumulativeEmployerContrib: r.cumulativeEmployerContrib,
    };
  }, [
    fundId,
    funds,
    ts,
    assumedReturnDelta,
    actualReturnDelta,
    targetFundedRatio,
    targetYear,
    extraAnnualPayment,
    extraPaymentYears,
  ]);

  type ProjectedYear = PerFundProjectedYear | AggregateProjectedYear;
  const projectedYears: ProjectedYear[] = result.years;
  const targetYearReached =
    projectedYears.find((y) => y.fundedRatio >= targetFundedRatio - 1e-9)?.fy ??
    null;
  const firstProjectedYear = projectedYears[0];

  // Baseline contribution figures, computed by running the engine with
  // default parameters (no scenario adjustments) over the same target year.
  // This guarantees that "no slider moved" produces a $0 delta, and it
  // covers extrapolated post-publication years consistently with the
  // scenario run. We don't compare against the AV's published baseline
  // directly because (a) PABF/FABF baselines end before 2058 so they
  // under-count, and (b) the aggregate's published baseline isn't equal
  // to the sum of per-fund baselines.
  const baselineRun = useMemo(() => {
    if (fundId === 'aggregate') {
      const paramsPerFund = buildPerFundParams({
        assumedReturnDelta: 0,
        actualReturnDelta: 0,
        targetFundedRatio: STATUTORY_TARGET_FR,
        amortMethod: 'levelPercent',
        extraAnnualPayment: 0,
        targetYearOverride: targetYear,
      });
      const agg = runAggregateProjection(
        ALL_FUND_IDS.reduce(
          (acc, id) => {
            acc[id] = funds[id];
            return acc;
          },
          {} as Record<Exclude<FundId, 'aggregate'>, FundTimeSeries>,
        ),
        paramsPerFund,
      );
      return agg.years.map((y) => ({
        fy: y.fy,
        employerContribution: y.employerContribution,
      }));
    }
    const r = runPerFundProjection(ts, {
      ...defaultPerFundParams(fundId),
      targetYear,
    });
    return r.years.map((y) => ({
      fy: y.fy,
      employerContribution: y.employerContribution,
    }));
  }, [fundId, funds, ts, targetYear]);

  const startFy = latest.fy + 1;
  const tenYearEnd = startFy + 9;

  const baselineComparisons = useMemo(() => {
    let cumulative = 0;
    let tenYear = 0;
    let firstYear: number | null = null;
    for (const y of baselineRun) {
      if (y.fy < startFy) continue;
      if (y.fy <= targetYear) cumulative += y.employerContribution;
      if (y.fy <= tenYearEnd) tenYear += y.employerContribution;
      if (y.fy === startFy) firstYear = y.employerContribution;
    }
    return { cumulative, tenYear, firstYear };
  }, [baselineRun, startFy, tenYearEnd, targetYear]);

  // Scenario contribution total over the next-10-year window.
  const scenarioTenYear = useMemo(() => {
    return projectedYears
      .filter((y) => y.fy >= startFy && y.fy <= tenYearEnd)
      .reduce((s, y) => s + y.employerContribution, 0);
  }, [projectedYears, startFy, tenYearEnd]);

  // Cumulative AV-published baseline contribution — matches the dotted line
  // in the chart. May undercount for the aggregate (since PABF/FABF
  // baselines end before targetYear) but it's faithful to what's actually
  // plotted, which is what the subtitle is describing.
  const publishedBaselineCumulative = useMemo(() => {
    if (!ts.projectionsBaseline) return null;
    return ts.projectionsBaseline
      .filter((p) => p.fy >= startFy && p.fy <= targetYear)
      .reduce((s, p) => s + (p.employerContribution ?? 0), 0);
  }, [ts.projectionsBaseline, startFy, targetYear]);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* Controls */}
      <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Scenario controls
          </h3>
          <button
            type="button"
            onClick={() => {
              setAssumedReturnRaw(null);
              setActualReturnDelta(0);
              setTargetYearRaw(null);
              setTargetFundedRatio(STATUTORY_TARGET_FR);
              setExtraAnnualPayment(0);
              setExtraPaymentYears(10);
            }}
            disabled={isAtDefaults}
            className="text-xs font-medium text-slate-500 underline-offset-2 transition hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
          >
            Reset
          </button>
        </div>
        <p className="mb-5 text-xs text-slate-500">
          Adjust any input and the projection updates instantly.
        </p>

        {/* Fund selector */}
        <div className="mb-6">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Fund
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FUND_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setFundId(opt.id);
                  // Clear the fund-dependent params so the new fund's
                  // defaults apply automatically.
                  setAssumedReturnRaw(null);
                  setTargetYearRaw(null);
                }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  fundId === opt.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <SliderControl
          label="Assumed return"
          value={assumedReturn}
          min={rateMin}
          max={rateMax}
          step={0.001}
          format={(v) => formatPercent(v, 2)}
          onChange={(v) =>
            setAssumedReturnRaw(v === sensitivity.baselineRate ? null : v)
          }
          description={
            fundId === 'aggregate'
              ? `The actuarial discount rate used to compute liabilities. Range is ${formatPercent(rateMin, 1)} to ${formatPercent(rateMax, 1)} — ±1pp around the four funds’ TPL-weighted-average baseline of ~${formatPercent(sensitivity.baselineRate, 1)} (the four fund baselines range from 6.62% to 6.75%). The bounds correspond to the ±1pp sensitivities disclosed in each fund’s GASB report.`
              : `The actuarial discount rate used to compute liabilities. Range is ${formatPercent(rateMin, 1)} to ${formatPercent(rateMax, 1)} — ±1pp around ${meta.shortName}’s ${formatPercent(sensitivity.baselineRate, 1)} baseline, the bounds disclosed in the fund’s GASB sensitivity table.`
          }
        />

        <SliderControl
          label="Actual return minus assumption"
          value={actualReturnDelta}
          min={-0.03}
          max={0.03}
          step={0.001}
          format={(v) => (v === 0 ? '0.00pp' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}pp`)}
          onChange={setActualReturnDelta}
          description="How much actual returns beat (or miss) the assumption, every year."
        />

        <SliderControl
          label="Target funded ratio"
          value={targetFundedRatio}
          min={0.7}
          max={1.0}
          step={0.05}
          format={(v) => formatPercent(v, 0)}
          onChange={setTargetFundedRatio}
          description="The funded ratio the contribution schedule aims to hit by the target year."
        />

        <SliderControl
          label="Target year"
          value={targetYear}
          min={2035}
          max={2075}
          step={1}
          format={(v) => String(v)}
          onChange={(v) => setTargetYearRaw(v === meta.targetYear ? null : v)}
          description="Year by which the target funded ratio should be reached."
        />

        <SliderControl
          label="Extra annual payment"
          value={extraAnnualPayment}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `$${v.toFixed(2)}B/yr`}
          onChange={setExtraAnnualPayment}
          description="Additional employer contribution added every year on top of the computed amortization payment."
        />

        <SliderControl
          label="Years of extra payments"
          value={extraPaymentYears}
          min={0}
          max={Math.max(1, targetYear - latest.fy)}
          step={1}
          format={(v) => `${v} ${v === 1 ? 'year' : 'years'}`}
          onChange={setExtraPaymentYears}
          description="How many consecutive years (starting in the first projected year) the extra payments run for."
        />
      </aside>

      {/* Results */}
      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KPITile
            label={`Funded in ${targetYear}`}
            value={formatPercent(result.finalFundedRatio, 1)}
            hint={
              targetYearReached
                ? `Hits target in ${targetYearReached}`
                : 'Does not hit target'
            }
            deltaTone={
              result.finalFundedRatio >= targetFundedRatio ? 'good' : 'bad'
            }
            delta={
              result.finalFundedRatio >= targetFundedRatio
                ? 'On track'
                : 'Shortfall'
            }
          />
          <KPITile
            label="Cumulative contributions"
            delta={formatVsBaseline(
              result.cumulativeEmployerContrib,
              baselineComparisons.cumulative,
            )}
            deltaTone={vsBaselineTone(
              result.cumulativeEmployerContrib,
              baselineComparisons.cumulative,
            )}
            value={formatBillions(result.cumulativeEmployerContrib, 1)}
            hint={`${latest.fy + 1}\u2013${targetYear}`}
          />
          <KPITile
            label="Next 10 years"
            delta={formatVsBaseline(scenarioTenYear, baselineComparisons.tenYear)}
            deltaTone={vsBaselineTone(scenarioTenYear, baselineComparisons.tenYear)}
            value={formatBillions(scenarioTenYear, 1)}
            hint={`${latest.fy + 1}–${latest.fy + 10}`}
          />
          <KPITile
            label={`FY${firstProjectedYear?.fy ?? '—'} contribution`}
            delta={formatVsBaseline(
              firstProjectedYear?.employerContribution ?? null,
              baselineComparisons.firstYear,
            )}
            deltaTone={vsBaselineTone(
              firstProjectedYear?.employerContribution ?? null,
              baselineComparisons.firstYear,
            )}
            value={formatBillions(firstProjectedYear?.employerContribution ?? null, 2)}
            hint="First projected year"
          />
        </section>

        <ChartContainer
          title={
            chartTab === 'fundedRatio'
              ? 'Projected funded ratio'
              : 'Projected employer contributions'
          }
          subtitle={
            chartTab === 'fundedRatio'
              ? `Historical, scenario, and the fund\u2019s own 2025 AV baseline through ${targetYear}`
              : `Year-by-year employer contribution through ${targetYear}. Cumulative scenario: ${formatBillions(result.cumulativeEmployerContrib, 1)}${publishedBaselineCumulative !== null ?` \u00b7 cumulative AV baseline: ${formatBillions(publishedBaselineCumulative, 1)}` : ''}.`
          }
          explainer={
            chartTab === 'fundedRatio'
              ? `This chart overlays three series: ${latest.fy - ts.observations[0].fy + 1} years of historical market-basis funded ratio (solid), the forward projection under the current scenario assumptions (dashed, fund-colored), and the fund actuary's own baseline from the 2025 actuarial valuation (dotted grey; PABF: 2024, its latest published valuation). The actuary baseline assumes the statutory funding schedule is followed and all assumptions are met.`
              : `Historical employer contributions (solid) alongside the forward projection under your scenario (dashed) and the fund actuary's own 2025 AV baseline (dotted grey). The dashed line is what the city would pay each year under your assumptions; the cumulative figure in the subtitle is the total bill through the target year.`
          }
          source="Public Plans Database + 2025 actuarial valuations (PABF: 2024) + scenario engine"
        >
          <div className="-mt-2 mb-3 flex items-center gap-1.5">
            <ChartTabButton
              active={chartTab === 'contributions'}
              onClick={() => setChartTab('contributions')}
            >
              Contributions
            </ChartTabButton>
            <ChartTabButton
              active={chartTab === 'fundedRatio'}
              onClick={() => setChartTab('fundedRatio')}
            >
              Funded ratio
            </ChartTabButton>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <LegendSwatch color={meta.color} kind="solid" label="Historical" />
            <LegendSwatch color={meta.color} kind="dashed" label="Scenario" />
            {ts.projectionsBaseline && ts.projectionsBaseline.length > 0 && (
              <LegendSwatch color="#64748b" kind="dotted" label="Actuary baseline (2025 AV)" />
            )}
          </div>
          {chartTab === 'fundedRatio' ? (
            <ProjectionChart
              historical={ts.observations}
              projected={result.years}
              baseline={ts.projectionsBaseline}
              color={meta.color}
              targetFundedRatio={targetFundedRatio}
              targetYear={targetYear}
            />
          ) : (
            <ContributionsProjectionChart
              historical={ts.observations}
              projected={result.years}
              baseline={ts.projectionsBaseline}
              color={meta.color}
              targetYear={targetYear}
              startFy={2001}
            />
          )}
        </ChartContainer>

        <ScenarioGrowthModule
          projected={projectedYears.map((y) => ({
            fy: y.fy,
            uaal: y.uaal,
            employerContribution: y.employerContribution,
          }))}
          basePopulation={CHICAGO_DEMOGRAPHICS.population}
          baseYear={latest.fy}
          targetYear={targetYear}
          color={meta.color}
        />

        <section className="rounded-xl border border-slate-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>A caveat:</strong> this is a layered-amortization model built on top of each
          fund&rsquo;s published 2025 actuarial valuation baseline (PABF: 2024). Scenario adjustments (return
          deviations, rate changes, extra payments) are translated into closed-period
          amortization layers that re-amortize the UAAL on top of the AV&rsquo;s own projection.
          We inherit the actuary&rsquo;s assumptions about mortality, retirement, and tier mix;
          for funds whose AV ends before the target year, we extrapolate forward via geometric
          growth. See the Methodology page for details and validation against published AV rows.
        </section>
      </div>
    </div>
  );
}

/**
 * Format the delta between a scenario figure and the AV-published baseline,
 * e.g. "-$6.0B vs baseline" when the scenario is below baseline. Returns
 * undefined when there is no baseline to compare against or when the values
 * are effectively identical.
 */
function formatVsBaseline(
  scenario: number | null,
  baseline: number | null,
): string | undefined {
  if (scenario === null || baseline === null) return undefined;
  const diff = scenario - baseline;
  if (Math.abs(diff) < 5e7) return 'On baseline';
  const sign = diff < 0 ? '-' : '+';
  return `${sign}$${(Math.abs(diff) / 1e9).toFixed(2)}B vs baseline`;
}

function vsBaselineTone(
  scenario: number | null,
  baseline: number | null,
): 'good' | 'bad' | 'neutral' {
  if (scenario === null || baseline === null) return 'neutral';
  const diff = scenario - baseline;
  if (Math.abs(diff) < 5e7) return 'neutral';
  return diff < 0 ? 'good' : 'bad';
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  description?: string;
}

function ChartTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs font-medium transition',
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}

function LegendSwatch({
  color,
  kind,
  label,
}: {
  color: string;
  kind: 'solid' | 'dashed' | 'dotted';
  label: string;
}) {
  const dash = kind === 'solid' ? '0' : kind === 'dashed' ? '6 3' : '2 3';
  const width = kind === 'dotted' ? 1.5 : 2;
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="22" height="6" aria-hidden="true">
        <line
          x1="0"
          y1="3"
          x2="22"
          y2="3"
          stroke={color}
          strokeWidth={width}
          strokeDasharray={dash}
        />
      </svg>
      {label}
    </span>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  description,
}: SliderControlProps) {
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-slate-900"
      />
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
    </div>
  );
}
