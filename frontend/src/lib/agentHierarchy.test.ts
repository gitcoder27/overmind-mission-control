import { describe, expect, it } from 'vitest';
import { getAgentTier, groupAgentsByTier } from '@/lib/agentHierarchy';
import type { Agent } from '@/types/domain';

/* ─── Helper to build a minimal Agent fixture ─── */
function makeAgent(overrides: Partial<Agent> & { id: string; role: Agent['role'] }): Agent {
  return {
    name: overrides.id,
    status: 'idle',
    successRate: 90,
    avgDuration: 100,
    totalAttempts: 10,
    recentActivity: [],
    ...overrides,
  } as Agent;
}

describe('getAgentTier', () => {
  it('maps coordinator → manager', () => {
    expect(getAgentTier('coordinator')).toBe('manager');
  });

  it('maps architect → lead', () => {
    expect(getAgentTier('architect')).toBe('lead');
  });

  it('maps oracle → lead', () => {
    expect(getAgentTier('oracle')).toBe('lead');
  });

  it('maps qa → lead', () => {
    expect(getAgentTier('qa')).toBe('lead');
  });

  it('maps builder → worker', () => {
    expect(getAgentTier('builder')).toBe('worker');
  });

  it('maps scout → worker', () => {
    expect(getAgentTier('scout')).toBe('worker');
  });

  it('defaults unknown role to worker', () => {
    expect(getAgentTier('janitor' as Agent['role'])).toBe('worker');
  });
});

describe('groupAgentsByTier', () => {
  const agents: Agent[] = [
    makeAgent({ id: 'coord', role: 'coordinator' }),
    makeAgent({ id: 'arch', role: 'architect' }),
    makeAgent({ id: 'oracle', role: 'oracle' }),
    makeAgent({ id: 'qa', role: 'qa' }),
    makeAgent({ id: 'builder', role: 'builder' }),
    makeAgent({ id: 'scout', role: 'scout' }),
  ];

  it('places coordinator in manager bucket', () => {
    const groups = groupAgentsByTier(agents);
    expect(groups.manager.map(a => a.id)).toEqual(['coord']);
  });

  it('places architect, oracle, qa in lead bucket', () => {
    const groups = groupAgentsByTier(agents);
    expect(groups.lead.map(a => a.id)).toEqual(['arch', 'oracle', 'qa']);
  });

  it('places builder, scout in worker bucket', () => {
    const groups = groupAgentsByTier(agents);
    expect(groups.worker.map(a => a.id)).toEqual(['builder', 'scout']);
  });

  it('handles empty array', () => {
    const groups = groupAgentsByTier([]);
    expect(groups.manager).toHaveLength(0);
    expect(groups.lead).toHaveLength(0);
    expect(groups.worker).toHaveLength(0);
  });

  it('defaults unknown role to worker', () => {
    const unknown = makeAgent({ id: 'mystery', role: 'janitor' as Agent['role'] });
    const groups = groupAgentsByTier([unknown]);
    expect(groups.worker).toHaveLength(1);
    expect(groups.worker[0].id).toBe('mystery');
  });
});
