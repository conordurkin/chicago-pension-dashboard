import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Short plain-English paragraph explaining what the chart shows. */
  explainer?: string;
  /** Source citation line, e.g. "Public Plans Database". */
  source?: string;
  className?: string;
}

export function ChartContainer({
  title,
  subtitle,
  children,
  explainer,
  source,
  className,
}: ChartContainerProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-5 shadow-sm',
        className,
      )}
    >
      <header className="mb-4">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </header>
      <div className="relative">{children}</div>
      {explainer && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">
          {explainer}
        </p>
      )}
      {source && (
        <p className="mt-2 text-xs text-slate-400">Source: {source}</p>
      )}
    </section>
  );
}
