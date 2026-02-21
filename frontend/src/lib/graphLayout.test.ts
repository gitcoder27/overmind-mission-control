import { describe, expect, it } from 'vitest';
import { computeLayout } from '@/lib/graphLayout';
import type { Task, Agent } from '@/types/domain';

const ago = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();

const mockTasks: Task[] = [
  {
    id: 'task-1', projectId: 'proj-1', title: 'Design schema',
    description: null, role: 'architect', status: 'DONE', priority: 3,
    retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null,
    taskKind: 'execution', createdAt: ago(100), updatedAt: ago(80),
    attemptCount: 1,
  },
  {
    id: 'task-2', projectId: 'proj-1', title: 'Build API',
    description: null, role: 'builder', status: 'IN_PROGRESS', priority: 4,
    retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: 'builder',
    taskKind: 'execution', createdAt: ago(80), updatedAt: ago(5),
    attemptCount: 1,
  },
  {
    id: 'task-3', projectId: 'proj-1', title: 'Test API',
    description: null, role: 'qa', status: 'TODO', priority: 2,
    retryCount: 0, maxRetries: 3, leaseExpiresAt: null, claimedBy: null,
    taskKind: 'execution', createdAt: ago(60), updatedAt: ago(60),
    attemptCount: 0,
  },
];

const mockAgents: Agent[] = [
  {
    id: 'overmind-architect', name: 'Architect', role: 'architect',
    status: 'idle', successRate: 95, avgDuration: 120, totalAttempts: 50,
    recentActivity: [],
  },
  {
    id: 'overmind-builder', name: 'Builder', role: 'builder',
    status: 'busy', successRate: 85, avgDuration: 300, totalAttempts: 200,
    recentActivity: [],
  },
];

describe('computeLayout', () => {
  it('generates nodes and edges from tasks', () => {
    const result = computeLayout(mockTasks, mockAgents, 'proj-1', 'Test project');
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
  });

  it('creates a project root node', () => {
    const result = computeLayout(mockTasks, mockAgents, 'proj-1', 'Test project');
    const projectNode = result.nodes.find((n) => n.id === 'project-proj-1');
    expect(projectNode).toBeDefined();
    expect(projectNode?.type).toBe('projectNode');
  });

  it('creates task nodes for each task', () => {
    const result = computeLayout(mockTasks, mockAgents, 'proj-1', 'Test project');
    const taskNodes = result.nodes.filter((n) => n.type === 'taskNode');
    expect(taskNodes.length).toBe(3);
  });

  it('creates agent nodes for claimed tasks', () => {
    const result = computeLayout(mockTasks, mockAgents, 'proj-1', 'Test project');
    const agentNodes = result.nodes.filter((n) => n.type === 'agentNode');
    // Only builder has a claimed task
    expect(agentNodes.length).toBe(1);
    expect(agentNodes[0].id).toBe('agent-overmind-builder');
  });

  it('creates edges from project to first tasks per role', () => {
    const result = computeLayout(mockTasks, mockAgents, 'proj-1', 'Test project');
    const projectEdges = result.edges.filter((e) => e.source === 'project-proj-1');
    // 3 roles => 3 edges from project
    expect(projectEdges.length).toBe(3);
  });

  it('creates animated edges for IN_PROGRESS tasks', () => {
    const result = computeLayout(mockTasks, mockAgents, 'proj-1', 'Test project');
    const agentEdges = result.edges.filter((e) => e.source.startsWith('agent-'));
    const animatedEdge = agentEdges.find((e) => e.animated);
    expect(animatedEdge).toBeDefined();
  });

  it('assigns positions to all nodes', () => {
    const result = computeLayout(mockTasks, mockAgents, 'proj-1', 'Test project');
    for (const node of result.nodes) {
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }
  });

  it('handles empty task list', () => {
    const result = computeLayout([], mockAgents, 'proj-1', 'Test project');
    // Should still have project node
    expect(result.nodes.length).toBe(1);
    expect(result.edges.length).toBe(0);
  });
});
