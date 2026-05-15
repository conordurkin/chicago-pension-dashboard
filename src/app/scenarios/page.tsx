import { Suspense } from 'react';
import { loadAllFunds } from '@/lib/data/loadFund';
import { ScenariosClient } from './ScenariosClient';

export default function ScenariosPage() {
  const funds = loadAllFunds();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Scenario modeling
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Project any of the four funds (or the aggregate) forward under different return
          assumptions, contribution policies, and extra payments. Everything updates in real
          time as you move the sliders. Note that the model assumes we&rsquo;ll reach the
          target funded ratio by the target year no matter what - so the primary impact of
          any changes is to <em>annual contributions</em> rather than to anything else.
        </p>
      </header>
      <Suspense fallback={null}>
        <ScenariosClient funds={funds} />
      </Suspense>
    </div>
  );
}
