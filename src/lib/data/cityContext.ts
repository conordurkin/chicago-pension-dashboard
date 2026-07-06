/**
 * City of Chicago demographic and fiscal context constants.
 *
 * These values anchor the Burden / Impact page — translating pension
 * dollars into household, resident, and budget-share terms.
 *
 * All figures sourced from public documents and current as of the most
 * recent available reporting year (typically FY2024 actuals or 2024 ACS
 * estimates). When updating, also update `cityContext.sources`.
 */

export interface CityFiscalSnapshot {
  fy: number;
  /** Total city appropriations across all funds (corporate, enterprise, special). */
  totalAppropriations: number;
  /** Corporate Fund total — the city's most discretionary pool. */
  corporateFund: number;
  /** All employer pension contributions to the four funds, all sources combined. */
  pensionContribution: number;
  /** Property tax dollars dedicated to the four city pension funds (the pension portion of the city's property tax levy). */
  pensionPropertyTaxLevy: number;
  /** Corporate Fund transfer to pensions (general-revenue portion). */
  pensionFromCorporateFund: number;
  /** Total city of Chicago property tax levy (city portion only — excludes CPS, Cook County, etc.). */
  cityPropertyTaxLevyTotal?: number;
  /** Long-term debt service portion of the city's property tax levy. */
  cityPropertyTaxDebtService?: number;
  /** Chicago Public Library portion of the city's property tax levy (operations + library employee pensions). */
  cityPropertyTaxLibrary?: number;
}

export interface DepartmentBudget {
  name: string;
  fy2024: number;
}

/**
 * Chicago demographics (2024 American Community Survey 1-year estimates).
 */
export const CHICAGO_DEMOGRAPHICS = {
  population: 2_710_000,
  households: 1_160_000,
  medianHomeValue: 334_100,
  homeownershipRate: 0.46,
  /** Census-counted owner-occupied housing units. Used for tax-bill examples. */
  ownerOccupiedHouseholds: Math.round(1_160_000 * 0.46),
};

/**
 * City fiscal snapshots — historical anchor years where we have both the
 * total budget and pension breakdown.
 *
 * FY2019 baseline comes from the Civic Federation budget-growth analysis;
 * FY2024 is the current ACFR / budget book. Years between are interpolated
 * lightly for chart continuity but only the anchor years should be cited.
 */
export const CITY_FISCAL_HISTORY: CityFiscalSnapshot[] = [
  {
    // FY2010 figures from Civic Federation, "City of Chicago FY2010 Budget
    // Analysis" p29 (gross Total Resources of $6.526B, Corporate Fund of
    // $3.213B, and Pension Funds appropriation of $458.9M). FY2010 was
    // pre-ADC: pension funding came almost entirely through the property
    // tax levy, with no meaningful Corporate Fund transfer.
    fy: 2010,
    totalAppropriations: 6_525_600_000,
    corporateFund: 3_213_200_000,
    pensionContribution: 458_900_000,
    pensionPropertyTaxLevy: 458_900_000,
    pensionFromCorporateFund: 0,
  },
  {
    fy: 2019,
    totalAppropriations: 8_900_000_000,
    corporateFund: 4_400_000_000,
    pensionContribution: 1_400_000_000,
    pensionPropertyTaxLevy: 860_000_000,
    pensionFromCorporateFund: 350_000_000,
  },
  {
    fy: 2024,
    totalAppropriations: 16_650_000_000,
    corporateFund: 5_700_000_000,
    pensionContribution: 2_749_731_210,
    // FY2024 property tax levy allocation, per City of Chicago FY2024 Budget
    // Overview p47. Total base levy of $1.8B splits as: pensions $1.4B (79.2%),
    // long-term debt $239.7M (13.5%), library $130.8M (7.4%). Within pensions:
    // PABF 45.9%, FABF 20.7%, MEABF 9.4%, LABF 3.2%.
    pensionPropertyTaxLevy: 1_400_000_000,
    cityPropertyTaxDebtService: 239_700_000,
    cityPropertyTaxLibrary: 130_800_000,
    // Sum of the three allocated components. The City's published headline
    // figure is $1.8B (gross base levy), but ~$30M is collection-loss
    // provision; allocations sum to $1.77B and that's what produces the
    // pie-chart percentages in the budget book.
    cityPropertyTaxLevyTotal: 1_770_500_000,
    pensionFromCorporateFund: 801_000_000,
  },
  {
    fy: 2025,
    // FY2025 enacted figures from the City of Chicago FY2026 Budget Overview
    // (Summary of Proposed Budget - All Funds, 2025 Budget column: net grand
    // total $17,102.4M, Corporate Fund $5,788.0M) and its Budget Detail levy
    // tables (2025 appropriation column). The FY2025 budget passed with no
    // increase to the base levy; the debt-service portion stepped up.
    totalAppropriations: 17_102_400_000,
    corporateFund: 5_788_000_000,
    // Actual employer contributions paid to the four funds in FY2025, per the
    // funds' 12/31/2025 reports / FY2025 city ACFR (incl. $272M supplemental).
    pensionContribution: 2_852_778_219,
    // Levy split follows the budget-book pie convention: pensions = MEABF
    // $167.9M + LABF $54.7M + PABF $813.5M + FABF $367.0M; library = library
    // levy $122.0M + MEABF library-employee levy $8.8M; debt = GO bond
    // redemption levy $272.9M.
    pensionPropertyTaxLevy: 1_403_100_000,
    cityPropertyTaxDebtService: 272_900_000,
    cityPropertyTaxLibrary: 130_800_000,
    cityPropertyTaxLevyTotal: 1_806_800_000,
    // Corporate Fund payments + Corporate Fund supplemental pension
    // allocations across the four funds (FY2026 Budget Overview, Budget
    // Detail pension-fund tables).
    pensionFromCorporateFund: 943_400_000,
  },
];

/**
 * FY2024 city department appropriations — used for "what else this could buy"
 * civic comparators on the Burden page.
 *
 * Sources: Chicago FY2024 Budget Recommendations, BGA Policy budget snapshots,
 * Civic Federation analyses.
 */
export const FY2024_DEPARTMENT_BUDGETS: DepartmentBudget[] = [
  { name: 'Police (CPD)', fy2024: 1_990_000_000 },
  { name: 'Fire (CFD)', fy2024: 783_900_000 },
  { name: 'Streets & Sanitation', fy2024: 350_200_000 },
  { name: 'Public Library', fy2024: 267_000_000 },
];

/**
 * Civic comparators for the "what else this could buy" callout. Each entry
 * is something tangible that one billion dollars roughly funds, in 2024 dollars.
 *
 * These are illustrative — order of magnitude, not exact unit costs.
 */
export const CIVIC_COMPARATORS = [
  {
    label: 'years of full Chicago Public Library operations',
    perBillion: 1_000_000_000 / 145_000_000,
    note: 'CPL operating budget is ~$145M/year.',
  },
  {
    label: 'years of running the Streets & Sanitation department',
    perBillion: 1_000_000_000 / 350_000_000,
    note: 'DSS appropriation is ~$350M/year.',
  },
  {
    label: 'years of full Chicago Fire Department operations',
    perBillion: 1_000_000_000 / 784_000_000,
    note: 'CFD budget is ~$784M/year.',
  },
];

export const CITY_CONTEXT_SOURCES = {
  demographics: 'U.S. Census Bureau, 2024 American Community Survey 1-year estimates.',
  fiscalHistory:
    'Chicago Office of Financial Analysis ACFR (FY2024) and Civic Federation budget analyses (FY2019, FY2024).',
  departments:
    'BGA Policy budget snapshots and Chicago FY2024 Budget Recommendations document.',
};
