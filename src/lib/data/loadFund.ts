/**
 * Server-side loader for fund time series JSON.
 *
 * Uses Node fs since the data files live in the repo and are shipped
 * with the build. Called from Server Components at render time.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FundId, FundTimeSeries } from '@/types/pension';

/** Earliest fiscal year the dashboard displays. Pre-1997 data is incomplete across funds. */
export const DISPLAY_START_FY = 1997;

export function loadFund(fundId: FundId): FundTimeSeries {
  const path = join(process.cwd(), 'public', 'data', 'funds', `${fundId}.json`);
  const raw = readFileSync(path, 'utf-8');
  const ts = JSON.parse(raw) as FundTimeSeries;
  return {
    ...ts,
    observations: ts.observations.filter((o) => o.fy >= DISPLAY_START_FY),
  };
}

export function loadAllFunds(): Record<FundId, FundTimeSeries> {
  return {
    meabf: loadFund('meabf'),
    labf: loadFund('labf'),
    pabf: loadFund('pabf'),
    fabf: loadFund('fabf'),
    aggregate: loadFund('aggregate'),
  };
}

export function isValidFundId(id: string): id is FundId {
  return ['meabf', 'labf', 'pabf', 'fabf', 'aggregate'].includes(id);
}
