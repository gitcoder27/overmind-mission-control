import { useSnapshot } from '@/queries/useSnapshot';
import { KPICard } from '@/components/ui/KPICard';
import { EventFeed } from '@/components/ui/EventFeed';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { HealthPill } from '@/components/ui/HealthPill';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { useNavigate } from '@tanstack/react-router';
import {
  FolderKanban,
  ClockAlert,
  Zap,
  ShieldAlert,
  Skull,
  AlertTriangle,
  Activity,
} from 'lucide-react';

export function OverviewPage() {
  const { data: snapshot, isLoading, error, refetch } = useSnapshot();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Command Center</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 stagger-children">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return <ErrorState message={error?.message || 'Failed to load snapshot'} onRetry={() => refetch()} />;
  }

  const { summary, alerts, orchestrator } = snapshot;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Command Center</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Real-time operational overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HealthPill status={snapshot.health.overall} />
          <span className="text-[11px] font-mono text-text-muted">
            Updated <TimeAgo date={snapshot.timestamp} />
          </span>
        </div>
      </div>

      {/* Orchestrator status bar */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${orchestrator.running ? 'bg-accent animate-pulse-dot' : 'bg-danger'}`} />
          <span className="text-xs font-medium">Orchestrator</span>
          <StatusBadge status={orchestrator.running ? 'RUNNING' : 'STOPPED'} pulse={orchestrator.running} />
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="text-xs text-text-muted font-mono">PID {orchestrator.pid || '---'}</span>
        <div className="h-4 w-px bg-border" />
        <span className="text-xs text-text-muted font-mono">Cursor {orchestrator.cursorPosition}</span>
        <div className="h-4 w-px bg-border" />
        <span className={`text-xs font-mono ${orchestrator.cursorLag > 10 ? 'text-warn' : 'text-text-muted'}`}>
          Lag {orchestrator.cursorLag}
        </span>
        {orchestrator.stagnant && (
          <>
            <div className="h-4 w-px bg-border" />
            <span className="text-xs font-medium text-danger">STAGNANT</span>
          </>
        )}
      </div>

      {/* Alert banner */}
      {alerts.filter(a => a.severity === 'critical').map((alert) => (
        <div key={alert.id} className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger-dim px-4 py-3 glow-danger">
          <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-danger">{alert.title}</p>
            <p className="text-xs text-danger/80">{alert.message}</p>
          </div>
        </div>
      ))}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 stagger-children">
        <KPICard label="Active Projects" value={summary.activeProjects} icon={<FolderKanban className="h-4 w-4" />} color="info" />
        <KPICard label="Awaiting Approval" value={summary.waitingApproval} icon={<ClockAlert className="h-4 w-4" />} color={summary.waitingApproval > 0 ? 'warn' : 'default'} />
        <KPICard label="Running Attempts" value={summary.runningAttempts} icon={<Zap className="h-4 w-4" />} color="accent" />
        <KPICard label="Blocked Tasks" value={summary.blockedTasks} icon={<ShieldAlert className="h-4 w-4" />} color={summary.blockedTasks > 0 ? 'danger' : 'default'} />
        <KPICard label="Dead Letters" value={summary.deadLetters} icon={<Skull className="h-4 w-4" />} color={summary.deadLetters > 0 ? 'danger' : 'default'} />
        <KPICard label="Retry Storms" value={summary.retryStorms} icon={<AlertTriangle className="h-4 w-4" />} color={summary.retryStorms > 0 ? 'warn' : 'default'} />
      </div>

      {/* Warning alerts */}
      {alerts.filter(a => a.severity === 'warning').map((alert) => (
        <div key={alert.id} className="flex items-center gap-3 rounded-lg border border-warn/20 bg-warn-dim px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-warn shrink-0" />
          <p className="text-xs text-warn">{alert.title}: {alert.message}</p>
        </div>
      ))}

      {/* Bottom grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Event feed */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-text-muted" />
              <h3 className="text-sm font-semibold">Recent Events</h3>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <EventFeed events={snapshot.recentEvents} />
          </div>
        </div>

        {/* Active projects sidebar */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Active Projects</h3>
            <button onClick={() => navigate({ to: '/projects' })} className="text-[11px] text-accent hover:underline">
              View all
            </button>
          </div>
          <div className="divide-y divide-border/50">
            {snapshot.activeProjects.slice(0, 5).map((project) => (
              <button
                key={project.id}
                onClick={() => navigate({ to: '/projects/$projectId', params: { projectId: project.id } })}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text-primary">{project.goal}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={project.status} size="sm" />
                    {project.taskSummary && (
                      <span className="text-[11px] text-text-muted">
                        {project.taskSummary.done}/{project.taskSummary.total} tasks
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
