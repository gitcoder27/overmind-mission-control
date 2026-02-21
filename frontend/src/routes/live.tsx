import { useState, useEffect } from 'react';
import { useSnapshot } from '@/queries/useSnapshot';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EventFeed } from '@/components/ui/EventFeed';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { formatDuration } from '@/lib/utils';
import { Radio, Zap, Activity, CheckCircle, XCircle } from 'lucide-react';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function LiveOpsPage() {
  const { data: snapshot, isLoading, error, refetch } = useSnapshot();
  const now = useNow();

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold">Live Operations</h2>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80" />)}
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return <ErrorState message={error?.message || 'Failed to load'} onRetry={() => refetch()} />;
  }

  const running = snapshot.runningAttempts;
  const recent = snapshot.recentEvents;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-accent animate-pulse-dot" />
          <h2 className="text-lg font-bold">Live Operations</h2>
        </div>
        <span className="text-[11px] font-mono text-text-muted">
          Updated <TimeAgo date={snapshot.timestamp} />
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Running attempts */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Zap className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">Running Attempts</h3>
            <span className="ml-auto rounded-full bg-info-dim px-2 py-0.5 text-[11px] font-bold text-info">{running.length}</span>
          </div>
          <div className="divide-y divide-border/50 max-h-[calc(100vh-250px)] overflow-y-auto">
            {running.length === 0 ? (
              <EmptyState icon={<Zap className="h-8 w-8" />} title="No running attempts" description="System is idle" />
            ) : (
              running.map((att) => {
                const elapsed = att.startedAt ? (now - new Date(att.startedAt).getTime()) / 1000 : 0;
                return (
                  <div key={att.id} className="px-4 py-3 hover:bg-surface-hover transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{att.agentRole}</span>
                      <StatusBadge status={att.status} pulse />
                    </div>
                    <p className="text-[11px] text-text-secondary truncate">{att.taskTitle}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
                      <span className="font-mono">Attempt #{att.attemptNo}</span>
                      <span>{'\u00b7'}</span>
                      <span>{formatDuration(elapsed)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Event stream */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Activity className="h-4 w-4 text-purple" />
            <h3 className="text-sm font-semibold">Event Stream</h3>
          </div>
          <div className="max-h-[calc(100vh-250px)] overflow-y-auto">
            <EventFeed events={recent} compact />
          </div>
        </div>

        {/* Recent completions */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <CheckCircle className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold">Recent Results</h3>
          </div>
          <div className="divide-y divide-border/50 max-h-[calc(100vh-250px)] overflow-y-auto">
            {snapshot.recentEvents
              .filter((e) => e.eventType === 'ATTEMPT_COMPLETED')
              .slice(0, 10)
              .map((e) => {
                const payload = e.payload as Record<string, unknown>;
                const success = payload.status === 'SUCCEEDED';
                return (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors">
                    {success ? (
                      <CheckCircle className="h-4 w-4 text-accent shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-danger shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{String(payload.role || e.source)}</p>
                      <p className="text-[11px] text-text-muted truncate">
                        {payload.error ? String(payload.error) : 'Completed successfully'}
                      </p>
                    </div>
                    <TimeAgo date={e.createdAt} className="text-[11px] text-text-muted whitespace-nowrap" />
                  </div>
                );
              })}
            {snapshot.recentEvents.filter(e => e.eventType === 'ATTEMPT_COMPLETED').length === 0 && (
              <EmptyState icon={<CheckCircle className="h-8 w-8" />} title="No recent results" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
