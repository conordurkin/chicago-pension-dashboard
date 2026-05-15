import type { CSSProperties, ReactNode } from 'react';

interface ChartTooltipCardProps {
  children: ReactNode;
  maxWidth?: number;
}

/**
 * Shared shell for chart tooltips: white card with the standard slate
 * border, rounded corners, padding, and shadow. Internals are per-chart.
 */
export function ChartTooltipCard({ children, maxWidth }: ChartTooltipCardProps) {
  const style: CSSProperties = {
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: 'white',
    padding: '8px 10px',
    fontSize: 12,
    boxShadow: '0 4px 10px rgba(0,0,0,0.04)',
    ...(maxWidth !== undefined ? { maxWidth } : {}),
  };
  return <div style={style}>{children}</div>;
}
