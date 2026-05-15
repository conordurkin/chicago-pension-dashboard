import { notFound } from 'next/navigation';
import { ChartContainer } from '@/components/content/ChartContainer';
import { CashflowChart } from '@/components/charts/CashflowChart';
import { isValidFundId, loadFund } from '@/lib/data/loadFund';
import { formatBillions, formatPercent } from '@/lib/format';
import { type FundId } from '@/types/pension';

interface PageProps {
  params: { fund: string };
}

export default function CashflowPage({ params }: PageProps) {
  if (!isValidFundId(params.fund)) notFound();
  const fundId = params.fund as FundId;
  const ts = loadFund(fundId);
  const latest = ts.observations[ts.observations.length - 1];

  return (
    <div className="space-y-8">
      <ChartContainer
        title="Annual cashflow"
        subtitle="Contributions in, benefits out, and the resulting net flow"
        explainer="Bars above zero are money coming in from employers and employees. Bars below zero are benefits paid to retirees. The black line is net cashflow. When the net line is negative, the fund relies on investment returns (or principal) to cover benefits."
        source="Public Plans Database"
      >
        <CashflowChart observations={ts.observations} />
      </ChartContainer>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-semibold tracking-tight text-slate-900">
          Contribution detail
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm tabular-nums">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-200 text-left">
                <th className="py-2 pr-4 font-medium">FY</th>
                <th className="py-2 pr-4 text-right font-medium">Employer</th>
                <th className="py-2 pr-4 text-right font-medium">Employee</th>
                <th className="py-2 pr-4 text-right font-medium">Benefits</th>
                <th className="py-2 pr-4 text-right font-medium">Net flow</th>
                <th className="py-2 pr-4 text-right font-medium">ADEC paid</th>
              </tr>
            </thead>
            <tbody>
              {[...ts.observations].reverse().map((o) => (
                <tr key={o.fy} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-700">{o.fy}</td>
                  <td className="py-2 pr-4 text-right">
                    {formatBillions(o.employerContribution)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatBillions(o.employeeContribution)}
                  </td>
                  <td className="py-2 pr-4 text-right text-red-600">
                    {formatBillions(o.benefitPayments)}
                  </td>
                  <td className="py-2 pr-4 text-right">{formatBillions(o.netCashflow)}</td>
                  <td className="py-2 pr-4 text-right">
                    {formatPercent(o.percentRequiredPaid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          &ldquo;ADEC paid&rdquo; is the share of the actuarially determined employer
          contribution that was actually paid. Chicago first paid 100% in FY 2022.{' '}
          FY{latest.fy} employer contribution: {formatBillions(latest.employerContribution)}.
        </p>
      </section>
    </div>
  );
}

export function generateStaticParams() {
  return [
    { fund: 'aggregate' },
    { fund: 'meabf' },
    { fund: 'labf' },
    { fund: 'pabf' },
    { fund: 'fabf' },
  ];
}
