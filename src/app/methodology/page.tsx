export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Methodology</h1>
      <p className="mt-3 text-lg text-slate-600">
        How this dashboard is built, where the data comes from, and the assumptions behind
        the projections.
      </p>

      <div className="prose prose-slate mt-10 max-w-none">
        <h2>Scope</h2>
        <p>
          This dashboard covers the four pension funds sponsored by the City of Chicago:
        </p>
        <ul>
          <li>
            <strong>MEABF</strong> &mdash; Municipal Employees&rsquo; Annuity and Benefit
            Fund
          </li>
          <li>
            <strong>LABF</strong> &mdash; Laborers&rsquo; and Retirement Board Employees&rsquo;
            Annuity and Benefit Fund
          </li>
          <li>
            <strong>PABF</strong> &mdash; Policemen&rsquo;s Annuity and Benefit Fund
          </li>
          <li>
            <strong>FABF</strong> &mdash; Firemen&rsquo;s Annuity and Benefit Fund
          </li>
        </ul>
        <p>
          The Chicago Teachers&rsquo; Pension Fund (CTPF) is <em>not</em> included. It has a
          different sponsor (CPS), a different fiscal year, and a different statutory funding
          framework.
        </p>

        <h2>Primary data source</h2>
        <p>
          Historical data comes from the{' '}
          <a href="https://publicplansdata.org" target="_blank" rel="noreferrer">
            Public Plans Database
          </a>{' '}
          (PPD), a joint project of the Center for Retirement Research at Boston College, the
          MissionSquare Research Institute, the National Association of State Retirement
          Administrators, and the Government Finance Officers Association. PPD aggregates
          annual actuarial valuation and financial statement data for over 250 major U.S.
          public pension plans, with coverage back to 2001.
        </p>
        <p>
          The four Chicago city funds have PPD plan IDs 145 (MEABF), 215 (LABF), 146 (PABF),
          and 206 (FABF). The full dataset is pulled via the PPD API and stored as raw JSON
          in the project repository, then normalized into a typed schema.
        </p>

        <h2>Supplemental sources (pre-2001 and gap-filling)</h2>
        <p>
          PPD covers 2001 forward. To extend the series back to 1997 and to close a few
          remaining gaps within the PPD era, we transcribe numbers directly from each
          fund&rsquo;s own actuarial valuations and audited financial statements.
        </p>
        <ul>
          <li>
            <strong>Pre-2001 history (1997&ndash;2000):</strong> per-fund actuarial valuations
            (AVs) and the comparative multi-year schedules they contain (Tables 1&ndash;10 and
            Exhibits A&ndash;W), cross-referenced against the City of Chicago&rsquo;s annual
            Comprehensive Financial Reports (aggregated pension disclosures in Note 8).
          </li>
          <li>
            <strong>LABF FY 2001 and FY 2002:</strong> market value of assets, cashflow
            breakdown, and membership counts came from the LABF 2001 and 2002 AVs (Table 9
            &ldquo;Reconciliation of Asset Values&rdquo; and Exhibits M/N). PPD left these
            fields blank.
          </li>
          <li>
            <strong>LABF FY 2020:</strong> total benefit payments from the audited 2020
            financial statements; average benefit from the 2020 AV Exhibit N.
          </li>
          <li>
            <strong>PABF FY 2001&ndash;2002 discount rate:</strong> 8.0% (the fund&rsquo;s
            assumption held steady at 8.0% from 1999 through 2007 per adjacent AVs).
          </li>
        </ul>
        <p>
          Supplemental values are stored in{' '}
          <code>data/manual/historical-pre2001.csv</code> and{' '}
          <code>data/manual/ppd-patches.csv</code> with a source note on every row identifying
          the specific document and table the value came from. PPD remains authoritative where
          it reports a value; supplemental rows only fill genuine gaps.
        </p>

        <h2>Display window</h2>
        <p>
          The dashboard shows fiscal years <strong>1997 onwards</strong>. Earlier years exist
          in the underlying data but are truncated for display because pre-1997 coverage is
          patchy (aggregate-only cashflow, missing asset values for some funds) and would
          give a misleading impression of completeness.
        </p>

        <h2>Known data gaps</h2>
        <ul>
          <li>
            GASB 67 fields (<em>Net Position</em>, <em>Total Pension Liability</em>) are only
            available from FY 2014 onward, when GASB 67 took effect.
          </li>
          <li>
            Some fields (e.g. COLA benefits, disability retiree counts) are not reported
            consistently across all funds and years.
          </li>
        </ul>

        <h2 id="market-vs-actuarial">Market vs. actuarial basis</h2>
        <p>
          This dashboard <strong>anchors on market value</strong> of assets, with actuarial
          values shown as a secondary reference. The actuarial (smoothed) value intentionally
          spreads investment gains and losses over several years to stabilize the contribution
          schedule. That smoothing is appropriate for funding policy decisions, but it hides
          the fund&rsquo;s real economic position. Market value is closer to the truth.
        </p>
        <p>
          The market-basis funded ratio here is computed as:
        </p>
        <pre>fundedRatioMVA = marketValueOfAssets / actuarialAccruedLiability</pre>
        <p>
          using the GASB 25 AAL (since TPL is not available pre-2014). This gives a
          consistent ratio definition across the full time series.
        </p>
        <p>
          In practice you will see <strong>three</strong> funded ratios quoted for the same
          year, and for FY2025 they land close together but are not interchangeable:
        </p>
        <ul>
          <li>
            <strong>Market basis (what this dashboard leads with)</strong> &mdash; market
            assets over accrued liability: 28.2% for FY2025. After a strong market year,
            this is the most flattering of the three.
          </li>
          <li>
            <strong>Actuarial (smoothed) basis</strong> &mdash; what the funds&rsquo; own
            valuations lead with, using smoothed assets: about 27.5% in aggregate for FY2025
            (fund by fund: MEABF 27.4%, LABF 43.5%, PABF 26.1%, FABF 24.7%). Because
            smoothing is still recognizing 2022&rsquo;s losses and deferring part of
            2023&ndash;2025&rsquo;s gains, it currently sits below market.
          </li>
          <li>
            <strong>GASB reporting basis</strong> &mdash; what the city&rsquo;s ACFR reports
            (and what press coverage usually quotes): market assets over the GASB Total
            Pension Liability, about 28.1% in aggregate for FY2025. It differs from our
            market-basis ratio only in the liability denominator, which for two funds is
            discounted at a slightly blended rate.
          </li>
        </ul>
        <p>
          None of these is &ldquo;wrong&rdquo; &mdash; they answer different questions. But
          when a headline says the funds &ldquo;improved to 28%,&rdquo; it is describing a
          market-value measure that moves with every market swing, not the smoothed measure
          the funding schedule actually responds to.
        </p>

        <h2>Actuary baseline projections</h2>
        <p>
          Alongside the scenario engine, the dashboard overlays each fund actuary&rsquo;s
          own forward projection from the 2025 actuarial valuation. These are the
          fund&rsquo;s &ldquo;if we follow the statutory funding schedule and all assumptions
          are met&rdquo; glide path to 90% funded by 2055 (Police/Fire) or 2058
          (Municipal/Laborers) per P.A. 100-0023.
        </p>
        <ul>
          <li>
            <strong>LABF</strong> &mdash; 2025 AV Table 4, 50-Year Projections (2025&ndash;2074). GRS.
          </li>
          <li>
            <strong>MEABF</strong> &mdash; 2025 AV Exhibit 8, 50-Year Projection (2025&ndash;2075). Segal.
          </li>
          <li>
            <strong>PABF</strong> &mdash; 2025 AV Table 3A, 31-Year Projection (2025&ndash;2055) at a 6.75%
            discount rate. GRS.
          </li>
          <li>
            <strong>FABF</strong> &mdash; 2025 AV Exhibit 9, 37-Year Projection (2025&ndash;2062). Segal.
          </li>
        </ul>
        <p>
          The aggregate (all four combined) baseline sums the four fund projections through
          2058, the last statutory target year. PABF&apos;s published schedule ends at its
          2055 target, so its final three aggregate years (2056&ndash;2058, when PABF is
          simply maintaining 90% funded) are extrapolated using the same validated method
          the scenario engine uses to extend baselines; without them the aggregate would
          silently drop the 2056&ndash;2058 tail of the Municipal and Laborers&apos; ramp
          and never show the combined system reaching its target. Transcribed values are stored in{' '}
          <code>data/manual/projections/{'{'}fundId{'}'}.csv</code> (dollar values in thousands
          to match the AV format).
        </p>

        <h2>Projection engine</h2>
        <p>
          Separate from the actuary baselines, the scenario engine is a simplified actuarial
          roll-forward that users drive with sliders. Starting from the latest observed
          year, each subsequent year applies the standard pension recurrence:
        </p>
        <pre>{`AAL[t]  = AAL[t-1] * (1 + discountRate) + normalCost - benefits
MVA[t]  = MVA[t-1] * (1 + actualReturn) + contribs - benefits
UAAL[t] = AAL[t] - MVA[t]`}</pre>
        <p>
          The employer contribution each year is:
        </p>
        <pre>employerContribution = normalCost_ER + amortPayment(UAAL, yearsRemainingToTarget)</pre>
        <p>
          The amortization payment uses either level-dollar or level-percent-of-pay schedules,
          based on the policy setting. Payroll and benefit payments are grown at stylized
          default rates (3% each). These defaults are rough &mdash; real actuarial projections
          use detailed assumptions about retirement ages, mortality, termination rates, tier
          mix, and more.
        </p>

        <h2>Re-pricing liabilities at non-baseline discount rates</h2>
        <p>
          When the user moves the &ldquo;assumed return&rdquo; slider on the Scenarios page
          away from the fund&rsquo;s baseline rate, the projection&rsquo;s starting AAL and
          normal cost are re-priced before the year-by-year roll-forward begins. Otherwise the
          engine would inconsistently roll a baseline-discounted starting AAL forward at a
          different rate, understating the impact of the change.
        </p>
        <p>
          The re-pricing uses the GASB 67/68 sensitivity disclosure that each fund publishes
          alongside its annual actuarial valuation. GASB requires plans to report Net Pension
          Liability at the baseline discount rate as well as 1pp above and 1pp below. Adding
          back the (rate-invariant) Plan Fiduciary Net Position gives Total Pension Liability
          at three anchor points; the engine linearly interpolates between adjacent anchors
          for any rate within the disclosed range.
        </p>
        <p>
          This is why the assumed-return slider is bounded at &plusmn;1pp around each
          fund&rsquo;s baseline. We don&rsquo;t extrapolate beyond what the funds have
          actually disclosed. The four FY2025 baselines are:
        </p>
        <ul>
          <li>
            <strong>FABF</strong> &mdash; 6.75% (the long-term investment return assumption;
            assets are not projected to deplete, so no blending is required).
          </li>
          <li>
            <strong>MEABF</strong> &mdash; 6.75% (as of FY2025 assets are no longer projected
            to deplete under the statutory schedule, so the single equivalent rate equals the
            long-term return assumption; in FY2024 it was a blended 6.62%).
          </li>
          <li>
            <strong>LABF</strong> &mdash; 6.70% (blended single equivalent rate).
          </li>
          <li>
            <strong>PABF</strong> &mdash; 6.65% (blended single equivalent rate).
          </li>
        </ul>
        <p>
          For the aggregate view, the four anchor sets are summed and the baseline rate is the
          TPL-weighted average of the four fund baselines. Because the four baselines all
          cluster within 10 bps of each other, treating the aggregate as a single fund with
          one baseline is a close approximation.
        </p>
        <p>
          GASB does not require disclosure of normal-cost sensitivity to the discount rate,
          and the funds&rsquo; FY2025 reports do not provide it. The engine approximates NC
          sensitivity by scaling NC by the same percentage change as TPL. This understates
          the true effect (NC has longer duration than TPL because new accruals pay out
          further into the future), but the dominant scenario impact comes from re-pricing
          the AAL/UAAL anyway.
        </p>

        <h2>What the projections don&rsquo;t model</h2>
        <p>
          This is a scenario exploration tool, not a replacement for a full actuarial
          valuation. It does not capture:
        </p>
        <ul>
          <li>Cohort-level dynamics (Tier 1 vs Tier 2 differences)</li>
          <li>Specific mortality table updates</li>
          <li>Discount rate changes mid-projection</li>
          <li>Benefit enhancements or cuts from future legislation</li>
          <li>Asset allocation shifts and their correlation with returns</li>
        </ul>
        <p>
          For authoritative projections, see each fund&rsquo;s annual actuarial valuation.
        </p>

        <h2>Source code</h2>
        <p>
          This dashboard is open source. The data pipeline, projection engine, and UI are all
          in a public repository. Issues and PRs welcome.
        </p>
      </div>
    </div>
  );
}
