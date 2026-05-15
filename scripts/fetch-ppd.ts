/**
 * Fetches raw Public Plans Database (PPD) data for Chicago's four city pension funds.
 *
 * Output: data/raw/ppd-YYYYMMDD.json (combined) + per-fund files for easier diff review.
 *
 * PPD API docs: https://publicplansdata.org/public-plans-database/api/
 * Variables reference: https://publicplansdata.org/resources/download-full-data-set/
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// PPD plan IDs for Chicago's four city funds
const CHICAGO_FUNDS = [
  { id: 'meabf', ppdId: 145, name: 'Chicago Municipal Employees' },
  { id: 'labf', ppdId: 215, name: 'Chicago Laborers' },
  { id: 'pabf', ppdId: 146, name: 'Chicago Police' },
  { id: 'fabf', ppdId: 206, name: 'Chicago Fire' },
] as const;

// All PPD variables we need. Grouped for readability.
const VARIABLES = [
  // Identity
  'fy',
  'PlanName',
  'ppd_id',

  // Funding — GASB 25 (actuarial, pre-2014 regime, but still reported)
  'ActFundedRatio_GASB',
  'ActAssets_GASB',
  'ActLiabilities_GASB',
  'UAAL_GASB',

  // Funding — GASB 67 (market value, 2014+)
  'ActFundedRatio_GASB67',
  'NetPosition',
  'TotalPensionLiability',
  'NetPensionLiability',

  // Market value of assets (all years)
  'MktAssets_net',
  'BegMktAssets_net',
  'FairValueChange_tot',

  // Assumptions
  'InvestmentReturnAssumption_GASB',
  'BlendedDiscountRate',
  'InflationAssumption_GASB',
  'UAALAmortPeriod_GASB',
  'FundingMeth_GASB',

  // Required contributions
  'ADEC',
  'RequiredContribution',
  'PercentReqContPaid',
  'ReqContAmount_ER',
  'ReqContAmount_ER_Stat',

  // Actual contributions
  'contrib_ER_tot',
  'contrib_ER_regular',
  'contrib_ER_state',
  'contrib_EE_regular',
  'contrib_tot',

  // Benefits and expenses
  'expense_TotBenefits',
  'expense_AdminExpenses',
  'expense_RetBenefits',
  'expense_COLABenefits',
  'expense_refunds',
  'expense_net',

  // Investment income
  'income_net',
  'income_interest_dividends_tot',

  // Investment returns
  'InvestmentReturn_1yr',
  'InvestmentReturn_5yr',
  'InvestmentReturn_10yr',

  // Asset allocation (actual)
  'EQTotal_Actl',
  'FITotal_Actl',
  'RETotal_Actl',
  'PETotal_Actl',
  'HFTotal_Actl',
  'AltMiscTotal_Actl',
  'CashTotal_Actl',
  'OtherTotal_Actl',

  // Cost structure
  'NormCostAmount_tot',
  'NormCostAmount_EE',
  'NormCostAmount_ER',
  'NormCostRate_tot',
  'NormCostRate_ER',
  'UAALRate',
  'payroll',
  'ProjectedPayroll',

  // Membership
  'actives_tot',
  'ActiveSalary_avg',
  'ActiveAge_avg',
  'ActiveTenure_avg',
  'beneficiaries_tot',
  'BeneficiaryBenefit_avg',
  'BeneficiaryAge_avg',
  'beneficiaries_ServiceRetirees',
  'beneficiaries_DisabilityRetirees',
  'beneficiaries_survivors',
  'TotMembership',
  'InactiveVestedMembers',
];

const API_BASE = 'https://publicplansdata.org/api/';

interface PpdApiResponse {
  status: string;
  date: string;
  q: string;
  params: string;
  recordcount: number;
}

type PpdRecord = Record<string, string | null>;
type PpdResponse = [PpdApiResponse, ...PpdRecord[]];

async function fetchFundData(ppdId: number): Promise<PpdRecord[]> {
  const url = new URL(API_BASE);
  url.searchParams.set('q', 'QVariables');
  url.searchParams.set('variables', VARIABLES.join(','));
  url.searchParams.set('filterppdid', String(ppdId));
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`PPD API error for ppd_id=${ppdId}: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as PpdResponse;
  const [meta, ...records] = data;

  if (meta.status !== 'OK') {
    throw new Error(`PPD API returned non-OK status for ppd_id=${ppdId}: ${meta.status}`);
  }

  console.log(`  ppd_id=${ppdId}: ${records.length} records`);
  return records;
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function main() {
  const projectRoot = join(__dirname, '..');
  const rawDir = join(projectRoot, 'data', 'raw');
  mkdirSync(rawDir, { recursive: true });

  const fetchDate = new Date();
  const dateStr = formatDate(fetchDate);

  console.log(`Fetching PPD data for ${CHICAGO_FUNDS.length} Chicago pension funds...`);

  const results: Record<string, PpdRecord[]> = {};
  for (const fund of CHICAGO_FUNDS) {
    console.log(`Fetching ${fund.name} (${fund.id})...`);
    results[fund.id] = await fetchFundData(fund.ppdId);
  }

  const combined = {
    fetchedAt: fetchDate.toISOString(),
    variables: VARIABLES,
    funds: CHICAGO_FUNDS.map((f) => ({ ...f, records: results[f.id] })),
  };

  const combinedPath = join(rawDir, `ppd-${dateStr}.json`);
  writeFileSync(combinedPath, JSON.stringify(combined, null, 2));
  console.log(`\nWrote combined raw data → ${combinedPath}`);

  // Also write a "latest" pointer so normalize.ts has a stable input path
  const latestPath = join(rawDir, 'ppd-latest.json');
  writeFileSync(latestPath, JSON.stringify(combined, null, 2));
  console.log(`Wrote latest pointer → ${latestPath}`);

  // Per-fund files for easier git diff review
  for (const fund of CHICAGO_FUNDS) {
    const fundPath = join(rawDir, `${fund.id}-${dateStr}.json`);
    writeFileSync(
      fundPath,
      JSON.stringify(
        { fetchedAt: fetchDate.toISOString(), ...fund, records: results[fund.id] },
        null,
        2,
      ),
    );
  }

  const totalRecords = Object.values(results).reduce((sum, r) => sum + r.length, 0);
  console.log(`\nDone. Total records: ${totalRecords} across ${CHICAGO_FUNDS.length} funds.`);
}

main().catch((err) => {
  console.error('Fetch failed:', err);
  process.exit(1);
});
