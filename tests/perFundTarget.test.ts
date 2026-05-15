/**
 * Step-6 tests: target funded ratio and target year overrides.
 *
 * The unified funding-policy layer is sized analytically so the projected
 * MVA path lands at target_FR * AAL_new[T_user] at the user's target year,
 * regardless of which combination of (rate, target_FR, target_year) the
 * user has dialed in. The 'target-override' source label fires whenever
 * the user has moved off the AV's statutory defaults (with or without a
 * rate change); 'aal-reprice' fires only when rate moved alone.
 *
 * Anchoring decisions the tests pin down:
 *   - Final funded ratio equals target_FR exactly (to 4 decimals).
 *   - Layer spawn semantics: 'target-override' iff target overrides active.
 *   - Directionality: shorter target year => higher ER per year; longer =>
 *     lower; higher target_FR => higher ER; lower => lower.
 *   - Engine throws a clear error if targetYear is past the AV's projection
 *     window (no extrapolation by design).
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

describe('target override — default targets spawn no override layer', () => {
  for (const fundId of ALL_FUND_IDS) {
    it(`${fundId.toUpperCase()} has zero target-override layers at defaults`, () => {
      const fund = FUNDS[fundId];
      const result = runPerFundProjection(fund, defaultPerFundParams(fundId));
      expect(
        result.layers.filter((l) => l.source === 'target-override'),
      ).toHaveLength(0);
    });
  }
});

describe('target FR override — final FR lands exactly on user target', () => {
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      for (const targetFR of [0.5, 0.75, 0.95, 1.0]) {
        it(`hits target_FR = ${targetFR}`, () => {
          const result = runPerFundProjection(fund, {
            ...defaultPerFundParams(fundId),
            targetFundedRatio: targetFR,
          });
          expect(result.finalFundedRatio).toBeCloseTo(targetFR, 4);
        });
      }
    });
  }
});

describe('target FR override — layer source is target-override', () => {
  for (const fundId of ALL_FUND_IDS) {
    it(`${fundId.toUpperCase()} spawns exactly one target-override layer`, () => {
      const fund = FUNDS[fundId];
      const result = runPerFundProjection(fund, {
        ...defaultPerFundParams(fundId),
        targetFundedRatio: 1.0,
      });
      const overrideLayers = result.layers.filter(
        (l) => l.source === 'target-override',
      );
      expect(overrideLayers).toHaveLength(1);
      // No 'aal-reprice' layer when rate is unchanged.
      expect(
        result.layers.filter((l) => l.source === 'aal-reprice'),
      ).toHaveLength(0);
    });
  }
});

describe('target FR override — directionality', () => {
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const baseline = runPerFundProjection(fund, defaultPerFundParams(fundId));
      const higher = runPerFundProjection(fund, {
        ...defaultPerFundParams(fundId),
        targetFundedRatio: 1.0,
      });
      const lower = runPerFundProjection(fund, {
        ...defaultPerFundParams(fundId),
        targetFundedRatio: 0.5,
      });
      it('FR=1.0 raises cumulative ER above baseline', () => {
        expect(higher.cumulativeEmployerContrib).toBeGreaterThan(
          baseline.cumulativeEmployerContrib,
        );
      });
      it('FR=0.5 lowers cumulative ER below baseline', () => {
        expect(lower.cumulativeEmployerContrib).toBeLessThan(
          baseline.cumulativeEmployerContrib,
        );
      });
      it('FR=1.0 layer payments are positive (city pays more)', () => {
        const layer = higher.layers.find((l) => l.source === 'target-override')!;
        expect(layer.initialPayment).toBeGreaterThan(0);
      });
      it('FR=0.5 layer payments are negative (relief)', () => {
        const layer = lower.layers.find((l) => l.source === 'target-override')!;
        expect(layer.initialPayment).toBeLessThan(0);
      });
    });
  }
});

describe('target year override — shorter target year', () => {
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);
      const earlier = runPerFundProjection(fund, {
        ...params,
        targetYear: params.targetYear - 10,
      });

      it('still lands at target_FR by the new (earlier) targetYear', () => {
        expect(earlier.finalFundedRatio).toBeCloseTo(params.targetFundedRatio, 4);
      });

      it('layer ends at the user-chosen targetYear', () => {
        const layer = earlier.layers.find(
          (l) => l.source === 'target-override',
        )!;
        expect(layer.endFy).toBe(params.targetYear - 10);
      });

      it('produces ER above baseline (faster pay-down) in early years', () => {
        const baseline = runPerFundProjection(fund, params);
        const baselineByFy = new Map(
          baseline.years.map((y) => [y.fy, y.employerContribution]),
        );
        let aboveCount = 0;
        for (const y of earlier.years) {
          const b = baselineByFy.get(y.fy);
          if (b === undefined) continue;
          if (y.employerContribution > b + 1) aboveCount++;
        }
        // At least most years should show higher ER (faster amortization).
        expect(aboveCount).toBeGreaterThan(earlier.years.length / 2);
      });
    });
  }
});

describe('target year override — longer target year (where AV supports it)', () => {
  // PABF AV ends at statutory target (2055), so we can't extend it.
  // The AVs of MEABF/LABF/FABF maintain FR≈0.9 post-target by construction
  // (they extend the NC-only steady state), so extending target year alone
  // requires only a trivial adjustment. The meaningful "slower amortization"
  // story comes from combining a later target year with an FR change.
  for (const fundId of ALL_FUND_IDS.filter((f) => f !== 'pabf')) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);

      it('extending target year alone still lands at target_FR', () => {
        const later = runPerFundProjection(fund, {
          ...params,
          targetYear: params.targetYear + 3,
        });
        expect(later.finalFundedRatio).toBeCloseTo(params.targetFundedRatio, 4);
      });

      it('extending year + raising FR=0.95 produces faster amortization', () => {
        const result = runPerFundProjection(fund, {
          ...params,
          targetYear: params.targetYear + 3,
          targetFundedRatio: 0.95,
        });
        expect(result.finalFundedRatio).toBeCloseTo(0.95, 4);
        const layer = result.layers.find(
          (l) => l.source === 'target-override',
        )!;
        expect(layer.endFy).toBe(params.targetYear + 3);
        expect(layer.initialPayment).toBeGreaterThan(0);
      });

      it('extending year + lowering FR=0.75 gives relief throughout', () => {
        const result = runPerFundProjection(fund, {
          ...params,
          targetYear: params.targetYear + 3,
          targetFundedRatio: 0.75,
        });
        expect(result.finalFundedRatio).toBeCloseTo(0.75, 4);
        const layer = result.layers.find(
          (l) => l.source === 'target-override',
        )!;
        expect(layer.initialPayment).toBeLessThan(0);
      });
    });
  }
});

describe('combined rate + target overrides', () => {
  for (const fundId of ALL_FUND_IDS) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const params = defaultPerFundParams(fundId);

      it('rate -1pp + shorter target lands at target_FR', () => {
        const result = runPerFundProjection(fund, {
          ...params,
          assumedReturnDelta: -0.01,
          targetYear: params.targetYear - 5,
        });
        expect(result.finalFundedRatio).toBeCloseTo(params.targetFundedRatio, 4);
      });

      it('rate +1pp + raised FR=1.0 lands at target_FR=1.0', () => {
        const result = runPerFundProjection(fund, {
          ...params,
          assumedReturnDelta: +0.01,
          targetFundedRatio: 1.0,
        });
        expect(result.finalFundedRatio).toBeCloseTo(1.0, 4);
      });

      it('combined overrides label layer as target-override (not aal-reprice)', () => {
        const result = runPerFundProjection(fund, {
          ...params,
          assumedReturnDelta: -0.01,
          targetFundedRatio: 0.95,
        });
        expect(
          result.layers.filter((l) => l.source === 'target-override'),
        ).toHaveLength(1);
        expect(
          result.layers.filter((l) => l.source === 'aal-reprice'),
        ).toHaveLength(0);
      });
    });
  }
});

describe('target year override — extending past AV projection range', () => {
  // PABF's AV ends at statutory target 2055. The engine extends the baseline
  // via geometric extrapolation (see baselineExtension.ts) so the user can
  // pick a target year past 2055.
  it('PABF targetYear=2060 produces a year for each fy through 2060', () => {
    const result = runPerFundProjection(FUNDS.pabf, {
      ...defaultPerFundParams('pabf'),
      targetYear: 2060,
    });
    const projectedFys = result.years.map((y) => y.fy);
    expect(projectedFys[projectedFys.length - 1]).toBe(2060);
  });

  it('PABF lands at target_FR by extended targetYear=2065', () => {
    const result = runPerFundProjection(FUNDS.pabf, {
      ...defaultPerFundParams('pabf'),
      targetYear: 2065,
    });
    expect(result.finalFundedRatio).toBeCloseTo(
      defaultPerFundParams('pabf').targetFundedRatio,
      4,
    );
  });

  it('PABF extended targetYear with raised FR=1.0 lands exactly', () => {
    const result = runPerFundProjection(FUNDS.pabf, {
      ...defaultPerFundParams('pabf'),
      targetYear: 2065,
      targetFundedRatio: 1.0,
    });
    expect(result.finalFundedRatio).toBeCloseTo(1.0, 4);
    const layer = result.layers.find((l) => l.source === 'target-override')!;
    expect(layer.endFy).toBe(2065);
    expect(layer.initialPayment).toBeGreaterThan(0);
  });

  it('PABF extended targetYear with lowered FR=0.5 gives relief', () => {
    const result = runPerFundProjection(FUNDS.pabf, {
      ...defaultPerFundParams('pabf'),
      targetYear: 2065,
      targetFundedRatio: 0.5,
    });
    expect(result.finalFundedRatio).toBeCloseTo(0.5, 4);
    const layer = result.layers.find((l) => l.source === 'target-override')!;
    expect(layer.initialPayment).toBeLessThan(0);
  });
});

describe('target overrides combined with shocks and extras', () => {
  for (const fundId of ALL_FUND_IDS) {
    it(`${fundId.toUpperCase()} respects floor with FR=1.0 + extras + return beat`, () => {
      const fund = FUNDS[fundId];
      const result = runPerFundProjection(fund, {
        ...defaultPerFundParams(fundId),
        targetFundedRatio: 1.0,
        actualReturnDelta: 0.02,
        extraAnnualPayment: 3_000_000_000,
      });
      for (const y of result.years) {
        expect(y.employerContribution).toBeGreaterThanOrEqual(0);
      }
    });
  }
});
