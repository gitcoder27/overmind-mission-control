import { useState, useEffect, useRef, useCallback } from 'react';
import { useProject, useProjectTasks, useEvents, useProjectAttempts, useAgents } from '@/queries/useSnapshot';
import { useApproveProject, useRequestChanges, useSetProjectStatus } from '@/queries/useMutations';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { EventFeed } from '@/components/ui/EventFeed';
import { DataTable } from '@/components/ui/DataTable';
import { KanbanBoard } from '@/components/projects/KanbanBoard';
import { TopologyGraph } from '@/components/projects/TopologyGraph';
import type { Column } from '@/components/ui/DataTable';
import type { Task, Attempt } from '@/types/domain';
import { progressPercent, getAgentRoleIcon, shortId, formatDuration, cn } from '@/lib/utils';
import { useDataProvider } from '@/providers/data';
import { ArrowLeft, CheckCircle, XCircle, RotateCcw, Archive, Play, AlertTriangle, Loader2, ClipboardList, LayoutGrid, List, Network, X, Copy, Check } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

type ViewMode = 'board' | 'table' | 'topology';
const VIEW_PREF_KEY = 'overmind_project_tasks_view';

/* ── Error Popover ─────────────────────────────────────── */

function ErrorPopover({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    function onClick(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, close]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [message]);

  return (
    <span className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((p) => !p)}
        className="group flex items-center gap-1.5 text-[11px] text-danger hover:text-danger/80 transition-colors cursor-pointer text-left"
      >
        <span className="truncate block max-w-[160px]">{message}</span>
        <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-danger/50">view</span>
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-full mt-1.5 z-50 w-[380px] max-w-[90vw] animate-fade-in"
        >
          <div className="rounded-xl border border-danger/20 bg-surface-elevated shadow-2xl glow-danger">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-danger/10 px-3.5 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-danger/70">Error Details</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                  title="Copy error message"
                >
                  {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
                </button>
                <button
                  onClick={close}
                  className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="px-3.5 py-3 max-h-48 overflow-y-auto">
              <p className="text-xs leading-relaxed text-text-primary whitespace-pre-wrap break-words font-mono">
                {message}
              </p>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

interface ProjectDetailPageProps {
  projectId: string;
}

export function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const { data: project, isLoading: projLoading, error: projError, refetch: refetchProject } = useProject(projectId);
  const { data: tasks, isLoading: tasksLoading, error: tasksError, refetch: refetchTasks } = useProjectTasks(projectId);
  const { data: events, isLoading: eventsLoading, error: eventsError, refetch: refetchEvents } = useEvents({ project_id: projectId });
  const { data: attempts = [], isLoading: attemptsLoading, error: attemptsError, refetch: refetchAttempts } = useProjectAttempts(projectId);
  const { data: agents } = useAgents();
  const provider = useDataProvider();
  const navigate = useNavigate();

  // Mutations
  const approveMutation = useApproveProject();
  const requestChangesMutation = useRequestChanges();
  const setStatusMutation = useSetProjectStatus();

  // View mode: board vs table (persisted in localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem(VIEW_PREF_KEY) as ViewMode) || 'board';
  });

  useEffect(() => {
    localStorage.setItem(VIEW_PREF_KEY, viewMode);
  }, [viewMode]);

  if (projLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (projError || !project) {
    return <ErrorState message={projError?.message || 'Project not found'} onRetry={() => refetchProject()} />;
  }

  const pct = project.taskSummary ? progressPercent(project.taskSummary.done, project.taskSummary.total) : 0;
  const mutating = approveMutation.isPending || requestChangesMutation.isPending || setStatusMutation.isPending;

  const taskColumns: Column<Task>[] = [
    {
      key: 'role',
      header: 'Role',
      width: 'w-24',
      render: (t) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <span className="font-mono">{getAgentRoleIcon(t.role)}</span>
          <span className="text-text-secondary">{t.role}</span>
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      render: (t) => <span className="text-xs font-medium">{t.title}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-32',
      render: (t) => <StatusBadge status={t.status} pulse={t.status === 'IN_PROGRESS'} />,
    },
    {
      key: 'retries',
      header: 'Retries',
      width: 'w-20',
      render: (t) => (
        <span className={cn('text-xs font-mono', t.retryCount >= t.maxRetries ? 'text-danger' : 'text-text-muted')}>
          {t.retryCount}/{t.maxRetries}
        </span>
      ),
    },
    {
      key: 'attempts',
      header: 'Attempts',
      width: 'w-20',
      render: (t) => <span className="text-xs text-text-muted">{t.attemptCount ?? '---'}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      width: 'w-24',
      render: (t) => <TimeAgo date={t.updatedAt} className="text-xs text-text-muted" />,
    },
  ];

  const attemptColumns: Column<Attempt>[] = [
    {
      key: 'id',
      header: 'ID',
      width: 'w-24',
      render: (a) => <span className="font-mono text-[11px] text-text-muted">{shortId(a.id)}</span>,
    },
    {
      key: 'task',
      header: 'Task',
      render: (a) => <span className="text-xs font-medium">{a.taskTitle || shortId(a.taskId)}</span>,
    },
    {
      key: 'role',
      header: 'Agent',
      width: 'w-24',
      render: (a) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <span className="font-mono">{getAgentRoleIcon(a.agentRole)}</span>
          <span className="text-text-secondary">{a.agentRole}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      render: (a) => <StatusBadge status={a.status} pulse={a.status === 'RUNNING'} />,
    },
    {
      key: 'attemptNo',
      header: '#',
      width: 'w-12',
      render: (a) => <span className="text-xs font-mono text-text-muted">{a.attemptNo}</span>,
    },
    {
      key: 'started',
      header: 'Started',
      width: 'w-24',
      render: (a) => a.startedAt ? <TimeAgo date={a.startedAt} className="text-xs text-text-muted" /> : <span className="text-xs text-text-muted">---</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      width: 'w-20',
      render: (a) => {
        if (!a.startedAt) return <span className="text-xs text-text-muted">---</span>;
        const end = a.endedAt ? new Date(a.endedAt).getTime() : Date.now();
        const dur = (end - new Date(a.startedAt).getTime()) / 1000;
        return <span className="text-xs font-mono text-text-muted">{formatDuration(dur)}</span>;
      },
    },
    {
      key: 'error',
      header: 'Error',
      width: 'w-40',
      render: (a) => a.errorMessage
        ? <ErrorPopover message={a.errorMessage} />
        : <span className="text-xs text-text-muted">---</span>,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <button onClick={() => navigate({ to: '/projects' })} className="mb-3 flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="h-3 w-3" /> Back to projects
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{project.goal}</h2>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusBadge status={project.status} size="md" />
              {project.routeType && (
                <span className="rounded bg-purple-dim px-2 py-0.5 text-[11px] font-medium text-purple">{project.routeType}</span>
              )}
              <span className="text-xs text-text-muted font-mono">{project.id}</span>
              <span className="text-xs text-text-muted">Priority {project.priority}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Approve / Request Changes — only for WAITING_USER_APPROVAL */}
            {project.status === 'WAITING_USER_APPROVAL' && provider.capabilities.approveProject && (
              <>
                <button
                  disabled={mutating}
                  onClick={() => approveMutation.mutate({ id: project.id })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-dim px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                >
                  {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  Approve
                </button>
                <button
                  disabled={mutating}
                  onClick={() => requestChangesMutation.mutate({ id: project.id })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-warn-dim px-3 py-1.5 text-xs font-medium text-warn hover:bg-warn/20 transition-colors disabled:opacity-50"
                >
                  {requestChangesMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  Request Changes
                </button>
              </>
            )}

            {/* Status change actions */}
            {provider.capabilities.setProjectStatus && (
              <>
                {project.status === 'BLOCKED' && (
                  <button
                    disabled={mutating}
                    onClick={() => setStatusMutation.mutate({ id: project.id, status: 'ACTIVE', reason: 'manual_resume' })}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-info-dim px-3 py-1.5 text-xs font-medium text-info hover:bg-info/20 transition-colors disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" /> Resume
                  </button>
                )}
                {(project.status === 'ACTIVE' || project.status === 'BLOCKED' || project.status === 'QUEUED') && (
                  <button
                    disabled={mutating}
                    onClick={() => setStatusMutation.mutate({ id: project.id, status: 'ARCHIVED', reason: 'manual_cancel' })}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </button>
                )}
              </>
            )}

            {/* Capability-aware disabled state */}
            {!provider.capabilities.approveProject && project.status === 'WAITING_USER_APPROVAL' && (
              <span className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-text-muted" title="Not available in current data provider">
                Actions unavailable ({provider.name})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {project.taskSummary && project.taskSummary.total > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-secondary">Progress</span>
            <span className="text-xs font-mono text-text-muted">{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-text-muted">
            <span>Done: {project.taskSummary.done}</span>
            <span>In Progress: {project.taskSummary.inProgress}</span>
            <span>Blocked: {project.taskSummary.blocked}</span>
            <span>Failed: {project.taskSummary.failed}</span>
            <span>Todo: {project.taskSummary.todo}</span>
          </div>
        </div>
      )}

      {/* Tasks section */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Tasks</h3>
          <div className="flex items-center gap-1 rounded-lg bg-surface-elevated p-0.5">
            <button
              onClick={() => setViewMode('board')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                viewMode === 'board'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              data-testid="view-toggle-board"
            >
              <LayoutGrid className="h-3 w-3" />
              Board
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                viewMode === 'table'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              data-testid="view-toggle-table"
            >
              <List className="h-3 w-3" />
              Table
            </button>
            <button
              onClick={() => setViewMode('topology')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                viewMode === 'topology'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              data-testid="view-toggle-topology"
            >
              <Network className="h-3 w-3" />
              Topology
            </button>
          </div>
        </div>
        {tasksLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : tasksError ? (
          <ErrorState message={tasksError.message} onRetry={() => refetchTasks()} />
        ) : !tasks || tasks.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title="No tasks yet"
            description="Tasks will appear here once the orchestrator creates them for this project."
          />
        ) : viewMode === 'board' ? (
          <div className="p-4">
            <KanbanBoard tasks={tasks} />
          </div>
        ) : viewMode === 'topology' ? (
          <div className="p-4">
            <TopologyGraph
              tasks={tasks}
              agents={agents || []}
              projectId={projectId}
              projectGoal={project.goal}
            />
          </div>
        ) : (
          <DataTable
            columns={taskColumns}
            data={tasks}
            keyExtractor={(t) => t.id}
          />
        )}
      </div>

      {/* Agent Activity History */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Agent Activity History</h3>
          <span className="text-[11px] text-text-muted">{attempts.length} attempts</span>
        </div>
        {attemptsLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : attemptsError ? (
          <ErrorState message={attemptsError.message} onRetry={() => refetchAttempts()} />
        ) : attempts.length === 0 ? (
          <EmptyState
            icon={<RotateCcw className="h-8 w-8" />}
            title="No attempts recorded"
            description="Agent activity history will appear here as the orchestrator processes tasks."
          />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <DataTable
              columns={attemptColumns}
              data={attempts}
              keyExtractor={(a) => a.id}
            />
          </div>
        )}
      </div>

      {/* Events */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Event Timeline</h3>
        </div>
        {eventsLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : eventsError ? (
          <ErrorState message={eventsError.message} onRetry={() => refetchEvents()} />
        ) : !events || events.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8" />}
            title="No events"
            description="Events will appear here as the project progresses."
          />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <EventFeed events={events} />
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold mb-3">Details</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
          <div><dt className="text-text-muted">Created</dt><dd><TimeAgo date={project.createdAt} /></dd></div>
          <div><dt className="text-text-muted">Updated</dt><dd><TimeAgo date={project.updatedAt} /></dd></div>
          <div><dt className="text-text-muted">Created By</dt><dd>{project.createdBy}</dd></div>
          <div><dt className="text-text-muted">Plan Version</dt><dd>{project.activePlanVersion}</dd></div>
          <div><dt className="text-text-muted">Replan Count</dt><dd>{project.replanCount}/{project.maxReplanCycles}</dd></div>
        </dl>
      </div>
    </div>
  );
}
