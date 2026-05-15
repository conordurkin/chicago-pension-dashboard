/**
 * AV tie-out regression tests for the v2 per-fund scenario engine.
 *
 * The architectural invariant: when the user makes no slider changes
 * (default scenario, no shocks), the engine output equals each fund's
 * published actuarial-valuation baseline trajectory exactly, year by
 * year. If this fails, the architecture is wrong — full stop.
 */

import { describe, expect, it } from 'vitest';

import {
  defaultPerFundParams,
  runPerFundProjection,
} from '@/lib/projections/perFund';
import { ALL_FUND_IDS, type FundTimeSeries } from '@/types/pension';

import fabfData from '../public/data/funds/fabf.json';
import labfData from '../public/data/funds/labf.json';
import meabfData from '../public/data/funds/meabf.json';
import pabfData from '../public/data/funds/pabf.json';

const FUNDS: Record<Exclude<(typeof ALL_FUND_IDS)[number], never>, FundTimeSeries> = {
  meabf: meabfData as unknown as FundTimeSeries,
  labf: labfData as unknown as FundTimeSeries,
  pabf: pabfData as unknown as FundTimeSeries,
  fabf: fabfData as unknown as FundTimeSeries,
};

/** Tolerance for AV tie-out: $10 (effectively a rounding check). */
const TIE_OUT_EPSILON = 10;

describe('per-fund AV tie-out (default scenario, no shocks)', () => {
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);
      const result = runPerFundProjection(fund, params);
      const baseline = fund.projectionsBaseline!;
      const baselineByFy = new Map(baseline.map((r) => [r.fy, r]));

      it('produces a year for every AV baseline year through targetYear', () => {
        const targetYear = params.targetYear;
        const projectedYears = result.years.map((y) => y.fy);
        const expectedYears = baseline
          .filter((r) => r.fy <= targetYear)
          .map((r) => r.fy);
        expect(projectedYears).toEqual(expectedYears);
      });

      it('matches AV employer contribution every year (within $10)', () => {
        for (const y of result.years) {
          const av = baselineByFy.get(y.fy);
          expect(av).toBeDefined();
          expect(av!.employerContribution).not.toBeNull();
          expect(y.employerContribution).toBeCloseTo(
            av!.employerContribution!,
            -Math.log10(TIE_OUT_EPSILON),
          );
        }
      });

      it('matches AV employee contribution every year', () => {
        for (const y of result.years) {
          const av = baselineByFy.get(y.fy);
          expect(y.employeeContribution).toBeCloseTo(
            av!.employeeContribution!,
            -Math.log10(TIE_OUT_EPSILON),
          );
        }
      });

      it('matches AV AAL, MVA, and benefits every year', () => {
        for (const y of result.years) {
          const av = baselineByFy.get(y.fy);
          expect(y.aal).toBeCloseTo(av!.aal!, -Math.log10(TIE_OUT_EPSILON));
          expect(y.mva).toBeCloseTo(av!.mva!, -Math.log10(TIE_OUT_EPSILON));
          expect(y.benefitPayments).toBeCloseTo(
            av!.benefitPayments!,
            -Math.log10(TIE_OUT_EPSILON),
          );
        }
      });

      it('spawns no layers in the default scenario', () => {
        expect(result.layers).toHaveLength(0);
      });

      it('effective assumed return equals fund baseline rate', () => {
        expect(result.effectiveAssumedReturn).toBeCloseTo(
          result.baselineRate,
          10,
        );
      });
    });
  }
});

describe('aggregate AV tie-out (default scenario, no shocks)', () => {
  it('aggregate employer contribution equals sum of per-fund AVs each year', async () => {
    const { runAggregateProjection, buildPerFundParams } = await import(
      '@/lib/projections/aggregate'
    );
    const params = buildPerFundParams({
      assumedReturnDelta: 0,
      actualReturnDelta: 0,
      targetFundedRatio: 0.9,
      amortMethod: 'levelPercent',
      extraAnnualPayment: 0,
    });
    const result = runAggregateProjection(FUNDS, params);

    // For each year in the aggregate, sum should equal sum of per-fund AVs at that year.
    for (const y of result.years) {
      let expected = 0;
      for (const fundId of ALL_FUND_IDS) {
        const av = FUNDS[fundId].projectionsBaseline!.find(
          (r) => r.fy === y.fy,
        );
        // A fund may not have a baseline row at this fy (PABF stops at 2055).
        // But the aggregate's per-fund projection also stops, so it's
        // consistent — but our aggregate only sums years where the fund
        // projected. Check: if y.fy is within the fund's target year, AV
        // must have a row.
        if (av && av.employerContribution !== null && y.fy <= params[fundId].targetYear) {
          expected += av.employerContribution;
        }
      }
      // Aggregate ER at this fy should match expected sum (within rounding).
      // Note: aggregate years extend beyond some funds' target years; in
      // those tail years the fund contributes 0. AV doesn't have ER beyond
      // target year either, so this comparison is fine.
      expect(y.employerContribution).toBeCloseTo(expected, -1);
    }
  });
});
