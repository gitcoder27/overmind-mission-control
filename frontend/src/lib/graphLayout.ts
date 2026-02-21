/**
 * Graph layout computation for the Topology view.
 *
 * Takes tasks + agents and produces positioned nodes/edges for ReactFlow,
 * using dagre for automatic layout.
 */
import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { Task, Agent, TaskStatus } from '@/types/domain';

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const AGENT_NODE_WIDTH = 160;
const AGENT_NODE_HEIGHT = 60;

const statusColors: Record<TaskStatus, string> = {
  TODO: '#64748b',
  READY: '#3b82f6',
  IN_PROGRESS: '#3b82f6',
  REVIEW: '#f59e0b',
  DONE: '#22d3a7',
  BLOCKED: '#ef4444',
  FAILED: '#ef4444',
  CANCELLED: '#64748b',
};

export function computeLayout(
  tasks: Task[],
  agents: Agent[],
  projectId: string,
  projectGoal: string,
): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: 40,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Project root node
  const projectNodeId = `project-${projectId}`;
  g.setNode(projectNodeId, { width: NODE_WIDTH + 40, height: NODE_HEIGHT });
  nodes.push({
    id: projectNodeId,
    type: 'projectNode',
    data: { label: projectGoal, projectId },
    position: { x: 0, y: 0 },
  });

  // Group tasks by role for sequential edges
  const tasksByRole = new Map<string, Task[]>();
  for (const task of tasks) {
    const group = tasksByRole.get(task.role) || [];
    group.push(task);
    tasksByRole.set(task.role, group);
  }

  // Sort tasks within each role by creation time
  for (const [, group] of tasksByRole) {
    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // Add task nodes
  for (const task of tasks) {
    const taskNodeId = `task-${task.id}`;
    g.setNode(taskNodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    nodes.push({
      id: taskNodeId,
      type: 'taskNode',
      data: {
        task,
        statusColor: statusColors[task.status] || '#64748b',
      },
      position: { x: 0, y: 0 },
    });
  }

  // Add edges: project → first task per role
  for (const [, group] of tasksByRole) {
    if (group.length > 0) {
      edges.push({
        id: `e-${projectNodeId}-task-${group[0].id}`,
        source: projectNodeId,
        target: `task-${group[0].id}`,
        animated: false,
        style: { stroke: '#637bb8', strokeWidth: 1, opacity: 0.4 },
      });
    }

    // Sequential edges within a role
    for (let i = 0; i < group.length - 1; i++) {
      edges.push({
        id: `e-task-${group[i].id}-task-${group[i + 1].id}`,
        source: `task-${group[i].id}`,
        target: `task-${group[i + 1].id}`,
        animated: group[i + 1].status === 'IN_PROGRESS',
        style: {
          stroke: statusColors[group[i + 1].status] || '#637bb8',
          strokeWidth: 1.5,
          opacity: 0.6,
        },
      });
      g.setEdge(`task-${group[i].id}`, `task-${group[i + 1].id}`);
    }

    // Add edge from project to first task in dag
    if (group.length > 0) {
      g.setEdge(projectNodeId, `task-${group[0].id}`);
    }
  }

  // Add agent nodes + edges to claimed tasks
  const activeAgentIds = new Set<string>();
  for (const task of tasks) {
    if (task.claimedBy) {
      activeAgentIds.add(task.claimedBy);
    }
  }

  const agentMap = new Map<string, Agent>(agents.map((a) => [a.role, a]));

  for (const agentRole of activeAgentIds) {
    const agent = agentMap.get(agentRole);
    if (!agent) continue;

    const agentNodeId = `agent-${agent.id}`;
    if (!nodes.find((n) => n.id === agentNodeId)) {
      g.setNode(agentNodeId, { width: AGENT_NODE_WIDTH, height: AGENT_NODE_HEIGHT });
      nodes.push({
        id: agentNodeId,
        type: 'agentNode',
        data: { agent },
        position: { x: 0, y: 0 },
      });
    }

    // Connect agent to tasks it's working on
    for (const task of tasks) {
      if (task.claimedBy === agentRole) {
        const edgeId = `e-${agentNodeId}-task-${task.id}`;
        edges.push({
          id: edgeId,
          source: agentNodeId,
          target: `task-${task.id}`,
          animated: task.status === 'IN_PROGRESS',
          style: {
            stroke: '#a78bfa',
            strokeWidth: 1,
            strokeDasharray: '4 2',
            opacity: 0.5,
          },
        });
        g.setEdge(agentNodeId, `task-${task.id}`);
      }
    }
  }

  // Run dagre layout
  dagre.layout(g);

  // Apply computed positions to nodes
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      const w = node.type === 'agentNode' ? AGENT_NODE_WIDTH : (node.type === 'projectNode' ? NODE_WIDTH + 40 : NODE_WIDTH);
      const h = node.type === 'agentNode' ? AGENT_NODE_HEIGHT : NODE_HEIGHT;
      node.position = {
        x: dagreNode.x - w / 2,
        y: dagreNode.y - h / 2,
      };
    }
  }

  return { nodes, edges };
}
