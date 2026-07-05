/**
 * Normalizes raw PPD data into the typed YearObservation schema.
 *
 * Input:  data/raw/ppd-latest.json
 * Output: data/processed/funds/{meabf,labf,pabf,fabf}.json
 *         + public/data/funds/{meabf,labf,pabf,fabf}.json (browser-served copies)
 *
 * Key transformations:
 * - All dollar values converted from thousands to raw USD
 * - String-encoded numbers parsed
 * - Derived fields computed (UAAL MVA, funded ratio MVA, burn rate, etc.)
 * - Expense signs flipped to positive for display convenience
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import type { FundId, FundTimeSeries, YearObservation } from '../src/types/pension';
import { ALL_FUND_IDS, FUND_METADATA } from '../src/types/pension';

type PpdRecord = Record<string, string | null>;

interface RawData {
  fetchedAt: string;
  variables: string[];
  funds: Array<{
    id: string;
    ppdId: number;
    name: string;
    records: PpdRecord[];
  }>;
}

// --- Parsing helpers ---

/** Parse a PPD string value to number or null. */
function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse a dollar value (stored in thousands) and convert to raw USD. */
function dollars(v: string | null | undefined): number | null {
  const n = num(v);
  return n === null ? null : n * 1000;
}

/** Parse a dollar value and flip sign to positive (for expenses which are stored negative). */
function dollarsAbs(v: string | null | undefined): number | null {
  const n = dollars(v);
  return n === null ? null : Math.abs(n);
}

/** Parse an integer (for counts). */
function intOr(v: string | null | undefined): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

/** Compute UAAL MVA = AAL - MVA, or null if either is missing. */
function subOrNull(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

/** Compute ratio a/b, or null if either is missing or b is zero. */
function divOrNull(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

// --- Core transformation ---

function normalizeRecord(r: PpdRecord): YearObservation {
  // Raw parses
  const aalGASB25 = dollars(r.ActLiabilities_GASB);
  const tplGASB67 = dollars(r.TotalPensionLiability);
  const aal = tplGASB67 ?? aalGASB25;

  const mva = dollars(r.MktAssets_net);
  const ava = dollars(r.ActAssets_GASB);
  const mvaBeginning = dollars(r.BegMktAssets_net);

  const npl = dollars(r.NetPensionLiability);
  const uaalAVA = dollars(r.UAAL_GASB);
  const uaalMVA = subOrNull(aal, mva);

  const fundedRatioAVA = num(r.ActFundedRatio_GASB);
  const fundedRatioGASB67 = num(r.ActFundedRatio_GASB67);
  // Use GASB 25 liability basis for MVA ratio so it's consistent across all years
  const fundedRatioMVA = divOrNull(mva, aalGASB25);

  // Contributions
  const employerContribution = dollars(r.contrib_ER_tot);
  const employerContribRegular = dollars(r.contrib_ER_regular);
  const employerContribState = dollars(r.contrib_ER_state);
  const employeeContribution = dollars(r.contrib_EE_regular);
  const totalContributions = dollars(r.contrib_tot);

  // Required contributions
  // ADEC is the GASB 67/68 (post-2014) field name; RequiredContribution is the pre-2014
  // GASB 25/27 ARC under the old name (values match where they overlap). ReqContAmount_ER
  // is the employer-portion fallback used when neither of the above is populated.
  const adec =
    dollars(r.ADEC) ?? dollars(r.RequiredContribution) ?? dollars(r.ReqContAmount_ER);
  const statutoryRequired = dollars(r.ReqContAmount_ER_Stat);
  const percentRequiredPaid = num(r.PercentReqContPaid);
  const contribShortfall =
    adec !== null && employerContribution !== null ? adec - employerContribution : null;

  // Outflows (stored negative in PPD, flip to positive)
  const benefitPayments = dollarsAbs(r.expense_TotBenefits);
  const retBenefits = dollarsAbs(r.expense_RetBenefits);
  const colaBenefits = dollarsAbs(r.expense_COLABenefits);
  const refunds = dollarsAbs(r.expense_refunds);
  const adminExpenses = dollarsAbs(r.expense_AdminExpenses);

  // Net cashflow = contributions - (benefits + admin)
  const outflows =
    (benefitPayments ?? 0) + (adminExpenses ?? 0);
  const netCashflow =
    totalContributions !== null ? totalContributions - outflows : null;

  // Investment
  const investmentIncome = dollars(r.income_net);
  const interestDividends = dollars(r.income_interest_dividends_tot);
  const fairValueChange = dollars(r.FairValueChange_tot);

  // Membership
  const actives = intOr(r.actives_tot);
  const beneficiaries = intOr(r.beneficiaries_tot);
  const activesPerBeneficiary =
    actives !== null && beneficiaries !== null && beneficiaries > 0
      ? actives / beneficiaries
      : null;

  // Note: PPD stores salary/benefit averages already in thousands-of-dollars
  // (e.g. ActiveSalary_avg: "67.265" means $67,265). Convert to raw USD.
  const avgActiveSalary = dollars(r.ActiveSalary_avg);
  const avgBenefit = dollars(r.BeneficiaryBenefit_avg);

  // Cost
  const normalCostTotal = dollars(r.NormCostAmount_tot);
  const normalCostER = dollars(r.NormCostAmount_ER);
  const normalCostEE = dollars(r.NormCostAmount_EE);
  const payroll = dollars(r.payroll);
  const projectedPayroll = dollars(r.ProjectedPayroll);

  // Burn rate: benefits / MVA
  const burnRate = divOrNull(benefitPayments, mva);

  return {
    fy: Number(r.fy),

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

    discountRate: num(r.InvestmentReturnAssumption_GASB),
    inflationAssumption: num(r.InflationAssumption_GASB),
    uaalAmortPeriod: intOr(r.UAALAmortPeriod_GASB),

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

    investmentIncome,
    interestDividends,
    fairValueChange,
    return1yr: num(r.InvestmentReturn_1yr),
    return5yr: num(r.InvestmentReturn_5yr),
    return10yr: num(r.InvestmentReturn_10yr),

    normalCostTotal,
    normalCostER,
    normalCostEE,
    normalCostRateTotal: num(r.NormCostRate_tot),
    normalCostRateER: num(r.NormCostRate_ER),
    uaalRate: num(r.UAALRate),
    payroll,
    projectedPayroll,

    actives,
    avgActiveSalary,
    avgActiveAge: num(r.ActiveAge_avg),
    avgActiveTenure: num(r.ActiveTenure_avg),
    beneficiaries,
    avgBenefit,
    beneficiariesServiceRetirees: intOr(r.beneficiaries_ServiceRetirees),
    beneficiariesDisability: intOr(r.beneficiaries_DisabilityRetirees),
    beneficiariesSurvivors: intOr(r.beneficiaries_survivors),
    inactiveVested: intOr(r.InactiveVestedMembers),
    totalMembership: intOr(r.TotMembership),
    activesPerBeneficiary,

    allocation: {
      equity: num(r.EQTotal_Actl),
      fixedIncome: num(r.FITotal_Actl),
      realEstate: num(r.RETotal_Actl),
      privateEquity: num(r.PETotal_Actl),
      hedgeFunds: num(r.HFTotal_Actl),
      cash: num(r.CashTotal_Actl),
      other: num(r.OtherTotal_Actl),
      altMisc: num(r.AltMiscTotal_Actl),
    },

    burnRate,
  };
}

// --- Historical (pre-PPD) supplement ---

/** Build a YearObservation with every numeric field null. */
function emptyObservation(fy: number): YearObservation {
  return {
    fy,
    aalGASB25: null, tplGASB67: null, aal: null,
    mva: null, ava: null, mvaBeginning: null,
    uaalAVA: null, uaalMVA: null, npl: null,
    fundedRatioAVA: null, fundedRatioMVA: null, fundedRatioGASB67: null,
    discountRate: null, inflationAssumption: null, uaalAmortPeriod: null,
    employerContribution: null, employerContribRegular: null, employerContribState: null,
    employeeContribution: null, totalContributions: null,
    adec: null, statutoryRequired: null, percentRequiredPaid: null, contribShortfall: null,
    benefitPayments: null, retBenefits: null, colaBenefits: null, refunds: null,
    adminExpenses: null, netCashflow: null,
    investmentIncome: null, interestDividends: null, fairValueChange: null,
    return1yr: null, return5yr: null, return10yr: null,
    normalCostTotal: null, normalCostER: null, normalCostEE: null,
    normalCostRateTotal: null, normalCostRateER: null, uaalRate: null,
    payroll: null, projectedPayroll: null,
    actives: null, avgActiveSalary: null, avgActiveAge: null, avgActiveTenure: null,
    beneficiaries: null, avgBenefit: null,
    beneficiariesServiceRetirees: null, beneficiariesDisability: null,
    beneficiariesSurvivors: null, inactiveVested: null, totalMembership: null,
    activesPerBeneficiary: null,
    allocation: {
      equity: null, fixedIncome: null, realEstate: null, privateEquity: null,
      hedgeFunds: null, cash: null, other: null, altMisc: null,
    },
    burnRate: null,
  };
}

function parseCsvCell(v: string): number | null {
  const s = v.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

interface HistoricalRow {
  fundId: string;
  observation: YearObservation;
}

/**
 * Parse data/manual/historical-pre2001.csv into per-fund YearObservations.
 * CSV columns: fundId,fy,aalGASB25,ava,mva,uaalAVA,fundedRatioAVA,payroll,
 *              employerContribution,employeeContribution,benefitPayments,
 *              adminExpenses,investmentIncome,discountRate,actives,
 *              avgActiveSalary,beneficiaries,avgBenefit,adec,
 *              costMethod,sourceNote
 * costMethod and sourceNote are metadata (not stored in YearObservation).
 */
function loadHistoricalRows(csvPath: string): HistoricalRow[] {
  const text = readFileSync(csvPath, 'utf-8').trim();
  const lines = text.split('\n');
  const header = lines[0].split(',').map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const rows: HistoricalRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const fundId = cells[idx('fundId')].trim();
    const fy = Number(cells[idx('fy')]);
    if (!Number.isFinite(fy)) continue;

    const obs = emptyObservation(fy);
    const aalGASB25 = parseCsvCell(cells[idx('aalGASB25')]);
    const ava = parseCsvCell(cells[idx('ava')]);
    const mva = parseCsvCell(cells[idx('mva')]);
    const uaalAVA = parseCsvCell(cells[idx('uaalAVA')]);
    const fundedRatioAVA = parseCsvCell(cells[idx('fundedRatioAVA')]);
    const payroll = parseCsvCell(cells[idx('payroll')]);
    const employerContribution = parseCsvCell(cells[idx('employerContribution')]);
    const employeeContribution = parseCsvCell(cells[idx('employeeContribution')]);
    const benefitPayments = parseCsvCell(cells[idx('benefitPayments')]);
    const adminExpenses = parseCsvCell(cells[idx('adminExpenses')]);
    const investmentIncome = parseCsvCell(cells[idx('investmentIncome')]);
    const discountRate = parseCsvCell(cells[idx('discountRate')]);

    // Optional demographic + ADC columns (present in extended schema, may be absent in older rows)
    const activesIdx = idx('actives');
    const avgActiveSalaryIdx = idx('avgActiveSalary');
    const beneficiariesIdx = idx('beneficiaries');
    const avgBenefitIdx = idx('avgBenefit');
    const adecIdx = idx('adec');
    const actives = activesIdx >= 0 ? parseCsvCell(cells[activesIdx] ?? '') : null;
    const avgActiveSalary =
      avgActiveSalaryIdx >= 0 ? parseCsvCell(cells[avgActiveSalaryIdx] ?? '') : null;
    const beneficiaries =
      beneficiariesIdx >= 0 ? parseCsvCell(cells[beneficiariesIdx] ?? '') : null;
    const avgBenefit = avgBenefitIdx >= 0 ? parseCsvCell(cells[avgBenefitIdx] ?? '') : null;
    const adec = adecIdx >= 0 ? parseCsvCell(cells[adecIdx] ?? '') : null;

    obs.aalGASB25 = aalGASB25;
    obs.aal = aalGASB25;
    obs.ava = ava;
    obs.mva = mva;
    obs.uaalAVA = uaalAVA;
    obs.uaalMVA = aalGASB25 !== null && mva !== null ? aalGASB25 - mva : null;
    obs.fundedRatioAVA = fundedRatioAVA;
    obs.fundedRatioMVA = mva !== null && aalGASB25 !== null && aalGASB25 > 0
      ? mva / aalGASB25
      : null;
    obs.payroll = payroll;
    obs.employerContribution = employerContribution;
    obs.employeeContribution = employeeContribution;
    obs.benefitPayments = benefitPayments;
    obs.adminExpenses = adminExpenses;
    obs.investmentIncome = investmentIncome;
    obs.discountRate = discountRate;

    obs.actives = actives === null ? null : Math.round(actives);
    obs.avgActiveSalary = avgActiveSalary;
    obs.beneficiaries = beneficiaries === null ? null : Math.round(beneficiaries);
    obs.avgBenefit = avgBenefit;
    obs.adec = adec;
    obs.activesPerBeneficiary =
      obs.actives !== null && obs.beneficiaries !== null && obs.beneficiaries > 0
        ? obs.actives / obs.beneficiaries
        : null;
    obs.contribShortfall =
      obs.adec !== null && obs.employerContribution !== null
        ? obs.adec - obs.employerContribution
        : null;
    obs.percentRequiredPaid =
      obs.adec !== null && obs.adec > 0 && obs.employerContribution !== null
        ? obs.employerContribution / obs.adec
        : null;

    if (employerContribution !== null || employeeContribution !== null) {
      obs.totalContributions =
        (employerContribution ?? 0) + (employeeContribution ?? 0);
    }

    rows.push({ fundId, observation: obs });
  }
  return rows;
}

// --- PPD patches (overlay on PPD observations) ---

type PatchField = keyof Pick<
  YearObservation,
  | 'aalGASB25' | 'ava' | 'mva' | 'uaalAVA' | 'fundedRatioAVA' | 'payroll'
  | 'employerContribution' | 'employeeContribution' | 'benefitPayments'
  | 'adminExpenses' | 'investmentIncome' | 'discountRate' | 'actives'
  | 'avgActiveSalary' | 'beneficiaries' | 'avgBenefit' | 'adec'
  | 'tplGASB67' | 'npl' | 'fundedRatioGASB67' | 'return1yr' | 'refunds'
  | 'normalCostTotal' | 'normalCostER' | 'statutoryRequired' | 'mvaBeginning'
  | 'inactiveVested' | 'totalMembership'
>;

interface PatchRow {
  fundId: string;
  fy: number;
  patch: Partial<Record<PatchField, number>>;
}

/**
 * Parse data/manual/ppd-patches.csv. Same column layout as historical-pre2001.csv
 * but applies as an overlay on PPD observations rather than appending new rows.
 * Empty cells mean "do not overlay this field".
 */
function loadPatchRows(csvPath: string): PatchRow[] {
  let text: string;
  try {
    text = readFileSync(csvPath, 'utf-8').trim();
  } catch {
    return []; // patches file is optional
  }
  const lines = text.split('\n');
  const header = lines[0].split(',').map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const fieldMap: Array<[string, PatchField]> = [
    ['aalGASB25', 'aalGASB25'], ['ava', 'ava'], ['mva', 'mva'],
    ['uaalAVA', 'uaalAVA'], ['fundedRatioAVA', 'fundedRatioAVA'], ['payroll', 'payroll'],
    ['employerContribution', 'employerContribution'],
    ['employeeContribution', 'employeeContribution'],
    ['benefitPayments', 'benefitPayments'], ['adminExpenses', 'adminExpenses'],
    ['investmentIncome', 'investmentIncome'], ['discountRate', 'discountRate'],
    ['actives', 'actives'], ['avgActiveSalary', 'avgActiveSalary'],
    ['beneficiaries', 'beneficiaries'], ['avgBenefit', 'avgBenefit'],
    ['adec', 'adec'],
    ['tplGASB67', 'tplGASB67'], ['npl', 'npl'],
    ['fundedRatioGASB67', 'fundedRatioGASB67'], ['return1yr', 'return1yr'],
    ['refunds', 'refunds'], ['normalCostTotal', 'normalCostTotal'],
    ['normalCostER', 'normalCostER'], ['statutoryRequired', 'statutoryRequired'],
    ['mvaBeginning', 'mvaBeginning'],
    ['inactiveVested', 'inactiveVested'], ['totalMembership', 'totalMembership'],
  ];

  const rows: PatchRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const fundId = cells[idx('fundId')]?.trim();
    const fy = Number(cells[idx('fy')]);
    if (!fundId || !Number.isFinite(fy)) continue;
    const patch: Partial<Record<PatchField, number>> = {};
    for (const [col, field] of fieldMap) {
      const ci = idx(col);
      if (ci < 0) continue;
      const v = parseCsvCell(cells[ci] ?? '');
      const isCount =
        field === 'actives' || field === 'beneficiaries' ||
        field === 'inactiveVested' || field === 'totalMembership';
      if (v !== null) patch[field] = isCount ? Math.round(v) : v;
    }
    rows.push({ fundId, fy, patch });
  }
  return rows;
}

/** Apply a patch over a PPD-derived observation. Non-null patch fields win. */
function applyPatch(obs: YearObservation, patch: Partial<Record<PatchField, number>>): YearObservation {
  const merged: YearObservation = { ...obs };
  for (const [k, v] of Object.entries(patch) as Array<[PatchField, number]>) {
    (merged as unknown as Record<string, unknown>)[k] = v;
  }
  // Recompute derived fields that depend on patched inputs.
  merged.aal = merged.tplGASB67 ?? merged.aalGASB25;
  merged.uaalMVA = subOrNull(merged.aal, merged.mva);
  merged.fundedRatioMVA = divOrNull(merged.mva, merged.aalGASB25);
  if (patch.employerContribution !== undefined || patch.employeeContribution !== undefined) {
    merged.totalContributions =
      (merged.employerContribution ?? 0) + (merged.employeeContribution ?? 0);
  }
  if (patch.benefitPayments !== undefined || patch.adminExpenses !== undefined ||
      patch.employerContribution !== undefined || patch.employeeContribution !== undefined) {
    const outflows = (merged.benefitPayments ?? 0) + (merged.adminExpenses ?? 0);
    merged.netCashflow = merged.totalContributions !== null
      ? merged.totalContributions - outflows : null;
  }
  merged.burnRate = divOrNull(merged.benefitPayments, merged.mva);
  merged.activesPerBeneficiary =
    merged.actives !== null && merged.beneficiaries !== null && merged.beneficiaries > 0
      ? merged.actives / merged.beneficiaries : null;
  if (patch.adec !== undefined || patch.employerContribution !== undefined) {
    merged.contribShortfall =
      merged.adec !== null && merged.employerContribution !== null
        ? merged.adec - merged.employerContribution : null;
    merged.percentRequiredPaid =
      merged.adec !== null && merged.adec > 0 && merged.employerContribution !== null
        ? merged.employerContribution / merged.adec : null;
  }
  return merged;
}

// --- Projections baseline (from 2024 AV projection schedules) ---

/**
 * Parse data/manual/projections/{fundId}.csv (values in $ thousands) into
 * a YearObservation-shaped row usable as a projection baseline.
 *
 * Columns: fundId, fy, aal, mva, ava, uaalAVA, fundedRatioAVA, payroll,
 *          normalCostTotal, normalCostER, adec, employerContribution,
 *          contributionBasis, employeeContribution, benefitPayments, adminExpenses
 */
function loadProjectionRows(csvPath: string): YearObservation[] {
  let text: string;
  try {
    text = readFileSync(csvPath, 'utf-8').trim();
  } catch {
    return [];
  }
  const lines = text.split('\n');
  const header = lines[0].split(',').map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const rows: YearObservation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const fy = Number(cells[idx('fy')]);
    if (!Number.isFinite(fy)) continue;

    const toDollars = (col: string): number | null => {
      const ci = idx(col);
      if (ci < 0) return null;
      const v = parseCsvCell(cells[ci] ?? '');
      return v === null ? null : v * 1000;
    };
    const toNum = (col: string): number | null => {
      const ci = idx(col);
      if (ci < 0) return null;
      return parseCsvCell(cells[ci] ?? '');
    };

    const aalGASB25 = toDollars('aal');
    const mva = toDollars('mva');
    const ava = toDollars('ava');
    const uaalAVA = toDollars('uaalAVA');
    const fundedRatioAVA = toNum('fundedRatioAVA');
    const payroll = toDollars('payroll');
    const normalCostTotal = toDollars('normalCostTotal');
    const normalCostER = toDollars('normalCostER');
    const adec = toDollars('adec');
    const employerContribution = toDollars('employerContribution');
    const employeeContribution = toDollars('employeeContribution');
    const benefitPayments = toDollars('benefitPayments');
    const adminExpenses = toDollars('adminExpenses');

    const obs = emptyObservation(fy);
    obs.aalGASB25 = aalGASB25;
    obs.aal = aalGASB25;
    obs.mva = mva;
    obs.ava = ava;
    obs.uaalAVA = uaalAVA;
    obs.uaalMVA = subOrNull(aalGASB25, mva);
    obs.fundedRatioAVA = fundedRatioAVA;
    obs.fundedRatioMVA = divOrNull(mva, aalGASB25);
    obs.payroll = payroll;
    obs.normalCostTotal = normalCostTotal;
    obs.normalCostER = normalCostER;
    obs.adec = adec;
    obs.employerContribution = employerContribution;
    obs.employeeContribution = employeeContribution;
    obs.benefitPayments = benefitPayments;
    obs.adminExpenses = adminExpenses;
    obs.contribShortfall =
      adec !== null && employerContribution !== null ? adec - employerContribution : null;
    obs.percentRequiredPaid =
      adec !== null && adec > 0 && employerContribution !== null
        ? employerContribution / adec
        : null;
    if (employerContribution !== null || employeeContribution !== null) {
      obs.totalContributions =
        (employerContribution ?? 0) + (employeeContribution ?? 0);
    }
    if (obs.totalContributions !== null) {
      const outflows = (benefitPayments ?? 0) + (adminExpenses ?? 0);
      obs.netCashflow = obs.totalContributions - outflows;
    }
    obs.burnRate = divOrNull(benefitPayments, mva);

    rows.push(obs);
  }
  return rows;
}

// --- Main ---

function main() {
  const projectRoot = join(__dirname, '..');
  const rawPath = join(projectRoot, 'data', 'raw', 'ppd-latest.json');
  const historicalCsvPath = join(projectRoot, 'data', 'manual', 'historical-pre2001.csv');
  const patchesCsvPath = join(projectRoot, 'data', 'manual', 'ppd-patches.csv');
  const projectionsDir = join(projectRoot, 'data', 'manual', 'projections');
  const processedDir = join(projectRoot, 'data', 'processed', 'funds');
  const publicDir = join(projectRoot, 'public', 'data', 'funds');

  mkdirSync(processedDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });

  const raw: RawData = JSON.parse(readFileSync(rawPath, 'utf-8'));
  const snapshotDate = raw.fetchedAt.slice(0, 10).replaceAll('-', '');

  const historicalRows = loadHistoricalRows(historicalCsvPath);
  const patchRows = loadPatchRows(patchesCsvPath);
  console.log(
    `Normalizing ${raw.funds.length} funds from ${raw.fetchedAt} ` +
      `+ ${historicalRows.length} historical (pre-PPD) rows ` +
      `+ ${patchRows.length} PPD patches...`,
  );

  for (const fundId of ALL_FUND_IDS) {
    const fundRaw = raw.funds.find((f) => f.id === fundId);
    if (!fundRaw) {
      console.warn(`  MISSING RAW DATA: ${fundId}`);
      continue;
    }

    const fundPatches = new Map<number, Partial<Record<PatchField, number>>>();
    for (const r of patchRows) {
      if (r.fundId === fundId) fundPatches.set(r.fy, r.patch);
    }

    const ppdObservations = fundRaw.records.map((r) => {
      const obs = normalizeRecord(r);
      const patch = fundPatches.get(obs.fy);
      return patch ? applyPatch(obs, patch) : obs;
    });
    const earliestPpdYear = Math.min(...ppdObservations.map((o) => o.fy));
    const latestPpdYear = Math.max(...ppdObservations.map((o) => o.fy));

    // Patch rows for years after PPD coverage become new appended observations
    // (e.g. FY2025 rows sourced from the funds' own AVs before PPD catches up).
    const appendedObservations: YearObservation[] = [];
    fundPatches.forEach((patch, fy) => {
      if (fy > latestPpdYear) {
        appendedObservations.push(applyPatch(emptyObservation(fy), patch));
      }
    });

    // Pre-PPD CAFR-derived rows for this fund — only keep years strictly before PPD coverage
    const preObservations = historicalRows
      .filter((r) => r.fundId === fundId && r.observation.fy < earliestPpdYear)
      .map((r) => r.observation);

    const observations = [...preObservations, ...ppdObservations, ...appendedObservations]
      .sort((a, b) => a.fy - b.fy);
    const latestObservedFy = observations[observations.length - 1]?.fy ?? 0;

    // Load the fund's 2024 AV projection schedule. Drop any projection rows that
    // duplicate a year we already have observed data for (observations win).
    const projectionsPath = join(projectionsDir, `${fundId}.csv`);
    const projectionsBaseline = loadProjectionRows(projectionsPath)
      .filter((p) => p.fy > latestObservedFy);

    const timeSeries: FundTimeSeries = {
      metadata: FUND_METADATA[fundId],
      observations,
      projectionsBaseline: projectionsBaseline.length > 0 ? projectionsBaseline : undefined,
      fieldSources: {}, // TODO: populate in supplement step
      generatedAt: new Date().toISOString(),
      sourceSnapshot: `ppd-${snapshotDate}`,
    };

    const processedPath = join(processedDir, `${fundId}.json`);
    writeFileSync(processedPath, JSON.stringify(timeSeries, null, 2));

    // Also write to public/ so browser can fetch from /data/funds/*
    const publicPath = join(publicDir, `${fundId}.json`);
    writeFileSync(publicPath, JSON.stringify(timeSeries));

    const latest = observations[observations.length - 1];
    const fundedRatioStr =
      latest.fundedRatioMVA !== null
        ? `${(latest.fundedRatioMVA * 100).toFixed(1)}%`
        : 'n/a';
    const uaalStr =
      latest.uaalMVA !== null
        ? `$${(latest.uaalMVA / 1e9).toFixed(2)}B`
        : 'n/a';
    const projStr =
      projectionsBaseline.length > 0
        ? ` + ${projectionsBaseline.length} proj (${projectionsBaseline[0].fy}-${projectionsBaseline[projectionsBaseline.length - 1].fy})`
        : '';
    console.log(
      `  ${fundId.toUpperCase()}: ${observations.length} years (${observations[0].fy}-${latest.fy})${projStr}, ` +
        `FY${latest.fy} funded ${fundedRatioStr} (MVA), UAAL ${uaalStr}`,
    );
  }

  console.log(`\nWrote processed per-fund JSON to ${processedDir}`);
  console.log(`Copied to ${publicDir} for runtime serving.`);
}

main();
