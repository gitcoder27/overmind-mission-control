/**
 * SystemInfoCard — hostname, OS, kernel, uptime, architecture.
 */

import { cn } from '@/lib/utils';
import { Server } from 'lucide-react';
import type { SystemInfo } from '@/types/metrics';

interface SystemInfoCardProps {
  info: SystemInfo;
  className?: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function SystemInfoCard({ info, className }: SystemInfoCardProps) {
  const rows: { label: string; value: string }[] = [
    { label: 'Hostname', value: info.hostname },
    { label: 'Platform', value: info.platformVersion },
    { label: 'Kernel', value: info.kernelVersion },
    { label: 'Architecture', value: info.architecture },
    { label: 'Uptime', value: formatUptime(info.uptime) },
    { label: 'Python', value: info.pythonVersion },
  ];

  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Server className="h-4 w-4 text-purple" />
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">System</h4>
      </div>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-2">
            <dt className="text-[10px] font-medium text-text-muted uppercase tracking-wide shrink-0">
              {row.label}
            </dt>
            <dd className="text-[11px] font-mono text-text-secondary text-right break-all">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
