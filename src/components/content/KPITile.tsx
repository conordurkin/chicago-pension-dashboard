import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KPITileProps {
  label: string;
  value: string;
  /** Optional delta line shown below value, e.g. "+$1.2B YoY". */
  delta?: string;
  /** Positive/negative/neutral for coloring the delta. */
  deltaTone?: 'good' | 'bad' | 'neutral';
  /** Short hint shown beneath value. Accepts rich content (e.g. a link). */
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<KPITileProps['deltaTone']>, string> = {
  good: 'text-emerald-700 bg-emerald-50',
  bad: 'text-red-700 bg-red-50',
  neutral: 'text-slate-700 bg-slate-100',
};

export function KPITile({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  hint,
  className,
}: KPITileProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-5 shadow-sm',
        className,
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            'mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium',
            TONE_CLASSES[deltaTone],
          )}
        >
          {delta}
        </div>
      )}
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
