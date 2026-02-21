import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  color?: 'accent' | 'info' | 'warn' | 'danger' | 'purple' | 'default';
  trend?: 'up' | 'down' | 'flat';
  subtitle?: string;
}

const colorMap: Record<string, string> = {
  accent: 'border-accent/20 [&_.kpi-icon]:text-accent [&_.kpi-icon]:bg-accent-dim',
  info: 'border-info/20 [&_.kpi-icon]:text-info [&_.kpi-icon]:bg-info-dim',
  warn: 'border-warn/20 [&_.kpi-icon]:text-warn [&_.kpi-icon]:bg-warn-dim',
  danger: 'border-danger/20 [&_.kpi-icon]:text-danger [&_.kpi-icon]:bg-danger-dim',
  purple: 'border-purple/20 [&_.kpi-icon]:text-purple [&_.kpi-icon]:bg-purple-dim',
  default: 'border-border [&_.kpi-icon]:text-text-secondary [&_.kpi-icon]:bg-surface-elevated',
};

export function KPICard({ label, value, icon, color = 'default', subtitle }: KPICardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-4 transition-colors hover:bg-surface-elevated',
        colorMap[color]
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-text-secondary">{subtitle}</p>}
        </div>
        <div className="kpi-icon flex h-9 w-9 items-center justify-center rounded-lg">
          {icon}
        </div>
      </div>
    </div>
  );
}
