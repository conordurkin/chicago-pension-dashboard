/**
 * Core types for Chicago pension fund data.
 *
 * All dollar values are in USD (not thousands). All percentages are decimals (0.25 = 25%).
 * Fiscal year is the calendar year ending December 31.
 */

export type FundId = 'meabf' | 'labf' | 'pabf' | 'fabf' | 'aggregate';

export type FundSource = 'ppd' | 'cafr' | 'computed' | 'estimated' | 'aggregate';

export interface FundMetadata {
  id: FundId;
  ppdId: number | null; // null for aggregate
  shortName: string;
  fullName: string;
  sponsor: string;
  targetFundedRatio: number; // e.g. 0.90
  targetYear: number; // e.g. 2055 or 2058
  fiscalYearEnd: string; // MM-DD
  color: string; // hex
  description: string;
}

/**
 * One year's worth of data for a single fund.
 *
 * Nullable fields indicate either data is not available for that year
 * (e.g. GASB 67 fields pre-2014) or not reported by the fund that year.
 */
export interface YearObservation {
  fy: number;

  // --- Funding: liabilities ---
  /** Actuarial Accrued Liability (GASB 25 basis). All years. */
  aalGASB25: number | null;
  /** Total Pension Liability (GASB 67 basis). 2014+ only. */
  tplGASB67: number | null;
  /** Canonical AAL: TPL when available, else AAL GASB 25. */
  aal: number | null;

  // --- Funding: assets ---
  /** Market value of assets (net). */
  mva: number | null;
  /** Actuarial (smoothed) value of assets, GASB 25. */
  ava: number | null;
  /** Beginning-of-year MVA. */
  mvaBeginning: number | null;

  // --- Unfunded liability ---
  /** UAAL on GASB 25 basis (AVA). */
  uaalAVA: number | null;
  /** UAAL on market basis (AAL - MVA). */
  uaalMVA: number | null;
  /** Net Pension Liability (GASB 67, MVA basis). 2014+ only. */
  npl: number | null;

  // --- Funded ratios ---
  /** AVA / AAL — traditional GASB 25 funded ratio. */
  fundedRatioAVA: number | null;
  /** MVA / AAL (GASB 25 basis) — market funded ratio, consistent across all years. */
  fundedRatioMVA: number | null;
  /** NetPosition / TPL — GASB 67 funded ratio. 2014+ only. */
  fundedRatioGASB67: number | null;

  // --- Actuarial assumptions ---
  discountRate: number | null;
  inflationAssumption: number | null;
  uaalAmortPeriod: number | null;

  // --- Cashflow: contributions ---
  employerContribution: number | null;
  employerContribRegular: number | null;
  employerContribState: number | null;
  employeeContribution: number | null;
  totalContributions: number | null;

  // --- Cashflow: required contributions ---
  /** Actuarially Determined Employer Contribution. */
  adec: number | null;
  /** Statutory required contribution (pre-ADC era was legislated rate). */
  statutoryRequired: number | null;
  /** Percentage of required contribution actually paid. */
  percentRequiredPaid: number | null;
  /** ADEC minus actual employer contribution (positive = shortfall). */
  contribShortfall: number | null;

  // --- Cashflow: outflows ---
  /** Total benefits paid (positive number). */
  benefitPayments: number | null;
  /** Retirement benefits only. */
  retBenefits: number | null;
  /** COLA benefits. */
  colaBenefits: number | null;
  /** Member refunds. */
  refunds: number | null;
  /** Administrative expenses (positive number). */
  adminExpenses: number | null;
  /** Net cashflow = contributions - (benefits + admin). */
  netCashflow: number | null;

  // --- Investment performance ---
  /**
   * Total additions for the year: contributions PLUS net investment income.
   * (Inherited from PPD's `income_net`, which despite the name is total
   * additions across the whole series — kept under an honest name.)
   */
  totalAdditions: number | null;
  /** Net investment income (including fair value changes), net of fees. */
  netInvestmentIncome: number | null;
  /** Dividends + interest. */
  interestDividends: number | null;
  /** Change in fair value of investments. */
  fairValueChange: number | null;
  /** 1-year investment return (decimal). */
  return1yr: number | null;
  /** 5-year annualized return. */
  return5yr: number | null;
  /** 10-year annualized return. */
  return10yr: number | null;

  // --- Cost structure ---
  normalCostTotal: number | null;
  normalCostER: number | null;
  normalCostEE: number | null;
  normalCostRateTotal: number | null;
  normalCostRateER: number | null;
  uaalRate: number | null;
  payroll: number | null;
  projectedPayroll: number | null;

  // --- Membership ---
  actives: number | null;
  avgActiveSalary: number | null;
  avgActiveAge: number | null;
  avgActiveTenure: number | null;
  beneficiaries: number | null;
  avgBenefit: number | null;
  beneficiariesServiceRetirees: number | null;
  beneficiariesDisability: number | null;
  beneficiariesSurvivors: number | null;
  inactiveVested: number | null;
  totalMembership: number | null;
  /** Ratio of actives to beneficiaries (cash-stress indicator). */
  activesPerBeneficiary: number | null;

  // --- Asset allocation (decimal fractions) ---
  allocation: {
    equity: number | null;
    fixedIncome: number | null;
    realEstate: number | null;
    privateEquity: number | null;
    hedgeFunds: number | null;
    cash: number | null;
    other: number | null;
    altMisc: number | null;
  };

  // --- Derived cash-squeeze metric ---
  /** benefitPayments / mva — how fast benefits are drawing down assets. */
  burnRate: number | null;
}

export interface FundTimeSeries {
  metadata: FundMetadata;
  observations: YearObservation[];
  /** Future projections from CAFR (or computed baseline). */
  projectionsBaseline?: YearObservation[];
  /** Provenance: which source populated each field. */
  fieldSources: Partial<Record<keyof YearObservation, FundSource>>;
  /** Build metadata. */
  generatedAt: string;
  sourceSnapshot: string; // e.g. "ppd-20260410"
}

/**
 * Metadata about all four funds. Not a per-observation field, but referenced by other code.
 */
export const FUND_METADATA: Record<Exclude<FundId, 'aggregate'>, FundMetadata> = {
  meabf: {
    id: 'meabf',
    ppdId: 145,
    shortName: 'MEABF',
    fullName: 'Municipal Employees\u2019 Annuity and Benefit Fund of Chicago',
    sponsor: 'City of Chicago',
    targetFundedRatio: 0.9,
    targetYear: 2058,
    fiscalYearEnd: '12-31',
    color: '#6f42c1',
    description:
      'Covers non-uniformed municipal employees of the City of Chicago. The largest of the four city funds by membership.',
  },
  labf: {
    id: 'labf',
    ppdId: 215,
    shortName: 'LABF',
    fullName: 'Laborers\u2019 & Retirement Board Employees\u2019 Annuity and Benefit Fund of Chicago',
    sponsor: 'City of Chicago',
    targetFundedRatio: 0.9,
    targetYear: 2058,
    fiscalYearEnd: '12-31',
    color: '#2ca02c',
    description:
      'Covers City of Chicago laborers and other manual-labor employees. Was over 100% funded as recently as 2001.',
  },
  pabf: {
    id: 'pabf',
    ppdId: 146,
    shortName: 'PABF',
    fullName: 'Policemen\u2019s Annuity and Benefit Fund of Chicago',
    sponsor: 'City of Chicago',
    targetFundedRatio: 0.9,
    targetYear: 2055,
    fiscalYearEnd: '12-31',
    color: '#1f77b4',
    description:
      'Covers sworn officers of the Chicago Police Department. Below 30% funded for over a decade.',
  },
  fabf: {
    id: 'fabf',
    ppdId: 206,
    shortName: 'FABF',
    fullName: 'Firemen\u2019s Annuity and Benefit Fund of Chicago',
    sponsor: 'City of Chicago',
    targetFundedRatio: 0.9,
    targetYear: 2055,
    fiscalYearEnd: '12-31',
    color: '#d62728',
    description:
      'Covers sworn members of the Chicago Fire Department. The lowest-funded of the four city funds.',
  },
};

export const AGGREGATE_METADATA: FundMetadata = {
  id: 'aggregate',
  ppdId: null,
  shortName: 'All Funds',
  fullName: 'All Four Chicago City Pension Funds (Aggregate)',
  sponsor: 'City of Chicago',
  targetFundedRatio: 0.9,
  targetYear: 2058, // latest of the four target years
  fiscalYearEnd: '12-31',
  color: '#111827',
  description:
    'Aggregated view of MEABF + LABF + PABF + FABF. Liabilities, assets, contributions, and benefits summed across the four funds.',
};

export const ALL_FUND_IDS: Exclude<FundId, 'aggregate'>[] = ['meabf', 'labf', 'pabf', 'fabf'];
