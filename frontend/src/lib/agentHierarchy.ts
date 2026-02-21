import type { Agent, AgentRole } from '@/types/domain';

export type AgentTier = 'manager' | 'lead' | 'worker';

const TIER_MAP: Record<string, AgentTier> = {
  coordinator: 'manager',
  architect: 'lead',
  oracle: 'lead',
  qa: 'lead',
  builder: 'worker',
  scout: 'worker',
};

/**
 * Returns the hierarchy tier for a given agent role.
 * Unknown roles default to 'worker'.
 */
export function getAgentTier(role: AgentRole | string): AgentTier {
  return TIER_MAP[role] ?? 'worker';
}

export interface GroupedAgents {
  manager: Agent[];
  lead: Agent[];
  worker: Agent[];
}

/**
 * Groups an array of agents into manager / lead / worker buckets.
 */
export function groupAgentsByTier(agents: Agent[]): GroupedAgents {
  const groups: GroupedAgents = { manager: [], lead: [], worker: [] };
  for (const agent of agents) {
    const tier = getAgentTier(agent.role);
    groups[tier].push(agent);
  }
  return groups;
}

export const TIER_META: Record<AgentTier, { label: string; description: string; order: number }> = {
  manager: { label: 'Manager', description: 'Strategic coordination & orchestration', order: 0 },
  lead: { label: 'Leads', description: 'Domain specialists & decision-makers', order: 1 },
  worker: { label: 'Workers', description: 'Execution & operational tasks', order: 2 },
};
