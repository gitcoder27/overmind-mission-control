import { useSystemHealth, useSnapshot } from '@/queries/useSnapshot';
import { ErrorState } from '@/components/ui/ErrorState';
import { HealthPill } from '@/components/ui/HealthPill';
import { Skeleton } from '@/components/ui/Skeleton';
import { JsonInspector } from '@/components/ui/JsonInspector';
import { OrchestratorControls } from '@/components/OrchestratorControls';
import { useUiStore } from '@/stores/uiStore';
import { useDataProvider } from '@/providers/data';
import { cn } from '@/lib/utils';
import { Server, Database, Wifi, Cpu } from 'lucide-react';

const componentIcons: Record<string, typeof Server> = {
  'API Server': Server,
  'SQLite Database': Database,
  'OpenClaw Gateway': Wifi,
  'Orchestrator': Cpu,
};

export function SystemPage() {
  const { data: health, isLoading: healthLoading, error: healthError, refetch } = useSystemHealth();
  const { data: snapshot } = useSnapshot();
  const connectionStatus = useUiStore((s) => s.connectionStatus);
  const provider = useDataProvider();

  if (healthLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold">System Health</h2>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (healthError) {
    return <ErrorState message={healthError.message} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-info" />
          <h2 className="text-lg font-bold">System Health</h2>
        </div>
        {health && <HealthPill status={health.overall} />}
      </div>

      {/* Health components */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(health?.components || []).map((comp) => {
          const Icon = componentIcons[comp.name] || Server;
          return (
            <div key={comp.name} className={cn(
              'rounded-xl border bg-surface p-4 transition-colors hover:bg-surface-elevated',
              comp.status === 'healthy' ? 'border-accent/20' : comp.status === 'degraded' ? 'border-warn/20' : 'border-danger/20'
            )}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-text-muted" />
                  <span className="text-xs font-semibold">{comp.name}</span>
                </div>
                <HealthPill status={comp.status} />
              </div>
              {comp.latencyMs !== null && (
                <p className="text-[11px] text-text-muted">
                  Latency: <span className="font-mono text-text-secondary">{comp.latencyMs}ms</span>
                </p>
              )}
              {comp.message && (
                <p className="text-[11px] text-text-muted mt-1">{comp.message}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Orchestrator control */}
      <OrchestratorControls />

      {/* Diagnostics */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold mb-3">Diagnostics</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
          <div>
            <dt className="text-text-muted">Data Provider</dt>
            <dd className="font-mono text-text-secondary">{provider.name}</dd>
          </div>
          <div>
            <dt className="text-text-muted">WebSocket</dt>
            <dd className={cn(
              connectionStatus === 'connected' ? 'text-accent' : connectionStatus === 'disconnected' ? 'text-danger' : 'text-warn'
            )}>
              {connectionStatus}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Mutations</dt>
            <dd className={provider.capabilities.mutations ? 'text-accent' : 'text-text-muted'}>
              {provider.capabilities.mutations ? 'Enabled' : 'Disabled'}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Realtime</dt>
            <dd className={provider.capabilities.realtime ? 'text-accent' : 'text-text-muted'}>
              {provider.capabilities.realtime ? 'Enabled' : 'Polling'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Raw snapshot inspector */}
      {snapshot && (
        <JsonInspector data={snapshot} label="Raw System Snapshot" />
      )}
    </div>
  );
}
