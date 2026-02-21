import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useProjects } from '@/queries/useSnapshot';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TimeAgo } from '@/components/ui/TimeAgo';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import type { Project } from '@/types/domain';
import { progressPercent, shortId, truncate } from '@/lib/utils';
import { FolderKanban, Search } from 'lucide-react';

const statusFilters = ['ALL', 'ACTIVE', 'WAITING_USER_APPROVAL', 'QUEUED', 'BLOCKED', 'COMPLETED', 'FAILED', 'ARCHIVED'] as const;

export function ProjectsListPage() {
  const { data: projects, isLoading, error, refetch } = useProjects();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold">Projects</h2>
        <SkeletonTable rows={6} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  const filtered = (projects || [])
    .filter((p) => statusFilter === 'ALL' || p.status === statusFilter)
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.goal.toLowerCase().includes(q) || p.id.includes(q);
    });

  const columns: Column<Project>[] = [
    {
      key: 'id',
      header: 'ID',
      width: 'w-24',
      render: (p) => <span className="font-mono text-xs text-text-muted">{shortId(p.id)}</span>,
    },
    {
      key: 'goal',
      header: 'Goal',
      render: (p) => <span className="text-xs font-medium">{truncate(p.goal, 80)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-40',
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'route',
      header: 'Type',
      width: 'w-24',
      render: (p) => (
        <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[11px] text-text-muted">
          {p.routeType || '---'}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: 'w-32',
      render: (p) => {
        if (!p.taskSummary) return <span className="text-xs text-text-muted">---</span>;
        const pct = progressPercent(p.taskSummary.done, p.taskSummary.total);
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-surface-elevated overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-text-muted whitespace-nowrap">{p.taskSummary.done}/{p.taskSummary.total}</span>
          </div>
        );
      },
    },
    {
      key: 'priority',
      header: 'Pri',
      width: 'w-12',
      render: (p) => <span className="text-xs text-text-muted">{p.priority}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      width: 'w-24',
      render: (p) => <TimeAgo date={p.updatedAt} className="text-xs text-text-muted" />,
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Projects</h2>
        <span className="text-xs text-text-muted">{filtered.length} projects</span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-8 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          {statusFilters.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-surface-elevated text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {s === 'ALL' ? 'All' : s === 'WAITING_USER_APPROVAL' ? 'Approval' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="h-10 w-10" />}
            title="No projects found"
            description={search ? 'Try adjusting your search or filters' : 'No projects match the current filter'}
          />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={(p) => p.id}
            onRowClick={(p) => navigate({ to: '/projects/$projectId', params: { projectId: p.id } })}
          />
        )}
      </div>
    </div>
  );
}
