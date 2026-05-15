/**
 * Sanity checks on processed fund data. Fails the build if any hard errors found.
 * Warnings are printed but don't halt.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FundTimeSeries, YearObservation } from '../src/types/pension';
import { ALL_FUND_IDS } from '../src/types/pension';

interface Issue {
  severity: 'error' | 'warn';
  fund: string;
  message: string;
}

function checkObservation(
  fund: string,
  obs: YearObservation,
  issues: Issue[],
): void {
  const loc = `${fund} FY${obs.fy}`;

  // Non-negative MVA
  if (obs.mva !== null && obs.mva < 0) {
    issues.push({ severity: 'error', fund, message: `${loc}: MVA is negative (${obs.mva})` });
  }

  // Funded ratio bounds (allow up to 2.0 as a sanity ceiling)
  for (const [name, r] of [
    ['fundedRatioMVA', obs.fundedRatioMVA],
    ['fundedRatioAVA', obs.fundedRatioAVA],
    ['fundedRatioGASB67', obs.fundedRatioGASB67],
  ] as const) {
    if (r !== null && (r < 0 || r > 2)) {
      issues.push({
        severity: 'error',
        fund,
        message: `${loc}: ${name}=${r} is outside [0, 2]`,
      });
    }
  }

  // UAAL = AAL - MVA reconciliation (MVA basis)
  if (obs.aal !== null && obs.mva !== null && obs.uaalMVA !== null) {
    const implied = obs.aal - obs.mva;
    const diff = Math.abs(implied - obs.uaalMVA);
    if (diff > 1) {
      // > $1
      issues.push({
        severity: 'error',
        fund,
        message: `${loc}: uaalMVA=${obs.uaalMVA} does not match aal-mva=${implied}`,
      });
    }
  }

  // Discount rate sanity
  if (obs.discountRate !== null && (obs.discountRate < 0.03 || obs.discountRate > 0.1)) {
    issues.push({
      severity: 'warn',
      fund,
      message: `${loc}: discountRate=${obs.discountRate} is outside typical [3%, 10%] range`,
    });
  }

  // Required fields for years >= 2015
  if (obs.fy >= 2015) {
    const required: Array<keyof YearObservation> = [
      'aal',
      'mva',
      'fundedRatioMVA',
      'employerContribution',
      'benefitPayments',
    ];
    for (const field of required) {
      if (obs[field] === null) {
        issues.push({
          severity: 'warn',
          fund,
          message: `${loc}: required field ${field} is null`,
        });
      }
    }
  }
}

function checkSeries(fund: string, ts: FundTimeSeries, issues: Issue[]): void {
  // Years must be unique and sorted
  const years = ts.observations.map((o) => o.fy);
  const unique = new Set(years);
  if (unique.size !== years.length) {
    issues.push({ severity: 'error', fund, message: `Duplicate fiscal years in observations` });
  }
  const sorted = [...years].sort((a, b) => a - b);
  for (let i = 0; i < years.length; i++) {
    if (years[i] !== sorted[i]) {
      issues.push({ severity: 'error', fund, message: `Observations are not sorted by fy` });
      break;
    }
  }

  // Must have at least 20 years of data
  if (ts.observations.length < 20) {
    issues.push({
      severity: 'error',
      fund,
      message: `Only ${ts.observations.length} observations (expected >=20)`,
    });
  }

  for (const obs of ts.observations) {
    checkObservation(fund, obs, issues);
  }
}

function main() {
  const projectRoot = join(__dirname, '..');
  const processedDir = join(projectRoot, 'data', 'processed', 'funds');

  const issues: Issue[] = [];
  const fundIds = [...ALL_FUND_IDS, 'aggregate' as const];

  for (const fundId of fundIds) {
    const path = join(processedDir, `${fundId}.json`);
    let ts: FundTimeSeries;
    try {
      ts = JSON.parse(readFileSync(path, 'utf-8')) as FundTimeSeries;
    } catch (e) {
      issues.push({
        severity: 'error',
        fund: fundId,
        message: `Failed to load ${path}: ${(e as Error).message}`,
      });
      continue;
    }
    checkSeries(fundId, ts, issues);
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warn');

  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings.slice(0, 20)) {
      console.log(`  WARN [${w.fund}] ${w.message}`);
    }
    if (warnings.length > 20) {
      console.log(`  ... and ${warnings.length - 20} more`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s):`);
    for (const e of errors) {
      console.error(`  ERR [${e.fund}] ${e.message}`);
    }
    process.exit(1);
  }

  console.log(`\nValidation passed. ${warnings.length} warning(s), 0 error(s).`);
}

main();
