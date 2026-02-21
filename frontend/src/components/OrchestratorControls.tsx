import { useState } from 'react';
import { useSnapshot } from '@/queries/useSnapshot';
import {
  usePauseOrchestrator,
  useResumeOrchestrator,
  useRestartOrchestrator,
} from '@/queries/useMutations';
import { useDataProvider } from '@/providers/data';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { cn, formatDuration } from '@/lib/utils';
import {
  Bot,
  Pause, Play, RotateCcw,
  Loader2,
  ChevronDown, ChevronUp,
  Activity,
} from 'lucide-react';

// ── Status helpers ──────────────────────────────────────

function statusLabel(running: boolean, stagnant: boolean): string {
  if (!running) return 'Stopped';
  if (stagnant) return 'Stagnant';
  return 'Running';
}

function statusColor(running: boolean, stagnant: boolean) {
  if (!running) return { dot: 'bg-danger', text: 'text-danger', badge: 'bg-danger-dim border-danger/30 text-danger' };
  if (stagnant) return { dot: 'bg-warn', text: 'text-warn', badge: 'bg-warn-dim border-warn/30 text-warn' };
  return { dot: 'bg-accent', text: 'text-accent', badge: 'bg-accent-dim border-accent/30 text-accent' };
}

// ── Component ───────────────────────────────────────────

export function OrchestratorControls() {
  const { data: snapshot } = useSnapshot();
  const provider = useDataProvider();

  const pauseMutation = usePauseOrchestrator();
  const resumeMutation = useResumeOrchestrator();
  const restartMutation = useRestartOrchestrator();

  const [outputExpanded, setOutputExpanded] = useState(false);

  const orch = snapshot?.orchestrator;

  if (!orch) return null;

  const colors = statusColor(orch.running, orch.stagnant);
  const label = statusLabel(orch.running, orch.stagnant);
  const restartOutput = restartMutation.data?.output ?? null;
  const restartError = restartMutation.error;
  const isRestarting = restartMutation.isPending;
  const hasCaps = provider.capabilities;

  return (
    <div className="rounded-xl border border-border bg-surface" data-testid="orchestrator-controls">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-text-muted" />
          <h3 className="text-sm font-semibold">Orchestrator Control</h3>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <Activity className="h-3 w-3 text-accent" />
          <span className="font-medium text-accent">Live</span>
          {snapshot && (
            <span className="ml-1">
              · <TimeAgo date={snapshot.timestamp} />
            </span>
          )}
        </div>
      </div>

      {/* Status + controls body */}
      <div className="px-4 py-4 space-y-4">
        {/* Status row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* Badge */}
          <div className="flex items-center gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', colors.badge)}>
              <span className={cn('h-2 w-2 rounded-full', colors.dot, orch.running && !orch.stagnant && 'animate-pulse-dot')} />
              {label}
            </span>
            <span className="text-xs font-mono text-text-muted">
              PID {orch.pid ?? '---'}
            </span>
          </div>

          {/* Heartbeat */}
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <span className="font-medium">Heartbeat:</span>
            {orch.lastHeartbeat ? (
              <>
                <TimeAgo date={orch.lastHeartbeat} className="font-mono" />
                {!orch.stagnant && <span className="text-accent font-medium ml-0.5">✓</span>}
                {orch.stagnant && <span className="text-warn font-medium ml-0.5">⚠</span>}
              </>
            ) : (
              <span className="font-mono">---</span>
            )}
          </div>

          {/* Cursor lag */}
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <span className="font-medium">Cursor Lag:</span>
            <span className={cn('font-mono', orch.cursorLag > 10 ? 'text-warn' : undefined)}>
              {orch.cursorLag} events behind
            </span>
          </div>

          {/* Uptime */}
          {orch.uptimeSeconds != null && (
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <span className="font-medium">Uptime:</span>
              <span className="font-mono">{formatDuration(orch.uptimeSeconds)}</span>
            </div>
          )}
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2">
          {hasCaps.pauseOrchestrator && (
            <button
              disabled={pauseMutation.isPending || isRestarting}
              onClick={() => pauseMutation.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-warn-dim border border-warn/20 px-3 py-1.5 text-xs font-medium text-warn hover:bg-warn/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pauseMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Pause className="h-3 w-3" />}
              Pause
            </button>
          )}

          {hasCaps.resumeOrchestrator && (
            <button
              disabled={resumeMutation.isPending || isRestarting}
              onClick={() => resumeMutation.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-dim border border-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resumeMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Play className="h-3 w-3" />}
              Resume
            </button>
          )}

          {hasCaps.restartOrchestrator && (
            <button
              disabled={isRestarting}
              onClick={() => restartMutation.mutate()}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                isRestarting
                  ? 'bg-info-dim border-info/20 text-info'
                  : 'bg-danger-dim border-danger/20 text-danger hover:bg-danger/20',
              )}
            >
              {isRestarting
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RotateCcw className="h-3 w-3" />}
              {isRestarting ? 'Restarting…' : 'Restart'}
            </button>
          )}
        </div>

        {/* Error display */}
        {restartError && !(restartError instanceof Error && restartError.message === 'Cancelled') && (
          <div className="rounded-lg border border-danger/30 bg-danger-dim px-3 py-2 text-xs text-danger" data-testid="restart-error">
            <p className="font-medium">Restart failed</p>
            <p className="mt-0.5 text-danger/80">{restartError.message}</p>
          </div>
        )}

        {/* Restart output panel */}
        {restartOutput && (
          <div className="rounded-lg border border-border bg-surface-elevated overflow-hidden" data-testid="restart-output">
            <button
              onClick={() => setOutputExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <span>Restart Output</span>
              {outputExpanded
                ? <ChevronUp className="h-3 w-3" />
                : <ChevronDown className="h-3 w-3" />}
            </button>
            {outputExpanded && (
              <pre className="max-h-60 overflow-auto border-t border-border px-3 py-2 text-[11px] font-mono text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                {restartOutput}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
