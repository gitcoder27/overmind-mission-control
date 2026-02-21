import { useMemo } from 'react';
import type { Agent } from '@/types/domain';
import { groupAgentsByTier } from '@/lib/agentHierarchy';
import type { AgentTier } from '@/lib/agentHierarchy';
import { TierLane } from './TierLane';
import { AgentHierarchyCard } from './AgentHierarchyCard';
import { HierarchyConnector } from './HierarchyConnectors';

interface HierarchyBoardProps {
  agents: Agent[];
  onAgentClick: (agentId: string) => void;
}

export function HierarchyBoard({ agents, onAgentClick }: HierarchyBoardProps) {
  const grouped = useMemo(() => groupAgentsByTier(agents), [agents]);

  const renderCards = (list: Agent[], tier: AgentTier) =>
    list.map((agent, i) => (
      <AgentHierarchyCard
        key={agent.id}
        agent={agent}
        tier={tier}
        onClick={() => onAgentClick(agent.id)}
        animationDelay={i * 60}
      />
    ));

  const busyCount = (list: Agent[]) => list.filter(a => a.status === 'busy').length;

  return (
    <div className="space-y-1" data-testid="hierarchy-board">
      {/* Manager tier */}
      <TierLane tier="manager" count={grouped.manager.length} busyCount={busyCount(grouped.manager)}>
        {renderCards(grouped.manager, 'manager')}
      </TierLane>

      <HierarchyConnector from="manager" to="lead" />

      {/* Lead tier */}
      <TierLane tier="lead" count={grouped.lead.length} busyCount={busyCount(grouped.lead)}>
        {renderCards(grouped.lead, 'lead')}
      </TierLane>

      <HierarchyConnector from="lead" to="worker" />

      {/* Worker tier */}
      <TierLane tier="worker" count={grouped.worker.length} busyCount={busyCount(grouped.worker)}>
        {renderCards(grouped.worker, 'worker')}
      </TierLane>
    </div>
  );
}
