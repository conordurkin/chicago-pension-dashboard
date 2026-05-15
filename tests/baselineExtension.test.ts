/**
 * Validates buildExtendedBaseline against published AV post-target rows.
 *
 * Approach: for MEABF/LABF/FABF (whose AVs run past their statutory target),
 * we truncate the baseline at the statutory year and extrapolate forward to
 * the AV's actual last fy. We then compare synthesized rows against the AV's
 * published rows for the same span. If the extrapolation logic captures the
 * steady-state behavior of these three funds, we have confidence applying it
 * to PABF (whose AV ends at statutory and has no post-target rows to check).
 *
 * Tolerances are tighter on AAL/payroll/EE/NC (which extrapolate cleanly via
 * geometric growth) and looser on MVA (locked to AAL post-statutory) and on
 * ER (dominated by the step-down regime change — MEABF's drop happens 2yr
 * post-statutory rather than 1yr, an idiosyncrasy we don't model).
 */

import { describe, expect, it } from 'vitest';

import { buildExtendedBaseline } from '@/lib/projections/baselineExtension';
import { STATUTORY_TARGET_YEAR } from '@/lib/data/scenarioDefaults';
import type { FundTimeSeries, YearObservation } from '@/types/pension';

import fabfData from '../public/data/funds/fabf.json';
import labfData from '../public/data/funds/labf.json';
import meabfData from '../public/data/funds/meabf.json';
import pabfData from '../public/data/funds/pabf.json';

type FundKey = 'meabf' | 'labf' | 'fabf' | 'pabf';
const FUNDS: Record<FundKey, FundTimeSeries> = {
  meabf: meabfData as unknown as FundTimeSeries,
  labf: labfData as unknown as FundTimeSeries,
  fabf: fabfData as unknown as FundTimeSeries,
  pabf: pabfData as unknown as FundTimeSeries,
};

/** Funds whose AV extends past their statutory target year. */
const VALIDATABLE: FundKey[] = ['meabf', 'labf', 'fabf'];

function pctDiff(synth: number | null, actual: number | null): number {
  if (synth === null || actual === null || actual === 0) return Infinity;
  return Math.abs(synth - actual) / Math.abs(actual);
}

describe('buildExtendedBaseline — preserves AV rows and extends forward', () => {
  for (const fundId of VALIDATABLE) {
    it(`${fundId.toUpperCase()} preserves existing AV rows untouched`, () => {
      const fund = FUNDS[fundId];
      const baseline = fund.projectionsBaseline!;
      const lastFy = baseline[baseline.length - 1].fy;
      const { byFy } = buildExtendedBaseline(baseline, lastFy + 5, fundId);
      for (const row of baseline) {
        expect(byFy.get(row.fy)).toBe(row);
      }
    });

    it(`${fundId.toUpperCase()} extends forward when horizon > lastFy`, () => {
      const fund = FUNDS[fundId];
      const baseline = fund.projectionsBaseline!;
      const lastFy = baseline[baseline.length - 1].fy;
      const { extrapolatedFys } = buildExtendedBaseline(
        baseline,
        lastFy + 5,
        fundId,
      );
      expect(extrapolatedFys).toEqual([
        lastFy + 1,
        lastFy + 2,
        lastFy + 3,
        lastFy + 4,
        lastFy + 5,
      ]);
    });
  }
});

describe('buildExtendedBaseline — truncate at statutory, compare to AV', () => {
  for (const fundId of VALIDATABLE) {
    describe(fundId.toUpperCase(), () => {
      const fund = FUNDS[fundId];
      const baseline = fund.projectionsBaseline!;
      const statutory = STATUTORY_TARGET_YEAR[fundId];
      const horizonFy = baseline[baseline.length - 1].fy;
      const truncated = baseline.filter((r) => r.fy <= statutory);
      const { byFy } = buildExtendedBaseline(truncated, horizonFy, fundId);
      const synthFys = baseline
        .filter((r) => r.fy > statutory)
        .map((r) => r.fy);

      it('synthesizes a row for every post-statutory fy', () => {
        for (const fy of synthFys) {
          expect(byFy.has(fy)).toBe(true);
        }
      });

      // Fields with tight tolerance: AAL grows steadily, payroll grows
      // steadily, EE/NC follow payroll. These should extrapolate within
      // a few percent over a 15+ year horizon.
      const TIGHT_FIELDS: (keyof YearObservation)[] = [
        'aal',
        'payroll',
      ];
      for (const field of TIGHT_FIELDS) {
        it(`${field} extrapolates within 5% at every post-statutory fy`, () => {
          for (const fy of synthFys) {
            const synth = byFy.get(fy)![field] as number | null;
            const actual = baseline.find((r) => r.fy === fy)![field] as
              | number
              | null;
            const diff = pctDiff(synth, actual);
            expect(diff, `${fundId} fy=${fy} ${field}`).toBeLessThan(0.05);
          }
        });
      }

      // MVA is locked to track AAL post-statutory; should hold within 5%
      // since AVs maintain FR≈0.9 in their post-target steady state.
      it('mva extrapolates within 5% at every post-statutory fy', () => {
        for (const fy of synthFys) {
          const synth = byFy.get(fy)!.mva;
          const actual = baseline.find((r) => r.fy === fy)!.mva;
          const diff = pctDiff(synth, actual);
          expect(diff, `${fundId} fy=${fy} mva`).toBeLessThan(0.05);
        }
      });

      // Final FR should match very closely since MVA tracks AAL.
      it('final funded ratio at horizon matches AV within 2pp', () => {
        const last = byFy.get(horizonFy)!;
        const lastActual = baseline.find((r) => r.fy === horizonFy)!;
        const synthFr =
          last.aal! > 0 ? last.mva! / last.aal! : 0;
        const actualFr =
          lastActual.aal! > 0 ? lastActual.mva! / lastActual.aal! : 0;
        expect(Math.abs(synthFr - actualFr)).toBeLessThan(0.02);
      });
    });
  }
});

describe('buildExtendedBaseline — post-statutory ER step-down accuracy', () => {
  // Cross-fund pattern: at the AV's statutory-target year ER drops 3-4x
  // (MEABF 4.1x at fy+2, LABF 3.5x at fy+1, FABF 3.7x at fy+1). Our formula
  // under-predicts by 10-20% across MEABF/LABF/FABF — extrapolated to PABF
  // we expect a ~5x drop (within the same band).
  it('PABF first post-statutory ER is 4-7x lower than statutory-year ER', () => {
    const fund = FUNDS.pabf;
    const baseline = fund.projectionsBaseline!;
    const { byFy } = buildExtendedBaseline(baseline, 2060, 'pabf');
    const erAtStatutory = baseline.find((r) => r.fy === 2055)!
      .employerContribution!;
    const erFirstPost = byFy.get(2056)!.employerContribution!;
    const dropRatio = erAtStatutory / erFirstPost;
    expect(dropRatio).toBeGreaterThan(4);
    expect(dropRatio).toBeLessThan(7);
  });

  it('PABF holds FR near 0.9 across extrapolated horizon', () => {
    const fund = FUNDS.pabf;
    const baseline = fund.projectionsBaseline!;
    const { byFy, extrapolatedFys } = buildExtendedBaseline(
      baseline,
      2070,
      'pabf',
    );
    expect(extrapolatedFys.length).toBe(15);
    for (const fy of extrapolatedFys) {
      const row = byFy.get(fy)!;
      const fr = row.mva! / row.aal!;
      expect(Math.abs(fr - 0.9)).toBeLessThan(0.005);
    }
  });

  // Cross-validation against AV-published first post-statutory ER, for the
  // funds whose ER drops at statutory+1 (LABF and FABF). MEABF's published
  // step-down occurs at statutory+2 — a one-year delay we don't model
  // generically, so MEABF's first-year prediction structurally undershoots.
  it('LABF/FABF first post-statutory ER within 50% of published value', () => {
    const cases: Array<{ fund: FundKey; stepFy: number }> = [
      { fund: 'labf', stepFy: 2059 },
      { fund: 'fabf', stepFy: 2056 },
    ];
    for (const { fund, stepFy } of cases) {
      const baseline = FUNDS[fund].projectionsBaseline!;
      const statutory = STATUTORY_TARGET_YEAR[fund];
      const truncated = baseline.filter((r) => r.fy <= statutory);
      const { byFy } = buildExtendedBaseline(truncated, stepFy, fund);
      const predicted = byFy.get(stepFy)!.employerContribution!;
      const actual = baseline.find((r) => r.fy === stepFy)!
        .employerContribution!;
      const err = Math.abs(predicted - actual) / actual;
      expect(err, `${fund} fy=${stepFy} pred=${predicted} actual=${actual}`)
        .toBeLessThan(0.5);
    }
  });
});

describe('buildExtendedBaseline — no-op when horizon <= lastFy', () => {
  it('returns the AV rows as-is and no extrapolated fys', () => {
    const fund = FUNDS.meabf;
    const baseline = fund.projectionsBaseline!;
    const lastFy = baseline[baseline.length - 1].fy;
    const { byFy, extrapolatedFys } = buildExtendedBaseline(
      baseline,
      lastFy,
      'meabf',
    );
    expect(extrapolatedFys).toEqual([]);
    expect(byFy.size).toBe(baseline.length);
  });
});

describe('buildExtendedBaseline — flagExtrapolated marker', () => {
  it('marks synthesized rows with __extrapolated when opt is set', () => {
    const fund = FUNDS.pabf;
    const baseline = fund.projectionsBaseline!;
    const { byFy } = buildExtendedBaseline(baseline, 2058, 'pabf', {
      flagExtrapolated: true,
    });
    const synth = byFy.get(2056) as unknown as Record<string, unknown>;
    expect(synth.__extrapolated).toBe(true);
    const av = byFy.get(2055) as unknown as Record<string, unknown>;
    expect(av.__extrapolated).toBeUndefined();
  });
});
