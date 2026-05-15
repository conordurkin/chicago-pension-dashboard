import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { FundSelector } from '@/components/layout/FundSelector';
import { isValidFundId } from '@/lib/data/loadFund';
import { cn } from '@/lib/utils';
import {
  AGGREGATE_METADATA,
  FUND_METADATA,
  type FundId,
} from '@/types/pension';

const TABS = [
  { key: '', label: 'Overview' },
  { key: 'assets-liabilities', label: 'Assets & liabilities' },
  { key: 'cashflow', label: 'Cashflow' },
] as const;

interface LayoutProps {
  children: ReactNode;
  params: { fund: string };
}

export default function FundLayout({ children, params }: LayoutProps) {
  if (!isValidFundId(params.fund)) {
    notFound();
  }
  const fundId = params.fund as FundId;
  const meta =
    fundId === 'aggregate' ? AGGREGATE_METADATA : FUND_METADATA[fundId];

  return (
    <div>
      {/* Fund selector rail */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <FundSelector activeFund={fundId} />
        </div>
      </div>

      {/* Fund header */}
      <div className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {meta.shortName}
            </h1>
            <span className="text-sm text-slate-500">{meta.fullName}</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{meta.description}</p>
          <div className="mt-4 flex items-center gap-1 text-sm">
            {TABS.map((tab) => {
              const href = tab.key
                ? `/funds/${fundId}/${tab.key}`
                : `/funds/${fundId}`;
              return (
                <TabLink key={tab.key} href={href} label={tab.label} />
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}

/** Client-agnostic tab link. Active state is handled purely by href matching in CSS on hover. */
function TabLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm text-slate-600 transition hover:bg-white hover:text-slate-900',
      )}
    >
      {label}
    </Link>
  );
}
