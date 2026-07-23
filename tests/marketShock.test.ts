/**
 * One-time market shock tests: `actualReturnOverrides` on
 * `PerFundScenarioParams`.
 *
 * Validates the single-year shock override mechanism layered on top of the
 * existing return-experience machinery: a shock year uses its override
 * value outright (not additive with the flat `actualReturnDelta`), every
 * other year is unaffected, and the shock spawns exactly one extra
 * return-experience layer sized to that year's full deviation.
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

const FUNDS: Record<(typeof ALL_FUND_IDS)[number], FundTimeSeries> = {
  meabf: meabfData as unknown as FundTimeSeries,
  labf: labfData as unknown as FundTimeSeries,
  pabf: pabfData as unknown as FundTimeSeries,
  fabf: fabfData as unknown as FundTimeSeries,
};

describe('market shock — single-year actualReturnOverrides', () => {
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);
      const shockFy = params.targetYear - 5;
      const baseline = runPerFundProjection(fund, params);
      const shocked = runPerFundProjection(fund, {
        ...params,
        actualReturnOverrides: { [shockFy]: -0.1 },
      });

      it('baseline (no shock, no other deltas) spawns no layers', () => {
        expect(baseline.layers.length).toBe(0);
      });

      it('years before the shock are identical to baseline', () => {
        for (const y of shocked.years) {
          if (y.fy >= shockFy) continue;
          const b = baseline.years.find((by) => by.fy === y.fy)!;
          expect(y.mva).toBeCloseTo(b.mva, 6);
          expect(y.employerContribution).toBeCloseTo(b.employerContribution, 6);
        }
      });

      it('the shock year takes a real hit to MVA, not rounding noise', () => {
        const y = shocked.years.find((r) => r.fy === shockFy)!;
        const b = baseline.years.find((r) => r.fy === shockFy)!;
        expect(y.mva).toBeLessThan(b.mva);
        const priorMva =
          baseline.years.find((r) => r.fy === shockFy - 1)?.mva ??
          fund.observations[fund.observations.length - 1].mva!;
        const drop = b.mva - y.mva;
        // A -10% shock on that year's starting MVA — bounded loosely (5-15%)
        // since compounding/timing conventions shift the exact base slightly.
        expect(drop).toBeGreaterThan(priorMva * 0.05);
        expect(drop).toBeLessThan(priorMva * 0.15);
      });

      it('spawns exactly one return-experience layer starting the year after the shock', () => {
        expect(shocked.layers.length).toBe(1);
        const layer = shocked.layers[0];
        expect(layer.source).toBe('return-experience');
        expect(layer.startFy).toBe(shockFy + 1);
        expect(layer.endFy).toBe(params.targetYear);
        expect(layer.initialPayment).toBeGreaterThan(0); // loss -> city pays more
      });

      it('contributions rise starting the year after the shock', () => {
        const yAfter = shocked.years.find((r) => r.fy === shockFy + 1)!;
        const bAfter = baseline.years.find((r) => r.fy === shockFy + 1)!;
        expect(yAfter.employerContribution).toBeGreaterThan(bAfter.employerContribution);
      });
    });
  }
});

describe('market shock — override wins outright over a nonzero flat delta', () => {
  for (const fundId of ALL_FUND_IDS) {
    it(`${fundId.toUpperCase()} shock year's realized return ignores the flat delta`, () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);
      const shockFy = params.targetYear - 5;

      const withZeroFlatDelta = runPerFundProjection(fund, {
        ...params,
        actualReturnDelta: 0,
        actualReturnOverrides: { [shockFy]: -0.1 },
      });
      const withNonzeroFlatDelta = runPerFundProjection(fund, {
        ...params,
        actualReturnDelta: 0.005,
        actualReturnOverrides: { [shockFy]: -0.1 },
      });

      const shockYearA = withZeroFlatDelta.years.find((r) => r.fy === shockFy)!;
      const shockYearB = withNonzeroFlatDelta.years.find((r) => r.fy === shockFy)!;
      // The shock year's realized return is identical in both runs — the
      // flat delta is fully overridden for that one year.
      expect(shockYearB.actualReturn).toBeCloseTo(shockYearA.actualReturn, 10);

      // A later, non-shock year DOES differ, proving the flat delta still
      // applies everywhere else.
      const laterYearA = withZeroFlatDelta.years.find((r) => r.fy === shockFy + 2)!;
      const laterYearB = withNonzeroFlatDelta.years.find((r) => r.fy === shockFy + 2)!;
      expect(laterYearB.actualReturn).toBeGreaterThan(laterYearA.actualReturn);
    });
  }
});

describe('market shock — no layer window left when shock lands on targetYear', () => {
  for (const fundId of ALL_FUND_IDS) {
    it(`${fundId.toUpperCase()} still perturbs MVA but spawns no relief layer`, () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);
      const baseline = runPerFundProjection(fund, params);
      const shocked = runPerFundProjection(fund, {
        ...params,
        actualReturnOverrides: { [params.targetYear]: -0.1 },
      });
      expect(shocked.layers.length).toBe(0);
      const y = shocked.years.find((r) => r.fy === params.targetYear)!;
      const b = baseline.years.find((r) => r.fy === params.targetYear)!;
      expect(y.mva).toBeLessThan(b.mva);
    });
  }
});

describe('market shock — omitting actualReturnOverrides reproduces flat-delta behavior exactly', () => {
  for (const fundId of ALL_FUND_IDS) {
    it(`${fundId.toUpperCase()} matches a run with actualReturnOverrides explicitly undefined`, () => {
      const fund = FUNDS[fundId];
      const params = { ...defaultPerFundParams(fundId), actualReturnDelta: 0.004 };
      const withoutField = runPerFundProjection(fund, params);
      const withUndefinedField = runPerFundProjection(fund, {
        ...params,
        actualReturnOverrides: undefined,
      });
      expect(withUndefinedField.finalFundedRatio).toBeCloseTo(withoutField.finalFundedRatio, 10);
      expect(withUndefinedField.cumulativeEmployerContrib).toBeCloseTo(
        withoutField.cumulativeEmployerContrib,
        4,
      );
    });
  }
});
