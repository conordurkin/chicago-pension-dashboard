/**
 * Tests for the amortization-layer math.
 *
 * The non-negotiable invariants:
 *   1. The PV of a layer's payment schedule at its interest rate equals the
 *      balance the layer was built to amortize. Round-trip.
 *   2. Sign convention: positive balance (loss) -> positive payments; negative
 *      balance (gain) -> negative payments.
 *   3. Payments are zero outside [startFy, endFy].
 *   4. Level-percent grows at growthRate per year; level-dollar is flat.
 */

import { describe, expect, it } from 'vitest';

import {
  type AmortLayer,
  layerPaymentAt,
  makeLayer,
  solveLevelDollarPayment,
  solveLevelPercentInitialPayment,
  sumLayerPayments,
} from '@/lib/projections/layers';

/** PV at rate `r` of a stream of payments. */
function pvSchedule(payments: number[], rate: number): number {
  let pv = 0;
  for (let i = 0; i < payments.length; i++) {
    pv += payments[i] / Math.pow(1 + rate, i + 1);
  }
  return pv;
}

function levelPercentSchedule(
  initialPayment: number,
  growth: number,
  years: number,
): number[] {
  const out: number[] = [];
  for (let k = 0; k < years; k++) {
    out.push(initialPayment * Math.pow(1 + growth, k));
  }
  return out;
}

describe('solveLevelPercentInitialPayment', () => {
  it('round-trips: PV of generated schedule at rate r equals balance', () => {
    const cases = [
      { balance: 1_000_000_000, rate: 0.0666, growth: 0.02, years: 33 },
      { balance: 500_000_000, rate: 0.07, growth: 0.025, years: 20 },
      { balance: 10_000_000, rate: 0.05, growth: 0.0, years: 10 },
      { balance: 100_000_000, rate: 0.0662, growth: 0.025, years: 30 },
    ];
    for (const c of cases) {
      const p0 = solveLevelPercentInitialPayment(c.balance, c.rate, c.growth, c.years);
      const schedule = levelPercentSchedule(p0, c.growth, c.years);
      const pv = pvSchedule(schedule, c.rate);
      expect(pv).toBeCloseTo(c.balance, 2);
    }
  });

  it('returns balance / N when rate == growth (limit case)', () => {
    const p0 = solveLevelPercentInitialPayment(1_000_000, 0.05, 0.05, 10);
    expect(p0).toBeCloseTo(100_000, 6);
  });

  it('negative balance (gain) produces negative initial payment', () => {
    const p0 = solveLevelPercentInitialPayment(-1_000_000_000, 0.0666, 0.02, 33);
    expect(p0).toBeLessThan(0);

    // Sign-symmetric with positive balance of the same magnitude.
    const pPos = solveLevelPercentInitialPayment(
      1_000_000_000,
      0.0666,
      0.02,
      33,
    );
    expect(p0).toBeCloseTo(-pPos, 6);
  });

  it('returns the balance when years <= 0 (degenerate)', () => {
    expect(solveLevelPercentInitialPayment(123, 0.07, 0.02, 0)).toBe(123);
    expect(solveLevelPercentInitialPayment(123, 0.07, 0.02, -5)).toBe(123);
  });
});

describe('solveLevelDollarPayment', () => {
  it('round-trips: PV of flat schedule equals balance', () => {
    const cases = [
      { balance: 1_000_000_000, rate: 0.07, years: 30 },
      { balance: 500_000_000, rate: 0.0666, years: 20 },
      { balance: 1_000_000, rate: 0.05, years: 10 },
    ];
    for (const c of cases) {
      const p = solveLevelDollarPayment(c.balance, c.rate, c.years);
      const schedule = Array(c.years).fill(p);
      const pv = pvSchedule(schedule, c.rate);
      expect(pv).toBeCloseTo(c.balance, 2);
    }
  });

  it('returns balance / N when rate == 0', () => {
    expect(solveLevelDollarPayment(1_000_000, 0, 10)).toBeCloseTo(100_000, 6);
  });

  it('negative balance produces negative payment', () => {
    const p = solveLevelDollarPayment(-1_000_000, 0.07, 20);
    expect(p).toBeLessThan(0);
  });
});

describe('makeLayer', () => {
  it('returns null for zero-magnitude balance', () => {
    const layer = makeLayer({
      source: 'return-experience',
      balance: 0,
      startFy: 2026,
      endFy: 2058,
      rate: 0.0666,
      amortMethod: 'levelPercent',
      payrollGrowth: 0.02,
    });
    expect(layer).toBeNull();
  });

  it('returns null when window is empty (startFy > endFy)', () => {
    const layer = makeLayer({
      source: 'return-experience',
      balance: 1_000_000,
      startFy: 2060,
      endFy: 2055,
      rate: 0.0666,
      amortMethod: 'levelPercent',
      payrollGrowth: 0.02,
    });
    expect(layer).toBeNull();
  });

  it('level-percent layer round-trips to its balance', () => {
    const layer = makeLayer({
      source: 'return-experience',
      balance: 100_000_000,
      startFy: 2026,
      endFy: 2058,
      rate: 0.0666,
      amortMethod: 'levelPercent',
      payrollGrowth: 0.02,
    })!;
    expect(layer).not.toBeNull();
    expect(layer.growthRate).toBe(0.02);
    const years = layer.endFy - layer.startFy + 1;
    const schedule = levelPercentSchedule(layer.initialPayment, layer.growthRate, years);
    expect(pvSchedule(schedule, 0.0666)).toBeCloseTo(100_000_000, 2);
  });

  it('level-dollar layer round-trips with zero growth', () => {
    const layer = makeLayer({
      source: 'return-experience',
      balance: 50_000_000,
      startFy: 2026,
      endFy: 2045,
      rate: 0.07,
      amortMethod: 'levelDollar',
      payrollGrowth: 0.02, // ignored for levelDollar
    })!;
    expect(layer.growthRate).toBe(0);
    const years = layer.endFy - layer.startFy + 1;
    const schedule = Array(years).fill(layer.initialPayment);
    expect(pvSchedule(schedule, 0.07)).toBeCloseTo(50_000_000, 2);
  });
});

describe('layerPaymentAt', () => {
  const layer: AmortLayer = {
    source: 'return-experience',
    startFy: 2026,
    endFy: 2030,
    initialPayment: 100,
    growthRate: 0.05,
  };

  it('returns the initial payment at startFy', () => {
    expect(layerPaymentAt(layer, 2026)).toBe(100);
  });

  it('grows the payment by (1+growth)^k after startFy', () => {
    expect(layerPaymentAt(layer, 2027)).toBeCloseTo(100 * 1.05, 8);
    expect(layerPaymentAt(layer, 2030)).toBeCloseTo(100 * Math.pow(1.05, 4), 8);
  });

  it('returns 0 before startFy and after endFy', () => {
    expect(layerPaymentAt(layer, 2025)).toBe(0);
    expect(layerPaymentAt(layer, 2031)).toBe(0);
    expect(layerPaymentAt(layer, 2100)).toBe(0);
  });

  it('preserves sign for negative initial payment', () => {
    const negLayer: AmortLayer = { ...layer, initialPayment: -100 };
    expect(layerPaymentAt(negLayer, 2026)).toBe(-100);
    expect(layerPaymentAt(negLayer, 2030)).toBeLessThan(0);
  });
});

describe('sumLayerPayments', () => {
  it('returns 0 for empty list', () => {
    expect(sumLayerPayments([], 2030)).toBe(0);
  });

  it('sums payments across active layers', () => {
    const layers: AmortLayer[] = [
      {
        source: 'return-experience',
        startFy: 2026,
        endFy: 2030,
        initialPayment: 100,
        growthRate: 0,
      },
      {
        source: 'aal-reprice',
        startFy: 2027,
        endFy: 2029,
        initialPayment: 50,
        growthRate: 0,
      },
    ];
    expect(sumLayerPayments(layers, 2026)).toBe(100);
    expect(sumLayerPayments(layers, 2027)).toBe(150);
    expect(sumLayerPayments(layers, 2029)).toBe(150);
    expect(sumLayerPayments(layers, 2030)).toBe(100);
    expect(sumLayerPayments(layers, 2031)).toBe(0);
  });

  it('handles signed layers (gain + loss cancellation)', () => {
    const layers: AmortLayer[] = [
      {
        source: 'return-experience',
        startFy: 2026,
        endFy: 2030,
        initialPayment: 100,
        growthRate: 0,
      },
      {
        source: 'return-experience',
        startFy: 2026,
        endFy: 2030,
        initialPayment: -100,
        growthRate: 0,
      },
    ];
    expect(sumLayerPayments(layers, 2028)).toBe(0);
  });
});
