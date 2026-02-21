/**
 * SystemHealthPage — live system metrics dashboard.
 *
 * Connects to /api/v1/ws/metrics via useMetricsSocket and renders
 * gauges, sparklines, per-core bars, network/disk I/O, processes,
 * temperatures, and system info in a responsive grid.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useMetricsSocket } from '@/lib/useMetricsSocket';
import { MetricGauge } from '@/components/system/MetricGauge';
import { SparklineChart } from '@/components/system/SparklineChart';
import { CpuCoreBar } from '@/components/system/CpuCoreBar';
import { ProcessTable } from '@/components/system/ProcessTable';
import { NetworkCard } from '@/components/system/NetworkCard';
import { DiskCard } from '@/components/system/DiskCard';
import { SystemInfoCard } from '@/components/system/SystemInfoCard';
import { TemperatureBar } from '@/components/system/TemperatureBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Activity } from 'lucide-react';

/* ── Helpers ──────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

/**
 * Compute rate (per second) between two consecutive absolute values
 * given the 2-second interval.
 */
function rate(curr: number, prev: number, intervalSec = 2): number {
  const delta = curr - prev;
  return delta > 0 ? delta / intervalSec : 0;
}

/* ── Page component ───────────────────────────────────────── */

export function SystemHealthPage() {
  const { current, history, connected } = useMetricsSocket();

  // Derive history arrays for sparklines
  const cpuHistory = useMemo(() => history.map((s) => s.cpu.percent), [history]);
  const memHistory = useMemo(() => history.map((s) => s.memory.percent), [history]);
  const diskHistory = useMemo(
    () => history.map((s) => (s.disk.partitions[0]?.percent ?? 0)),
    [history]
  );

  // Derive network send/recv rates from consecutive snapshots
  const netSendHistory = useMemo(() => {
    return history.map((s, i) => {
      if (i === 0) return 0;
      return rate(s.network.bytesSent, history[i - 1].network.bytesSent);
    });
  }, [history]);

  const netRecvHistory = useMemo(() => {
    return history.map((s, i) => {
      if (i === 0) return 0;
      return rate(s.network.bytesRecv, history[i - 1].network.bytesRecv);
    });
  }, [history]);

  // Current rates (latest delta)
  const prevSnap = history.length >= 2 ? history[history.length - 2] : null;

  const sendRate = current && prevSnap ? rate(current.network.bytesSent, prevSnap.network.bytesSent) : 0;
  const recvRate = current && prevSnap ? rate(current.network.bytesRecv, prevSnap.network.bytesRecv) : 0;
  const diskReadRate = current && prevSnap ? rate(current.disk.io.readBytes, prevSnap.disk.io.readBytes) : 0;
  const diskWriteRate = current && prevSnap ? rate(current.disk.io.writeBytes, prevSnap.disk.io.writeBytes) : 0;

  /* ── Loading state ──────────────────────────────────────── */
  if (!current) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold">System Health</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-warn-dim px-2.5 py-1 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-warn animate-pulse-dot" />
            <span className="font-medium text-warn">Connecting…</span>
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  /* ── Main dashboard ─────────────────────────────────────── */
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold">System Health</h2>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs',
            connected ? 'bg-accent-dim' : 'bg-danger-dim'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              connected ? 'bg-accent animate-pulse-dot' : 'bg-danger'
            )}
          />
          <span className={cn('font-medium', connected ? 'text-accent' : 'text-danger')}>
            {connected ? 'Live' : 'Disconnected'}
          </span>
        </span>
      </div>

      {/* Row 1: Gauges + System Info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 stagger-children">
        {/* CPU gauge */}
        <div className="rounded-xl border border-border bg-surface p-4 flex flex-col items-center gap-2">
          <MetricGauge label="CPU" value={current.cpu.percent} color="accent" />
          <SparklineChart data={cpuHistory} max={100} color="accent" className="w-full" />
          <div className="flex items-center gap-3 text-[10px] font-mono text-text-muted">
            <span>Load: {current.cpu.loadAvg.map((l) => l.toFixed(2)).join(' · ')}</span>
          </div>
        </div>

        {/* RAM gauge */}
        <div className="rounded-xl border border-border bg-surface p-4 flex flex-col items-center gap-2">
          <MetricGauge
            label="RAM"
            value={current.memory.percent}
            color="info"
            subtitle={`${formatBytes(current.memory.used)} / ${formatBytes(current.memory.total)}`}
          />
          <SparklineChart data={memHistory} max={100} color="info" className="w-full" />
          <div className="text-[10px] font-mono text-text-muted">
            Swap: {formatBytes(current.memory.swap.used)} / {formatBytes(current.memory.swap.total)} ({current.memory.swap.percent}%)
          </div>
        </div>

        {/* Disk gauge */}
        <div className="rounded-xl border border-border bg-surface p-4 flex flex-col items-center gap-2">
          <MetricGauge
            label="Disk"
            value={current.disk.partitions[0]?.percent ?? 0}
            color="warn"
            subtitle={
              current.disk.partitions[0]
                ? `${formatBytes(current.disk.partitions[0].used)} / ${formatBytes(current.disk.partitions[0].total)}`
                : undefined
            }
          />
          <SparklineChart data={diskHistory} max={100} color="warn" className="w-full" />
        </div>

        {/* System Info */}
        <SystemInfoCard info={current.system} />
      </div>

      {/* Row 2: CPU Cores + Memory Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 stagger-children">
        {/* CPU Cores */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            CPU Cores ({current.cpu.coreCount})
            {current.cpu.frequency && (
              <span className="ml-2 font-mono font-normal text-text-muted">
                {current.cpu.frequency.current.toFixed(0)} MHz
              </span>
            )}
          </h4>
          <div className="space-y-1.5">
            {current.cpu.perCore.map((pct, i) => (
              <CpuCoreBar key={i} coreIndex={i} percent={pct} />
            ))}
          </div>
        </div>

        {/* Memory Breakdown */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Memory Breakdown</h4>
          <div className="space-y-3">
            {/* Physical */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-text-muted uppercase">Physical</span>
                <span className="text-[10px] font-mono text-text-secondary">
                  {formatBytes(current.memory.used)} / {formatBytes(current.memory.total)}
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className="h-full rounded-full bg-info transition-all duration-700 ease-out"
                  style={{ width: `${current.memory.percent}%` }}
                />
              </div>
            </div>
            {/* Available */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-text-muted uppercase">Available</span>
                <span className="text-[10px] font-mono text-accent">{formatBytes(current.memory.available)}</span>
              </div>
            </div>
            {/* Swap */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-text-muted uppercase">Swap</span>
                <span className="text-[10px] font-mono text-text-secondary">
                  {formatBytes(current.memory.swap.used)} / {formatBytes(current.memory.swap.total)}
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700 ease-out',
                    current.memory.swap.percent > 80 ? 'bg-danger' : 'bg-purple'
                  )}
                  style={{ width: `${current.memory.swap.percent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Network + Disk I/O */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 stagger-children">
        <NetworkCard
          current={current.network}
          sendRate={sendRate}
          recvRate={recvRate}
          sendHistory={netSendHistory}
          recvHistory={netRecvHistory}
        />
        <DiskCard
          disk={current.disk}
          readRate={diskReadRate}
          writeRate={diskWriteRate}
        />
      </div>

      {/* Row 4: Process tables */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 stagger-children">
        <ProcessTable title="Top Processes — CPU" processes={current.processes.topCpu} />
        <ProcessTable title="Top Processes — Memory" processes={current.processes.topMemory} />
      </div>

      {/* Row 5: Process summary */}
      <div className="rounded-xl border border-border bg-surface p-4 stagger-children">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Process Summary</h4>
        <div className="flex flex-wrap gap-4 text-[11px] font-mono">
          <span className="text-text-muted">
            Total: <span className="text-text-primary font-semibold">{current.processes.total}</span>
          </span>
          <span className="text-text-muted">
            Running: <span className="text-accent font-semibold">{current.processes.running}</span>
          </span>
          <span className="text-text-muted">
            Sleeping: <span className="text-info font-semibold">{current.processes.sleeping}</span>
          </span>
          <span className="text-text-muted">
            Zombie: <span className={cn('font-semibold', current.processes.zombie > 0 ? 'text-danger' : 'text-text-secondary')}>{current.processes.zombie}</span>
          </span>
        </div>
      </div>

      {/* Row 6: Temperatures (conditional) */}
      {current.temperatures.length > 0 && (
        <TemperatureBar readings={current.temperatures} />
      )}
    </div>
  );
}
