/**
 * CpuCoreBar — horizontal bar per CPU core.
 */

import { cn } from '@/lib/utils';

interface CpuCoreBarProps {
  coreIndex: number;
  percent: number;
  className?: string;
}

function barColor(pct: number): string {
  if (pct >= 90) return 'bg-danger';
  if (pct >= 70) return 'bg-warn';
  return 'bg-accent';
}

export function CpuCoreBar({ coreIndex, percent, className }: CpuCoreBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="w-14 shrink-0 text-[10px] font-mono text-text-muted">
        Core {coreIndex}
      </span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[10px] font-mono text-text-secondary">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}
