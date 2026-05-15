import Link from 'next/link';
import { cn } from '@/lib/utils';
import { AGGREGATE_METADATA, FUND_METADATA, type FundId } from '@/types/pension';

const OPTIONS: { id: FundId; label: string; color: string }[] = [
  { id: 'aggregate', label: 'All Four', color: AGGREGATE_METADATA.color },
  { id: 'meabf', label: 'Municipal', color: FUND_METADATA.meabf.color },
  { id: 'labf', label: 'Laborers', color: FUND_METADATA.labf.color },
  { id: 'pabf', label: 'Police', color: FUND_METADATA.pabf.color },
  { id: 'fabf', label: 'Fire', color: FUND_METADATA.fabf.color },
];

interface FundSelectorProps {
  activeFund: FundId;
  /** Builds the URL for a given fund id. Defaults to /funds/{id}. */
  hrefFor?: (id: FundId) => string;
}

export function FundSelector({ activeFund, hrefFor }: FundSelectorProps) {
  const buildHref = hrefFor ?? ((id: FundId) => `/funds/${id}`);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {OPTIONS.map((opt) => {
        const active = opt.id === activeFund;
        return (
          <Link
            key={opt.id}
            href={buildHref(opt.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
              active
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: opt.color }}
            />
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
