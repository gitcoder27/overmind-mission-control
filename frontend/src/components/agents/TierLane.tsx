import { cn } from '@/lib/utils';
import type { AgentTier } from '@/lib/agentHierarchy';
import { TIER_META } from '@/lib/agentHierarchy';
import type { ReactNode } from 'react';

const tierStyles: Record<AgentTier, {
  bg: string;
  badge: string;
  badgeText: string;
  accent: string;
}> = {
  manager: {
    bg: 'bg-gradient-to-b from-purple/[0.04] via-transparent to-transparent',
    badge: 'bg-purple/15 border-purple/25',
    badgeText: 'text-purple',
    accent: 'border-l-purple/40',
  },
  lead: {
    bg: 'bg-gradient-to-b from-info/[0.03] via-transparent to-transparent',
    badge: 'bg-info/15 border-info/25',
    badgeText: 'text-info',
    accent: 'border-l-info/40',
  },
  worker: {
    bg: 'bg-gradient-to-b from-accent/[0.03] via-transparent to-transparent',
    badge: 'bg-accent/15 border-accent/25',
    badgeText: 'text-accent',
    accent: 'border-l-accent/40',
  },
};

interface TierLaneProps {
  tier: AgentTier;
  count: number;
  busyCount: number;
  children: ReactNode;
}

export function TierLane({ tier, count, busyCount, children }: TierLaneProps) {
  const meta = TIER_META[tier];
  const styles = tierStyles[tier];

  return (
    <section
      data-testid={`tier-lane-${tier}`}
      className={cn(
        'relative rounded-2xl border border-border/30 p-5 lg:p-6',
        styles.bg,
        'backdrop-blur-[2px]',
      )}
    >
      {/* Lane header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className={cn(
            'inline-flex items-center rounded-lg border px-3 py-1 text-xs font-bold uppercase tracking-widest',
            styles.badge,
            styles.badgeText,
          )}>
            {meta.label}
          </span>
          <span className="text-[11px] text-text-muted hidden sm:inline">
            {meta.description}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span>{count} agent{count !== 1 ? 's' : ''}</span>
          {busyCount > 0 && (
            <span className="flex items-center gap-1 text-info">
              <span className="h-1.5 w-1.5 rounded-full bg-info animate-pulse-dot" />
              {busyCount} busy
            </span>
          )}
        </div>
      </div>

      {/* Cards grid – layout varies by tier */}
      <div className={cn(
        tier === 'manager' && 'flex justify-center',
        tier === 'lead' && 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',
        tier === 'worker' && 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
      )}>
        {children}
      </div>
    </section>
  );
}
