/**
 * NetworkCard — live network throughput (bytes/sec deltas).
 */

import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, Globe } from 'lucide-react';
import { SparklineChart } from './SparklineChart';
import type { NetworkMetrics } from '@/types/metrics';

interface NetworkCardProps {
  current: NetworkMetrics;
  sendRate: number; // bytes per second
  recvRate: number; // bytes per second
  sendHistory: number[];
  recvHistory: number[];
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function NetworkCard({
  current,
  sendRate,
  recvRate,
  sendHistory,
  recvHistory,
  className,
}: NetworkCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Globe className="h-4 w-4 text-info" />
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Network I/O</h4>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Upload */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUp className="h-3 w-3 text-accent" />
            <span className="text-[10px] font-medium text-text-muted uppercase">Upload</span>
          </div>
          <p className="text-sm font-mono font-semibold text-accent">{formatRate(sendRate)}</p>
          <p className="text-[10px] font-mono text-text-muted mt-0.5">
            Total: {formatBytes(current.bytesSent)}
          </p>
          <SparklineChart data={sendHistory} color="accent" height={24} className="mt-2 w-full" />
        </div>
        {/* Download */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDown className="h-3 w-3 text-info" />
            <span className="text-[10px] font-medium text-text-muted uppercase">Download</span>
          </div>
          <p className="text-sm font-mono font-semibold text-info">{formatRate(recvRate)}</p>
          <p className="text-[10px] font-mono text-text-muted mt-0.5">
            Total: {formatBytes(current.bytesRecv)}
          </p>
          <SparklineChart data={recvHistory} color="info" height={24} className="mt-2 w-full" />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Packets:</span>
          <span className="text-[10px] font-mono text-text-secondary">
            {current.packetsSent.toLocaleString()} sent
          </span>
          <span className="text-text-muted">/</span>
          <span className="text-[10px] font-mono text-text-secondary">
            {current.packetsRecv.toLocaleString()} recv
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Connections:</span>
          <span className="text-[10px] font-mono text-accent">{current.connections}</span>
        </div>
      </div>
    </div>
  );
}
