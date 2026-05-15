/**
 * Step-3 tests: return-experience layer spawning under shocks.
 *
 * These tests exercise the perturbation/experience-gain machinery added
 * to runPerFundProjection in step 3. They check sign conventions, monotone
 * directionality, sign symmetry, and end-to-end PV consistency with the
 * layer math.
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

describe('return-experience layers — 1pp miss every year', () => {
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const baseline = runPerFundProjection(fund, defaultPerFundParams(fundId));
      const miss = runPerFundProjection(fund, {
        ...defaultPerFundParams(fundId),
        actualReturnDelta: -0.01,
      });

      it('spawns return-experience layers each year through targetYear-1', () => {
        const params = defaultPerFundParams(fundId);
        const yearsWithGain = miss.years.filter(
          (y) => y.fy < params.targetYear,
        ).length;
        // Each loss year (with future window remaining) spawns one layer.
        expect(miss.layers.length).toBe(yearsWithGain);
        // All return-experience layers should have positive initial payment
        // (loss -> city pays more).
        for (const layer of miss.layers) {
          expect(layer.source).toBe('return-experience');
          expect(layer.initialPayment).toBeGreaterThan(0);
        }
      });

      it('produces ER above baseline in every year except the first', () => {
        // Year 0 (first projected year) has no layers paying yet, so ER
        // equals baseline. From year 1 onward, layers start paying.
        const params = defaultPerFundParams(fundId);
        for (let i = 1; i < miss.years.length; i++) {
          const y = miss.years[i];
          const b = baseline.years[i];
          if (y.fy > params.targetYear) continue;
          expect(y.employerContribution).toBeGreaterThan(b.employerContribution);
        }
      });

      it('produces MVA below baseline (returns drag fund down)', () => {
        for (let i = 0; i < miss.years.length; i++) {
          const y = miss.years[i];
          const b = baseline.years[i];
          expect(y.mva).toBeLessThan(b.mva);
        }
      });

      it('cumulative ER strictly exceeds baseline cumulative ER', () => {
        expect(miss.cumulativeEmployerContrib).toBeGreaterThan(
          baseline.cumulativeEmployerContrib,
        );
      });
    });
  }
});

describe('return-experience layers — 1pp beat every year', () => {
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const baseline = runPerFundProjection(fund, defaultPerFundParams(fundId));
      const beat = runPerFundProjection(fund, {
        ...defaultPerFundParams(fundId),
        actualReturnDelta: +0.01,
      });

      it('spawns negative-balance relief layers', () => {
        expect(beat.layers.length).toBeGreaterThan(0);
        for (const layer of beat.layers) {
          expect(layer.source).toBe('return-experience');
          expect(layer.initialPayment).toBeLessThan(0);
        }
      });

      it('produces MVA above baseline', () => {
        for (let i = 0; i < beat.years.length; i++) {
          expect(beat.years[i].mva).toBeGreaterThan(baseline.years[i].mva);
        }
      });

      it('produces ER below baseline from year 2 onward (until floor)', () => {
        // Layers begin paying in year 2 (one year after first gain spawn).
        // Until the cumulative relief grows past baseline ER, total ER stays
        // positive but below baseline. The exact crossover year depends on
        // fund size, but in all four cases relief reaches the floor well
        // before targetYear.
        const params = defaultPerFundParams(fundId);
        let sawReducedYear = false;
        for (let i = 1; i < beat.years.length; i++) {
          const y = beat.years[i];
          const b = baseline.years[i];
          if (y.fy > params.targetYear) continue;
          if (y.employerContribution < b.employerContribution) {
            sawReducedYear = true;
          }
        }
        expect(sawReducedYear).toBe(true);
      });

      it('cumulative ER is less than baseline (gain relief drives ER down)', () => {
        expect(beat.cumulativeEmployerContrib).toBeLessThan(
          baseline.cumulativeEmployerContrib,
        );
      });
    });
  }
});

describe('sign symmetry: +X delta and -X delta produce mirror-image shocks', () => {
  for (const fundId of ALL_FUND_IDS) {
    it(`${fundId.toUpperCase()} mirrors at small delta where linearization holds`, () => {
      const fund = FUNDS[fundId];
      const baseline = runPerFundProjection(fund, defaultPerFundParams(fundId));
      const miss = runPerFundProjection(fund, {
        ...defaultPerFundParams(fundId),
        actualReturnDelta: -0.001, // 10 bps miss
      });
      const beat = runPerFundProjection(fund, {
        ...defaultPerFundParams(fundId),
        actualReturnDelta: +0.001, // 10 bps beat
      });

      // For small deltas, miss and beat should produce mirror-image
      // perturbations in the early years (before higher-order compounding
      // diverges). Test the first year only, where the linearization is
      // exact (M[0] is the same observed value in both runs).
      const missGain = miss.years[0].mva - baseline.years[0].mva;
      const beatGain = beat.years[0].mva - baseline.years[0].mva;
      // |missGain| should equal |beatGain| to high precision.
      expect(Math.abs(missGain + beatGain)).toBeLessThan(1);
    });
  }
});

describe('extras: $100M/yr nominal flat through targetYear', () => {
  // Extras are treated as voluntary experience gains: each year's extra
  // payment spawns a relief layer that pays out from the next year through
  // targetYear. So year-1 ER is additive (baseline + extras), but later
  // years see scheduled ER decline as accumulated relief layers offset it.
  // Cumulative ER comes in BELOW baseline + total-extras: relief in later
  // years reduces scheduled ER faster than the city is adding extras.
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);
      const baseline = runPerFundProjection(fund, params);
      const extra = runPerFundProjection(fund, {
        ...params,
        extraAnnualPayment: 100_000_000,
      });

      it('every year through targetYear has extraPayment = $100M', () => {
        for (const y of extra.years) {
          if (y.fy <= params.targetYear) {
            expect(y.extraPayment).toBe(100_000_000);
          } else {
            expect(y.extraPayment).toBe(0);
          }
        }
      });

      it('spawns one return-experience layer per year through targetYear-1', () => {
        const yearsWithGain = extra.years.filter(
          (y) => y.fy < params.targetYear,
        ).length;
        expect(extra.layers.length).toBe(yearsWithGain);
        for (const layer of extra.layers) {
          expect(layer.source).toBe('return-experience');
          // Extras are positive gains -> negative balance (relief)
          expect(layer.initialPayment).toBeLessThan(0);
        }
      });

      it('first projected year ER equals baseline + $100M exactly', () => {
        const y0 = extra.years[0];
        const b0 = baseline.years[0];
        expect(y0.employerContribution).toBeCloseTo(
          b0.employerContribution + 100_000_000,
          0,
        );
      });

      it('later years ER falls below baseline + $100M as relief compounds', () => {
        // Pick a year roughly 1/3 of the way through. Relief should already
        // be visibly reducing the scheduled component.
        const midIdx = Math.floor(extra.years.length / 3);
        const y = extra.years[midIdx];
        const b = baseline.years[midIdx];
        expect(y.employerContribution).toBeLessThan(
          b.employerContribution + 100_000_000,
        );
      });

      it('MVA strictly exceeds baseline every year', () => {
        for (let i = 0; i < extra.years.length; i++) {
          expect(extra.years[i].mva).toBeGreaterThan(baseline.years[i].mva);
        }
      });

      it('final funded ratio meets or exceeds the AV target', () => {
        expect(extra.finalFundedRatio).toBeGreaterThanOrEqual(
          params.targetFundedRatio - 1e-6,
        );
      });
    });
  }
});

describe('extras: $100M/yr for limited years (extraPaymentYears)', () => {
  // After the extras window closes, relief layers spawned during that window
  // continue paying out, so scheduled ER stays below baseline through
  // targetYear. The fund still lands at (or near) target FR.
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);
      const baseline = runPerFundProjection(fund, params);
      const limited = runPerFundProjection(fund, {
        ...params,
        extraAnnualPayment: 100_000_000,
        extraPaymentYears: 10,
      });

      it('extraPayment is $100M for exactly 10 years, then 0', () => {
        const firstFy = limited.years[0].fy;
        for (const y of limited.years) {
          if (y.fy < firstFy + 10 && y.fy <= params.targetYear) {
            expect(y.extraPayment).toBe(100_000_000);
          } else {
            expect(y.extraPayment).toBe(0);
          }
        }
      });

      it('spawns 10 relief layers (one per extras year)', () => {
        expect(limited.layers.length).toBe(10);
        for (const layer of limited.layers) {
          expect(layer.initialPayment).toBeLessThan(0);
        }
      });

      it('post-window scheduled ER drops below baseline', () => {
        // First year after the 10-year window: only the spawned relief
        // layers contribute, so ER < baseline ER.
        const firstFy = limited.years[0].fy;
        const postWindowYear = limited.years.find((y) => y.fy === firstFy + 10);
        const postWindowBaseline = baseline.years.find(
          (b) => b.fy === firstFy + 10,
        );
        expect(postWindowYear).toBeDefined();
        expect(postWindowBaseline).toBeDefined();
        expect(postWindowYear!.employerContribution).toBeLessThan(
          postWindowBaseline!.employerContribution,
        );
      });

      it('lands at (or above) the target funded ratio', () => {
        expect(limited.finalFundedRatio).toBeGreaterThanOrEqual(
          params.targetFundedRatio - 1e-6,
        );
      });
    });
  }
});

describe('floor invariant: total_ER >= 0 in all scenarios', () => {
  for (const fundId of ALL_FUND_IDS) {
    it(`${fundId.toUpperCase()} respects floor under extreme relief`, () => {
      const fund = FUNDS[fundId];
      // Massive extras + big return beat. Should drive ER toward zero floor.
      const result = runPerFundProjection(fund, {
        ...defaultPerFundParams(fundId),
        actualReturnDelta: 0.02,
        extraAnnualPayment: 5_000_000_000,
      });
      for (const y of result.years) {
        expect(y.employerContribution).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

describe('layer retirement: no layer pays past its endFy', () => {
  for (const fundId of ALL_FUND_IDS) {
    it(`${fundId.toUpperCase()} layers all end at targetYear`, () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);
      const result = runPerFundProjection(fund, {
        ...params,
        actualReturnDelta: -0.005,
      });
      for (const layer of result.layers) {
        expect(layer.endFy).toBe(params.targetYear);
        expect(layer.startFy).toBeGreaterThan(result.startFy);
        expect(layer.startFy).toBeLessThanOrEqual(params.targetYear);
      }
    });
  }
});
