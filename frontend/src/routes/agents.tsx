import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAgents } from '@/queries/useSnapshot';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { HierarchyBoard } from '@/components/agents/HierarchyBoard';
import { Network, Users, Zap, Pause, AlertTriangle } from 'lucide-react';

export function AgentsPage() {
  const { data: agents, isLoading, error, refetch } = useAgents();
  const navigate = useNavigate();

  const kpis = useMemo(() => {
    if (!agents) return { total: 0, busy: 0, idle: 0, profileIssues: 0 };
    return {
      total: agents.length,
      busy: agents.filter(a => a.status === 'busy').length,
      idle: agents.filter(a => a.status === 'idle').length,
      profileIssues: agents.filter(a => a.profileHealth && !a.profileHealth.ok).length,
    };
  }, [agents]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <Network className="h-5 w-5 text-purple" />
          <h2 className="text-lg font-bold">Agent Command Structure</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 stagger-children">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + KPI strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-dim">
            <Network className="h-5 w-5 text-purple" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Agent Command Structure</h2>
            <p className="text-[11px] text-text-muted tracking-wide">
              Manager → Leads → Workers live hierarchy
            </p>
          </div>
        </div>

        {/* KPI chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <KpiChip icon={<Users className="h-3.5 w-3.5" />} label="Total" value={kpis.total} color="text-text-secondary" />
          <KpiChip icon={<Zap className="h-3.5 w-3.5" />} label="Busy" value={kpis.busy} color="text-info" />
          <KpiChip icon={<Pause className="h-3.5 w-3.5" />} label="Idle" value={kpis.idle} color="text-accent" />
          {kpis.profileIssues > 0 && (
            <KpiChip icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Issues" value={kpis.profileIssues} color="text-warn" />
          )}
        </div>
      </div>

      {/* Hierarchy board */}
      <HierarchyBoard
        agents={agents || []}
        onAgentClick={(agentId) =>
          navigate({ to: '/agents/$agentId', params: { agentId } })
        }
      />
    </div>
  );
}

/* ─── Inline helper ─── */

function KpiChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border/30 bg-surface/60 px-3 py-1.5">
      <span className={color}>{icon}</span>
      <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
