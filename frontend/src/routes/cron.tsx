import { useCronJobs } from '@/queries/useSnapshot';
import { useToggleCronJob, useRunCronJob } from '@/queries/useMutations';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { CronJob } from '@/types/domain';
import { useDataProvider } from '@/providers/data';
import {
  Clock,
  Play,
  Power,
  PowerOff,
  Loader2,
  Timer,
  Bot,
  Cpu,
  Radio,
  Zap,
  CalendarClock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Send,
  BrainCircuit,
  Target,
  ShieldCheck,
  Search,
  Eye,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';

// ── Agent role config ──────────────────────────────────────────

const ROLE_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof Bot; label: string }> = {
  coordinator: { color: 'text-purple', bg: 'bg-purple-dim', border: 'border-purple/20', icon: Target, label: 'Coordinator' },
  architect:   { color: 'text-info', bg: 'bg-info-dim', border: 'border-info/20', icon: BrainCircuit, label: 'Architect' },
  builder:     { color: 'text-accent', bg: 'bg-accent-dim', border: 'border-accent/20', icon: Cpu, label: 'Builder' },
  scout:       { color: 'text-warn', bg: 'bg-warn-dim', border: 'border-warn/20', icon: Search, label: 'Scout' },
  oracle:      { color: 'text-info', bg: 'bg-info-dim', border: 'border-info/20', icon: Eye, label: 'Oracle' },
  qa:          { color: 'text-accent', bg: 'bg-accent-dim', border: 'border-accent/20', icon: ShieldCheck, label: 'QA' },
};

const DEFAULT_ROLE = { color: 'text-text-secondary', bg: 'bg-surface-elevated', border: 'border-border', icon: Bot, label: 'Agent' };

function getRoleConfig(role: string | null) {
  if (!role) return DEFAULT_ROLE;
  return ROLE_CONFIG[role.toLowerCase()] || DEFAULT_ROLE;
}

// ── Summary KPI pill ───────────────────────────────────────────

function KPIPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2')}>
      <span className={cn('text-xl font-bold tabular-nums', color)}>{value}</span>
      <span className="text-[11px] text-text-muted uppercase tracking-wide font-medium">{label}</span>
    </div>
  );
}

// ── Filter tabs ────────────────────────────────────────────────

type FilterMode = 'all' | 'enabled' | 'disabled';

function FilterTabs({ active, counts, onChange }: { active: FilterMode; counts: { all: number; enabled: number; disabled: number }; onChange: (m: FilterMode) => void }) {
  const tabs: { key: FilterMode; label: string; count: number }[] = [
    { key: 'all', label: 'All Jobs', count: counts.all },
    { key: 'enabled', label: 'Active', count: counts.enabled },
    { key: 'disabled', label: 'Paused', count: counts.disabled },
  ];
  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-elevated/60 p-0.5">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
            active === t.key
              ? 'bg-surface-active text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary'
          )}
        >
          {t.label}
          <span className={cn(
            'ml-1.5 tabular-nums',
            active === t.key ? 'text-accent' : 'text-text-muted/60',
          )}>{t.count}</span>
        </button>
      ))}
    </div>
  );
}

// ── Cron Job Card ──────────────────────────────────────────────

function CronJobCard({ job, canAct }: { job: CronJob; canAct: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const toggleMutation = useToggleCronJob();
  const runMutation = useRunCronJob();

  const toggling = toggleMutation.isPending && toggleMutation.variables?.id === job.id;
  const running = runMutation.isPending && runMutation.variables?.id === job.id;
  const roleConfig = getRoleConfig(job.agentRole);
  const RoleIcon = roleConfig.icon;

  const displayName = job.label || job.name;
  const isDisabled = !job.enabled;

  return (
    <div
      className={cn(
        'group relative rounded-xl border transition-all duration-300',
        isDisabled
          ? 'border-border/50 bg-surface/40 opacity-65 hover:opacity-80'
          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-elevated/40',
      )}
    >
      {/* Active indicator line at top */}
      {!isDisabled && (
        <div className={cn('absolute inset-x-4 top-0 h-[2px] rounded-b', roleConfig.bg)} />
      )}

      <div className="p-4 space-y-3">
        {/* ── Row 1: Name + role badge + status + actions ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Role icon */}
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', roleConfig.bg)}>
              <RoleIcon className={cn('h-[18px] w-[18px]', roleConfig.color)} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-text-primary truncate">{displayName}</h3>
                {job.agentRole && (
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    roleConfig.bg, roleConfig.color,
                  )}>
                    {roleConfig.label}
                  </span>
                )}
              </div>
              {/* Schedule line */}
              <div className="flex items-center gap-1.5 mt-1">
                <CalendarClock className="h-3 w-3 text-text-muted shrink-0" />
                <span className="text-xs text-text-secondary font-medium">{job.scheduleHuman || job.schedule}</span>
                {job.schedule !== job.scheduleHuman && (
                  <span className="text-[10px] text-text-muted font-mono hidden sm:inline">({job.schedule})</span>
                )}
              </div>
            </div>
          </div>

          {/* Status + Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Status pill */}
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
              job.enabled
                ? 'bg-accent-dim text-accent'
                : 'bg-surface-elevated text-text-muted',
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', job.enabled ? 'bg-accent animate-pulse-dot' : 'bg-text-muted')} />
              {job.enabled ? 'Active' : 'Paused'}
            </span>

            {/* Action buttons */}
            <div className="flex items-center gap-0.5 ml-1">
              <button
                disabled={!canAct || toggling}
                onClick={() => toggleMutation.mutate({ id: job.id, enabled: job.enabled })}
                className={cn(
                  'rounded-lg p-1.5 transition-all duration-200',
                  canAct
                    ? 'hover:bg-surface-hover text-text-secondary hover:text-text-primary'
                    : 'text-text-muted/30 cursor-not-allowed',
                )}
                title={!canAct ? 'Not available in current provider' : job.enabled ? 'Pause job' : 'Resume job'}
              >
                {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : job.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              </button>
              <button
                disabled={!canAct || running}
                onClick={() => runMutation.mutate({ id: job.id })}
                className={cn(
                  'rounded-lg p-1.5 transition-all duration-200',
                  canAct
                    ? 'hover:bg-accent-dim text-text-secondary hover:text-accent'
                    : 'text-text-muted/30 cursor-not-allowed',
                )}
                title={!canAct ? 'Not available in current provider' : 'Run now'}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Row 2: Metadata chips ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Next run */}
          {job.nextRun && (
            <MetaChip icon={Timer} label="Next" value={formatIST(job.nextRun)} />
          )}

          {/* Last run */}
          <MetaChip
            icon={job.lastRunStatus === 'success' ? CheckCircle2 : job.lastRunStatus === 'failure' ? XCircle : Clock}
            iconColor={job.lastRunStatus === 'success' ? 'text-accent' : job.lastRunStatus === 'failure' ? 'text-danger' : undefined}
            label="Last"
            value={job.lastRun ? formatIST(job.lastRun) : 'Never'}
          />

          {/* Payload kind */}
          {job.payloadKind && (
            <MetaChip icon={job.payloadKind === 'agentTurn' ? Zap : Radio} label="" value={
              <span className="text-[11px]">{job.payloadKind === 'agentTurn' ? 'Agent Turn' : job.payloadKind === 'systemEvent' ? 'System Event' : job.payloadKind}</span>
            } />
          )}

          {/* Session target */}
          {job.sessionTarget && (
            <MetaChip icon={Target} label="" value={
              <span className="text-[11px] capitalize">{job.sessionTarget}</span>
            } />
          )}

          {/* Delivery */}
          {job.deliveryMode && job.deliveryMode !== 'none' && (
            <MetaChip icon={Send} label="" value={
              <span className="text-[11px] capitalize">{job.deliveryChannel || job.deliveryMode}</span>
            } />
          )}
        </div>

        {/* ── Row 3: Expandable details ── */}
        {(job.description || job.model) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors w-full text-left"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            <span>{expanded ? 'Less details' : 'More details'}</span>
          </button>
        )}

        {expanded && (
          <div className="space-y-2 rounded-lg bg-abyss/60 border border-border/50 px-3 py-2.5 animate-fade-in">
            {job.description && (
              <p className="text-xs text-text-secondary leading-relaxed">{job.description}</p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {job.model && (
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-purple" />
                  <span className="text-[11px] font-mono text-purple">{job.model}</span>
                </div>
              )}
              {job.thinking && (
                <div className="flex items-center gap-1.5">
                  <BrainCircuit className="h-3 w-3 text-info" />
                  <span className="text-[11px] text-info capitalize">Thinking: {job.thinking}</span>
                </div>
              )}
              {job.timeoutSeconds != null && (
                <div className="flex items-center gap-1.5">
                  <Timer className="h-3 w-3 text-text-muted" />
                  <span className="text-[11px] text-text-muted">Timeout: {formatTimeout(job.timeoutSeconds)}</span>
                </div>
              )}
            </div>
            <div className="text-[10px] font-mono text-text-muted/60 pt-0.5">
              ID: {job.id} &middot; Raw: <span className="text-text-muted">{job.name}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small metadata chip ────────────────────────────────────────

function MetaChip({ icon: Icon, iconColor, label, value }: {
  icon: typeof Clock;
  iconColor?: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated/70 px-2 py-1 leading-none">
      <Icon className={cn('h-3 w-3 shrink-0', iconColor || 'text-text-muted')} />
      {label && <span className="text-[10px] leading-none text-text-muted uppercase tracking-wider font-semibold">{label}</span>}
      <span className="text-[11px] leading-none text-text-secondary">{value}</span>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function formatTimeout(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Format a date string as exact IST time, e.g. "21 Feb, 11:10 PM IST" */
function formatIST(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' IST';
  } catch {
    return dateStr;
  }
}

// ── Loading skeleton ───────────────────────────────────────────

function CronCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-6 w-20 rounded-md" />
        <Skeleton className="h-6 w-20 rounded-md" />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export function CronPage() {
  const { data: jobs, isLoading, error, refetch } = useCronJobs();
  const provider = useDataProvider();
  const canAct = provider.capabilities.cronActions;
  const [filter, setFilter] = useState<FilterMode>('all');

  const counts = useMemo(() => {
    const all = jobs?.length || 0;
    const enabled = jobs?.filter(j => j.enabled).length || 0;
    return { all, enabled, disabled: all - enabled };
  }, [jobs]);

  const filtered = useMemo(() => {
    if (!jobs) return [];
    if (filter === 'enabled') return jobs.filter(j => j.enabled);
    if (filter === 'disabled') return jobs.filter(j => !j.enabled);
    return jobs;
  }, [jobs, filter]);

  const successCount = useMemo(() => jobs?.filter(j => j.lastRunStatus === 'success').length || 0, [jobs]);
  const failureCount = useMemo(() => jobs?.filter(j => j.lastRunStatus === 'failure').length || 0, [jobs]);

  if (isLoading) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2 stagger-children">
          {Array.from({ length: 4 }).map((_, i) => <CronCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warn-dim">
            <CalendarClock className="h-5 w-5 text-warn" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Scheduled Operations</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Automated cron jobs &middot; {counts.all} total
            </p>
          </div>
        </div>

        <FilterTabs active={filter} counts={counts} onChange={setFilter} />
      </div>

      {/* ── Summary row ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <KPIPill label="Active" value={counts.enabled} color="text-accent" />
        <KPIPill label="Paused" value={counts.disabled} color="text-text-muted" />
        <KPIPill label="Healthy" value={successCount} color="text-accent" />
        {failureCount > 0 && (
          <KPIPill label="Failing" value={failureCount} color="text-danger" />
        )}
      </div>

      {/* ── Provider notice ── */}
      {!canAct && (
        <div className="rounded-lg border border-border bg-surface px-4 py-2.5 text-xs text-text-muted flex items-center gap-2">
          <Power className="h-3.5 w-3.5 text-text-muted" />
          Actions disabled in <span className="font-mono text-text-secondary">{provider.name}</span> provider. Switch to <code className="font-mono text-accent">api</code> to enable mutations.
        </div>
      )}

      {/* ── Job cards ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-10 w-10" />}
          title={filter === 'all' ? 'No scheduled jobs' : `No ${filter} jobs`}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 stagger-children">
          {filtered.map(job => (
            <CronJobCard key={job.id} job={job} canAct={canAct} />
          ))}
        </div>
      )}
    </div>
  );
}
