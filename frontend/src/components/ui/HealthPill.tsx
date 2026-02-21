import { cn } from '@/lib/utils';

interface HealthPillProps {
  status: 'healthy' | 'degraded' | 'unhealthy';
  label?: string;
}

const pillStyles: Record<string, string> = {
  healthy: 'bg-accent-dim text-accent border-accent/20',
  degraded: 'bg-warn-dim text-warn border-warn/20',
  unhealthy: 'bg-danger-dim text-danger border-danger/20',
};

const dotStyles: Record<string, string> = {
  healthy: 'bg-accent',
  degraded: 'bg-warn',
  unhealthy: 'bg-danger',
};

export function HealthPill({ status, label }: HealthPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        pillStyles[status]
      )}
    >
      <span className={cn('h-2 w-2 rounded-full animate-pulse-dot', dotStyles[status])} />
      {label || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
