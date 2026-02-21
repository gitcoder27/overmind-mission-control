import { cn, getAgentRoleIcon, formatDuration } from '@/lib/utils';
import { CheckCircle2, XCircle, Cpu } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts';
import type { Agent } from '@/types/domain';
import type { AgentTier } from '@/lib/agentHierarchy';

const statusColors: Record<string, { dot: string; text: string; label: string }> = {
  idle: { dot: 'bg-accent', text: 'text-accent', label: 'Idle' },
  busy: { dot: 'bg-info', text: 'text-info', label: 'Busy' },
  offline: { dot: 'bg-text-muted', text: 'text-text-muted', label: 'Offline' },
};

const modelSourceBadge: Record<string, { bg: string; text: string; label: string }> = {
  primary: { bg: 'bg-accent/15', text: 'text-accent', label: 'primary' },
  default: { bg: 'bg-info/15', text: 'text-info', label: 'default' },
  unknown: { bg: 'bg-warn/15', text: 'text-warn', label: 'unknown' },
};

const tierAccent: Record<AgentTier, { border: string; glow: string; iconBg: string }> = {
  manager: {
    border: 'border-purple/30',
    glow: 'shadow-[0_0_24px_rgba(167,139,250,0.12)]',
    iconBg: 'bg-purple-dim',
  },
  lead: {
    border: 'border-info/25',
    glow: 'shadow-[0_0_18px_rgba(59,130,246,0.10)]',
    iconBg: 'bg-info-dim',
  },
  worker: {
    border: 'border-accent/20',
    glow: 'shadow-[0_0_14px_rgba(34,211,167,0.08)]',
    iconBg: 'bg-accent-dim',
  },
};

interface AgentHierarchyCardProps {
  agent: Agent;
  tier: AgentTier;
  onClick: () => void;
  /** CSS animation-delay for stagger reveal */
  animationDelay?: number;
}

export function AgentHierarchyCard({ agent, tier, onClick, animationDelay = 0 }: AgentHierarchyCardProps) {
  const st = statusColors[agent.status] || statusColors.offline;
  const ms = modelSourceBadge[agent.modelSource || 'unknown'];
  const ta = tierAccent[tier];

  return (
    <button
      onClick={onClick}
      data-testid={`agent-card-${agent.id}`}
      style={{ animationDelay: `${animationDelay}ms` }}
      className={cn(
        'group relative rounded-2xl border bg-surface/80 backdrop-blur-sm p-5 transition-all duration-200',
        'text-left w-full cursor-pointer',
        'hover:bg-surface-elevated hover:border-border-strong hover:-translate-y-0.5 hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-void',
        'opacity-0 animate-[fadeSlideIn_0.4s_ease-out_forwards]',
        ta.border,
        ta.glow,
        agent.status === 'busy' && 'border-info/30 glow-info',
        tier === 'manager' && 'lg:max-w-md'
      )}
    >
      {/* Top: icon, name, role, status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl text-lg font-semibold',
            ta.iconBg,
            tier === 'manager' && 'h-13 w-13 rounded-2xl text-xl'
          )}>
            {getAgentRoleIcon(agent.role)}
          </div>
          <div className="min-w-0">
            <h3 className={cn(
              'font-bold truncate',
              tier === 'manager' ? 'text-base' : 'text-sm'
            )}>
              {agent.name}
            </h3>
            <p className="text-[11px] text-text-muted capitalize tracking-wide">{agent.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={cn('h-2 w-2 rounded-full', st.dot, agent.status === 'busy' && 'animate-pulse-dot')} />
          <span className={cn('text-xs font-medium', st.text)}>{st.label}</span>
        </div>
      </div>

      {/* Model info */}
      {agent.effectiveModel && (
        <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-void/50 border border-border/15">
          <Cpu className="h-3 w-3 text-text-muted flex-shrink-0" />
          <span className="text-[11px] font-mono text-text-secondary truncate" title={agent.effectiveModel}>
            {agent.effectiveModel}
          </span>
          <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold flex-shrink-0', ms.bg, ms.text)}>
            {ms.label}
          </span>
        </div>
      )}

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Success</p>
          <p className={cn(
            'text-sm font-bold tabular-nums',
            agent.successRate >= 90 ? 'text-accent' : agent.successRate >= 70 ? 'text-warn' : 'text-danger'
          )}>
            {agent.successRate}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Avg Time</p>
          <p className="text-sm font-bold tabular-nums">{formatDuration(agent.avgDuration)}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Total</p>
          <p className="text-sm font-bold tabular-nums">{agent.totalAttempts}</p>
        </div>
      </div>

      {/* Health chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {agent.registered !== undefined && (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium',
            agent.registered ? 'bg-accent/10 text-accent' : 'bg-warn/10 text-warn'
          )}>
            {agent.registered ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
            {agent.registered ? 'Registered' : 'Unregistered'}
          </span>
        )}
        {agent.profileHealth && (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium',
            agent.profileHealth.ok ? 'bg-accent/10 text-accent' : 'bg-warn/10 text-warn'
          )}>
            {agent.profileHealth.ok ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
            {agent.profileHealth.ok ? 'Profile OK' : `${agent.profileHealth.missingFiles.length} missing`}
          </span>
        )}
      </div>

      {/* Activity sparkline */}
      <div className="h-10 w-full opacity-60 group-hover:opacity-90 transition-opacity">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={agent.recentActivity}>
            <Tooltip
              contentStyle={{
                background: '#131c33',
                border: '1px solid rgba(99,123,184,0.2)',
                borderRadius: '8px',
                fontSize: '11px',
              }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#22d3a7' }}
              labelFormatter={() => ''}
            />
            <Bar dataKey="count" fill="rgba(34, 211, 167, 0.35)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-0.5 text-[9px] text-text-muted text-center tracking-wide">24h activity</p>
    </button>
  );
}
