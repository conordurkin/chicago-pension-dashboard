export type AnnotationCategory =
  | 'reform'
  | 'legal'
  | 'economic'
  | 'benefit'
  | 'funding'
  | 'context';

export interface HistoryAnnotation {
  fy: number;
  title: string;
  summary: string;
  category: AnnotationCategory;
}

export const CATEGORY_LABEL: Record<AnnotationCategory, string> = {
  reform: 'Reform attempt',
  legal: 'Court ruling',
  economic: 'Economic event',
  benefit: 'Benefit change',
  funding: 'Funding policy',
  context: 'Civic context',
};

export const CATEGORY_COLOR: Record<AnnotationCategory, string> = {
  reform: '#7c3aed',
  legal: '#be123c',
  economic: '#1d4ed8',
  benefit: '#047857',
  funding: '#b45309',
  context: '#64748b',
};

export const HISTORY_ANNOTATIONS: HistoryAnnotation[] = [
  {
    fy: 2002,
    title: 'LABF falls into deficit',
    summary:
      'The Laborers\' fund, which as recently as FY1997 had been 135% funded, drops below fully funded for the first time after the dot-com crash. It would never return to surplus. This marks the year all four city pension funds were officially underfunded.',
    category: 'funding',
  },
  {
    fy: 2003,
    title: 'Illinois issues $10B pension obligation bond',
    summary:
      'The state borrows $10 billion to pay down state-level pension debt. A sign of the era\'s go-to playbook: deferring pension costs via financial engineering rather than cash contributions. Chicago didn\'t participate directly, but the political logic was in the air.',
    category: 'context',
  },
  {
    fy: 2008,
    title: 'Global Financial Crisis',
    summary:
      'Equity markets fall roughly 40%. The four funds lose a combined $3B+ in market value in a single year, accelerating the decline already underway from chronic underfunding.',
    category: 'economic',
  },
  {
    fy: 2008,
    title: 'Daley leases the parking meters',
    summary:
      'The city signs a 75-year lease of parking meter revenue for $1.15B upfront. The money goes to plugging operating budget holes, and within a few years it is essentially gone - the defining example of Chicago trading long-term assets for short-term cash, a habit that also shows up in pension funding.',
    category: 'context',
  },
  {
    fy: 2010,
    title: 'Tier 2 created (PA 96-0889)',
    summary:
      'New hires from 2011 forward get significantly reduced benefits: higher retirement age, lower COLA, capped pensionable salary. Existing workers and retirees are untouched, protected by the Illinois Constitution. The savings take decades to materialize.',
    category: 'benefit',
  },
  {
    fy: 2010,
    title: 'PA 96-1495 sets up the Police and Fire ramp',
    summary:
      'Quinn signs the first law tying Chicago\'s Police and Fire contributions to actuarial reality - 90% funded by 2040 - but defers the kickoff to FY2015. Even with the multiples-of-payroll formula visibly broken, the legislature buys five more years of business-as-usual before the new schedule starts.',
    category: 'funding',
  },
  {
    fy: 2013,
    title: 'Illinois passes state pension reform (PA 98-0599)',
    summary:
      'Quinn signs sweeping state-level pension reform: reduced COLAs, capped pensionable salary, raised retirement ages for TRS, SERS, SURS, JRS, and GARS. It doesn\'t directly cover Chicago\'s four city funds, but if upheld it would have established that Illinois could legally trim accrued benefits - the constitutional escape hatch the city was counting on.',
    category: 'reform',
  },
  {
    fy: 2014,
    title: 'Emanuel passes city pension reform (PA 98-0641)',
    summary:
      'Aimed at the two most distressed funds: MEABF and LABF get higher employee contributions, reduced COLAs, and a city contribution schedule targeting 90% funded by 2055. Modeled on the state reform from the year before, riding on the same constitutional bet.',
    category: 'reform',
  },
  {
    fy: 2015,
    title: 'Illinois Supreme Court strikes down state pension reform',
    summary:
      'In In re Pension Reform Litigation (Heaton v. Quinn), the court rules that the 2013 state pension reform violates the Illinois Constitution\'s pension-protection clause. The decision makes clear that previously-promised benefits cannot be reduced, no matter how underfunded the system becomes.',
    category: 'legal',
  },
  {
    fy: 2015,
    title: 'Police and Fire ramp begins (PA 96-1495)',
    summary:
      'For the first time, Chicago\'s contributions to Police and Fire are tied to what the funds actually owe. The original law targeted 90% funded by 2040 - the FY2015 jump nearly doubles the city\'s Police/Fire contribution.',
    category: 'funding',
  },
  {
    fy: 2016,
    title: 'Jones v. MEABF strikes down city pension reform',
    summary:
      'The Illinois Supreme Court applies the same constitutional logic to strike down Mayor Emanuel\'s 2014 reform of MEABF and LABF. The pension-protection clause is settled law: Chicago cannot reduce benefits for current workers or retirees.',
    category: 'legal',
  },
  {
    fy: 2016,
    title: 'PA 99-0506 softens the Police/Fire ramp',
    summary:
      'The 2015 cliff is replaced with a 5-year phase-in (FY2016-FY2020), and the 90% funded target is pushed from 2040 to 2055. Contributions rise more gradually but over a longer horizon.',
    category: 'funding',
  },
  {
    fy: 2017,
    title: 'PA 100-0023 creates the Municipal/Laborers ramp',
    summary:
      'MEABF and LABF finally get a funding schedule tied to actuarial reality, with a 5-year phase-in (FY2017-FY2022) to reach 90% funded by 2058. Before this, their contributions had been set by statute as multiples of employee contributions - with no connection to what was actually needed.',
    category: 'funding',
  },
  {
    fy: 2020,
    title: 'Lightfoot begins supplemental pension payments',
    summary:
      'The city starts paying more than the statutory minimum, topping up contributions by hundreds of millions of dollars per year. A policy choice, not a legal requirement - and one that could be reversed by a future administration.',
    category: 'funding',
  },
  {
    fy: 2022,
    title: 'First year of full statutory contribution',
    summary:
      'All four funds simultaneously reach their full actuarially-grounded statutory contribution for the first time. After decades of paying less than needed, Chicago is now funding its pensions at the level the law requires to hit 90% by 2055/2058.',
    category: 'funding',
  },
  {
    fy: 2023,
    title: 'Bally\'s Chicago casino approved',
    summary:
      'Casino revenue is earmarked to help fund the Police and Fire pensions. A useful supplement once operations ramp up, but small relative to the scale of the obligation - projected at roughly $200M/year versus multi-billion annual contributions.',
    category: 'context',
  },
  {
    fy: 2025,
    title: 'PA 104-0065 sweetens Tier 2 police/fire benefits',
    summary:
      'Springfield raises the Tier 2 pensionable salary cap for police and fire and grows it at the lesser of 3% or full CPI going forward (previously half of CPI), and enhances certain widow annuities. The change adds roughly $300M to the two funds\' reported liabilities in its first year - a reminder that benefit rules can still move in only one direction under the Illinois Constitution.',
    category: 'benefit',
  },
];
