/**
 * Builds an aggregate (sum of all four funds) time series.
 *
 * Sums $-denominated fields across funds. For ratios and percentages, recomputes
 * from summed numerators/denominators rather than averaging.
 *
 * Output: data/processed/funds/aggregate.json + public/data/funds/aggregate.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FundId, FundTimeSeries, YearObservation } from '../src/types/pension';
import { AGGREGATE_METADATA, ALL_FUND_IDS } from '../src/types/pension';
import { buildExtendedBaseline } from '../src/lib/projections/baselineExtension';
import { STATUTORY_TARGET_YEAR } from '../src/lib/data/scenarioDefaults';

function sumOrNull(values: (number | null)[]): number | null {
  // If ALL are null, return null. Otherwise sum, treating nulls as 0.
  if (values.every((v) => v === null)) return null;
  return values.reduce<number>((s, v) => s + (v ?? 0), 0);
}

/** Weighted average of ratios, weighted by the provided weights. Returns null if all weights null/zero. */
function weightedAvg(
  ratios: (number | null)[],
  weights: (number | null)[],
): number | null {
  let num = 0;
  let den = 0;
  for (let i = 0; i < ratios.length; i++) {
    const r = ratios[i];
    const w = weights[i];
    if (r !== null && w !== null && w > 0) {
      num += r * w;
      den += w;
    }
  }
  return den > 0 ? num / den : null;
}

function aggregateYear(yearObservations: YearObservation[]): YearObservation {
  const fy = yearObservations[0].fy;

  const aalGASB25 = sumOrNull(yearObservations.map((o) => o.aalGASB25));
  const tplGASB67 = sumOrNull(yearObservations.map((o) => o.tplGASB67));
  const aal = sumOrNull(yearObservations.map((o) => o.aal));

  const mva = sumOrNull(yearObservations.map((o) => o.mva));
  const ava = sumOrNull(yearObservations.map((o) => o.ava));
  const mvaBeginning = sumOrNull(yearObservations.map((o) => o.mvaBeginning));

  const uaalAVA = sumOrNull(yearObservations.map((o) => o.uaalAVA));
  const uaalMVA =
    aal !== null && mva !== null ? aal - mva : null;
  const npl = sumOrNull(yearObservations.map((o) => o.npl));

  const fundedRatioAVA =
    ava !== null && aalGASB25 !== null && aalGASB25 > 0 ? ava / aalGASB25 : null;
  const fundedRatioMVA =
    mva !== null && aalGASB25 !== null && aalGASB25 > 0 ? mva / aalGASB25 : null;
  const fundedRatioGASB67 =
    mva !== null && tplGASB67 !== null && tplGASB67 > 0 ? mva / tplGASB67 : null;

  // Weighted average assumptions, weighted by AAL
  const discountRate = weightedAvg(
    yearObservations.map((o) => o.discountRate),
    yearObservations.map((o) => o.aalGASB25),
  );
  const inflationAssumption = weightedAvg(
    yearObservations.map((o) => o.inflationAssumption),
    yearObservations.map((o) => o.aalGASB25),
  );

  // Contributions, expenses
  const employerContribution = sumOrNull(yearObservations.map((o) => o.employerContribution));
  const employerContribRegular = sumOrNull(
    yearObservations.map((o) => o.employerContribRegular),
  );
  const employerContribState = sumOrNull(yearObservations.map((o) => o.employerContribState));
  const employeeContribution = sumOrNull(yearObservations.map((o) => o.employeeContribution));
  const totalContributions = sumOrNull(yearObservations.map((o) => o.totalContributions));

  const adec = sumOrNull(yearObservations.map((o) => o.adec));
  const statutoryRequired = sumOrNull(yearObservations.map((o) => o.statutoryRequired));
  const percentRequiredPaid =
    adec !== null && employerContribution !== null && adec > 0
      ? employerContribution / adec
      : null;
  const contribShortfall =
    adec !== null && employerContribution !== null ? adec - employerContribution : null;

  const benefitPayments = sumOrNull(yearObservations.map((o) => o.benefitPayments));
  const retBenefits = sumOrNull(yearObservations.map((o) => o.retBenefits));
  const colaBenefits = sumOrNull(yearObservations.map((o) => o.colaBenefits));
  const refunds = sumOrNull(yearObservations.map((o) => o.refunds));
  const adminExpenses = sumOrNull(yearObservations.map((o) => o.adminExpenses));
  const netCashflow =
    totalContributions !== null
      ? totalContributions - (benefitPayments ?? 0) - (adminExpenses ?? 0)
      : null;

  const totalAdditions = sumOrNull(yearObservations.map((o) => o.totalAdditions));
  const netInvestmentIncome = sumOrNull(
    yearObservations.map((o) => o.netInvestmentIncome),
  );
  const interestDividends = sumOrNull(yearObservations.map((o) => o.interestDividends));
  const fairValueChange = sumOrNull(yearObservations.map((o) => o.fairValueChange));

  // Investment returns: weighted by beginning MVA (approximates money-weighted aggregate return)
  const return1yr = weightedAvg(
    yearObservations.map((o) => o.return1yr),
    yearObservations.map((o) => o.mvaBeginning),
  );
  const return5yr = weightedAvg(
    yearObservations.map((o) => o.return5yr),
    yearObservations.map((o) => o.mvaBeginning),
  );
  const return10yr = weightedAvg(
    yearObservations.map((o) => o.return10yr),
    yearObservations.map((o) => o.mvaBeginning),
  );

  // Cost
  const normalCostTotal = sumOrNull(yearObservations.map((o) => o.normalCostTotal));
  const normalCostER = sumOrNull(yearObservations.map((o) => o.normalCostER));
  const normalCostEE = sumOrNull(yearObservations.map((o) => o.normalCostEE));
  const payroll = sumOrNull(yearObservations.map((o) => o.payroll));
  const projectedPayroll = sumOrNull(yearObservations.map((o) => o.projectedPayroll));
  const normalCostRateTotal =
    normalCostTotal !== null && payroll !== null && payroll > 0
      ? normalCostTotal / payroll
      : null;
  const normalCostRateER =
    normalCostER !== null && payroll !== null && payroll > 0
      ? normalCostER / payroll
      : null;
  const uaalRate = weightedAvg(
    yearObservations.map((o) => o.uaalRate),
    yearObservations.map((o) => o.payroll),
  );

  // Membership
  const actives = sumOrNull(yearObservations.map((o) => o.actives));
  const beneficiaries = sumOrNull(yearObservations.map((o) => o.beneficiaries));
  const activesPerBeneficiary =
    actives !== null && beneficiaries !== null && beneficiaries > 0
      ? actives / beneficiaries
      : null;
  const avgActiveSalary = weightedAvg(
    yearObservations.map((o) => o.avgActiveSalary),
    yearObservations.map((o) => o.actives),
  );
  const avgBenefit = weightedAvg(
    yearObservations.map((o) => o.avgBenefit),
    yearObservations.map((o) => o.beneficiaries),
  );

  // Allocation: weighted by MVA
  const allocation = {
    equity: weightedAvg(
      yearObservations.map((o) => o.allocation.equity),
      yearObservations.map((o) => o.mva),
    ),
    fixedIncome: weightedAvg(
      yearObservations.map((o) => o.allocation.fixedIncome),
      yearObservations.map((o) => o.mva),
    ),
    realEstate: weightedAvg(
      yearObservations.map((o) => o.allocation.realEstate),
      yearObservations.map((o) => o.mva),
    ),
    privateEquity: weightedAvg(
      yearObservations.map((o) => o.allocation.privateEquity),
      yearObservations.map((o) => o.mva),
    ),
    hedgeFunds: weightedAvg(
      yearObservations.map((o) => o.allocation.hedgeFunds),
      yearObservations.map((o) => o.mva),
    ),
    cash: weightedAvg(
      yearObservations.map((o) => o.allocation.cash),
      yearObservations.map((o) => o.mva),
    ),
    other: weightedAvg(
      yearObservations.map((o) => o.allocation.other),
      yearObservations.map((o) => o.mva),
    ),
    altMisc: weightedAvg(
      yearObservations.map((o) => o.allocation.altMisc),
      yearObservations.map((o) => o.mva),
    ),
  };

  const burnRate =
    benefitPayments !== null && mva !== null && mva > 0 ? benefitPayments / mva : null;

  return {
    fy,
    aalGASB25,
    tplGASB67,
    aal,
    mva,
    ava,
    mvaBeginning,
    uaalAVA,
    uaalMVA,
    npl,
    fundedRatioAVA,
    fundedRatioMVA,
    fundedRatioGASB67,
    discountRate,
    inflationAssumption,
    uaalAmortPeriod: null, // not meaningful to aggregate
    employerContribution,
    employerContribRegular,
    employerContribState,
    employeeContribution,
    totalContributions,
    adec,
    statutoryRequired,
    percentRequiredPaid,
    contribShortfall,
    benefitPayments,
    retBenefits,
    colaBenefits,
    refunds,
    adminExpenses,
    netCashflow,
    totalAdditions,
    netInvestmentIncome,
    interestDividends,
    fairValueChange,
    return1yr,
    return5yr,
    return10yr,
    normalCostTotal,
    normalCostER,
    normalCostEE,
    normalCostRateTotal,
    normalCostRateER,
    uaalRate,
    payroll,
    projectedPayroll,
    actives,
    avgActiveSalary,
    avgActiveAge: null, // too complex to meaningfully aggregate
    avgActiveTenure: null,
    beneficiaries,
    avgBenefit,
    beneficiariesServiceRetirees: sumOrNull(
      yearObservations.map((o) => o.beneficiariesServiceRetirees),
    ),
    beneficiariesDisability: sumOrNull(
      yearObservations.map((o) => o.beneficiariesDisability),
    ),
    beneficiariesSurvivors: sumOrNull(yearObservations.map((o) => o.beneficiariesSurvivors)),
    inactiveVested: sumOrNull(yearObservations.map((o) => o.inactiveVested)),
    totalMembership: sumOrNull(yearObservations.map((o) => o.totalMembership)),
    activesPerBeneficiary,
    allocation,
    burnRate,
  };
}

function main() {
  const projectRoot = join(__dirname, '..');
  const processedDir = join(projectRoot, 'data', 'processed', 'funds');
  const publicDir = join(projectRoot, 'public', 'data', 'funds');

  mkdirSync(processedDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });

  console.log('Building aggregate...');

  // Load the four fund time series
  const fundSeries: FundTimeSeries[] = ALL_FUND_IDS.map((id) => {
    const path = join(processedDir, `${id}.json`);
    return JSON.parse(readFileSync(path, 'utf-8')) as FundTimeSeries;
  });

  // Build a year -> observations map
  const years = new Set<number>();
  for (const fs of fundSeries) {
    for (const obs of fs.observations) {
      years.add(obs.fy);
    }
  }

  const sortedYears = Array.from(years).sort((a, b) => a - b);
  const aggregateObservations: YearObservation[] = [];

  for (const fy of sortedYears) {
    const yearObs = fundSeries
      .map((fs) => fs.observations.find((o) => o.fy === fy))
      .filter((o): o is YearObservation => !!o);
    aggregateObservations.push(aggregateYear(yearObs));
  }

  // Aggregate projection baselines. Only include years where ALL FOUR funds
  // have a projected row, so the sum is an apples-to-apples cross-fund total.
  //
  // PABF's published projection stops at its 2055 statutory target while the
  // municipal/laborers funds ramp through 2058, so a naive intersection would
  // silently drop the 2056-2058 tail (~$2B/yr of MEABF+LABF contributions)
  // from the aggregate. To keep the aggregate honest through the last
  // statutory target year, any fund whose schedule ends earlier is extended
  // with `buildExtendedBaseline` — the same validated extrapolation the
  // scenario engine uses (for PABF these are 90%-maintenance years, the
  // best-behaved case). The aggregate horizon is capped at that target year;
  // we do not extrapolate beyond it.
  const aggregateHorizon = Math.max(...Object.values(STATUTORY_TARGET_YEAR));
  const extendedBaselines = fundSeries.map((fs) => {
    const baseline = fs.projectionsBaseline ?? [];
    if (baseline.length === 0) return baseline;
    const lastFy = baseline[baseline.length - 1].fy;
    if (lastFy >= aggregateHorizon) return baseline;
    const { byFy, extrapolatedFys } = buildExtendedBaseline(
      baseline,
      aggregateHorizon,
      fs.metadata.id as Exclude<FundId, 'aggregate'>,
    );
    console.log(
      `  ${fs.metadata.id.toUpperCase()}: baseline extended ${lastFy} -> ${aggregateHorizon} ` +
        `(${extrapolatedFys.length} synthesized years for the aggregate)`,
    );
    return Array.from(byFy.values()).sort((a, b) => a.fy - b.fy);
  });
  const projectionYearSets = extendedBaselines.map(
    (baseline) => new Set(baseline.map((p) => p.fy)),
  );
  const allFundsHaveProjections = projectionYearSets.every((s) => s.size > 0);
  let aggregateProjections: YearObservation[] | undefined = undefined;
  if (allFundsHaveProjections) {
    const commonYears = Array.from(projectionYearSets[0])
      .filter((y) => projectionYearSets.every((s) => s.has(y)))
      .sort((a, b) => a - b);
    aggregateProjections = commonYears.map((fy) => {
      const yearObs = extendedBaselines
        .map((baseline) => baseline.find((p) => p.fy === fy))
        .filter((o): o is YearObservation => !!o);
      return aggregateYear(yearObs);
    });
  }

  const generatedAt = new Date().toISOString();
  const sourceSnapshot = fundSeries[0].sourceSnapshot;

  const aggregate: FundTimeSeries = {
    metadata: AGGREGATE_METADATA,
    observations: aggregateObservations,
    projectionsBaseline: aggregateProjections,
    fieldSources: {},
    generatedAt,
    sourceSnapshot,
  };

  writeFileSync(join(processedDir, 'aggregate.json'), JSON.stringify(aggregate, null, 2));
  writeFileSync(join(publicDir, 'aggregate.json'), JSON.stringify(aggregate));

  const latest = aggregateObservations[aggregateObservations.length - 1];
  const fr =
    latest.fundedRatioMVA !== null ? `${(latest.fundedRatioMVA * 100).toFixed(1)}%` : 'n/a';
  const uaal =
    latest.uaalMVA !== null ? `$${(latest.uaalMVA / 1e9).toFixed(2)}B` : 'n/a';
  const projStr =
    aggregateProjections && aggregateProjections.length > 0
      ? ` + ${aggregateProjections.length} proj (${aggregateProjections[0].fy}-${aggregateProjections[aggregateProjections.length - 1].fy})`
      : '';
  console.log(
    `  AGGREGATE: ${aggregateObservations.length} years (${aggregateObservations[0].fy}-${latest.fy})${projStr}, ` +
      `FY${latest.fy} funded ${fr}, UAAL ${uaal}`,
  );
}

main();
