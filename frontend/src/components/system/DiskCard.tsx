/**
 * DiskCard — disk partitions + I/O rates.
 */

import { cn } from '@/lib/utils';
import { HardDrive } from 'lucide-react';
import type { DiskMetrics } from '@/types/metrics';

interface DiskCardProps {
  disk: DiskMetrics;
  readRate: number;
  writeRate: number;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function DiskCard({ disk, readRate, writeRate, className }: DiskCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <HardDrive className="h-4 w-4 text-warn" />
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Disk I/O</h4>
      </div>

      {/* I/O rates */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-[10px] font-medium text-text-muted uppercase block mb-1">Read</span>
          <p className="text-sm font-mono font-semibold text-accent">{formatRate(readRate)}</p>
        </div>
        <div>
          <span className="text-[10px] font-medium text-text-muted uppercase block mb-1">Write</span>
          <p className="text-sm font-mono font-semibold text-warn">{formatRate(writeRate)}</p>
        </div>
      </div>

      {/* Partitions */}
      <div className="space-y-3 pt-3 border-t border-border/50">
        {disk.partitions.map((p) => (
          <div key={p.mountpoint}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-text-secondary truncate max-w-[60%]">
                {p.device} → {p.mountpoint}
              </span>
              <span className="text-[10px] font-mono text-text-muted">{p.fstype}</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-surface-elevated">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700 ease-out',
                  p.percent >= 90 ? 'bg-danger' : p.percent >= 75 ? 'bg-warn' : 'bg-accent'
                )}
                style={{ width: `${p.percent}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] font-mono text-text-muted">
                {formatBytes(p.used)} / {formatBytes(p.total)}
              </span>
              <span className="text-[10px] font-mono text-text-secondary">{p.percent}%</span>
            </div>
          </div>
        ))}
        {disk.partitions.length === 0 && (
          <p className="text-[10px] text-text-muted">No partition data</p>
        )}
      </div>
    </div>
  );
}
