import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TaskNode } from './TaskNode';
import { AgentNode } from './AgentNode';
import { ProjectNode } from './ProjectNode';
import { computeLayout } from '@/lib/graphLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Network } from 'lucide-react';
import type { Task, Agent } from '@/types/domain';

interface TopologyGraphProps {
  tasks: Task[];
  agents: Agent[];
  projectId: string;
  projectGoal: string;
}

const nodeTypes = {
  taskNode: TaskNode,
  agentNode: AgentNode,
  projectNode: ProjectNode,
};

const defaultEdgeOptions = {
  type: 'smoothstep',
};

const proOptions = { hideAttribution: true };

export function TopologyGraph({ tasks, agents, projectId, projectGoal }: TopologyGraphProps) {
  const layout = useMemo(
    () => computeLayout(tasks, agents, projectId, projectGoal),
    [tasks, agents, projectId, projectGoal],
  );

  const [nodes, , onNodesChange] = useNodesState(layout.nodes);
  const [edges, , onEdgesChange] = useEdgesState(layout.edges);

  const onInit = useCallback(() => {
    // ReactFlow initialized — no action needed
  }, []);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-8 w-8" />}
        title="No topology data"
        description="Tasks will appear as nodes once the orchestrator creates them."
      />
    );
  }

  return (
    <div className="h-[500px] w-full rounded-lg border border-border/30 overflow-hidden" data-testid="topology-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={proOptions}
        minZoom={0.3}
        maxZoom={2}
        style={{ background: '#04060e' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(99, 123, 184, 0.08)"
        />
        <Controls
          className="!bg-surface !border-border/30 !rounded-lg !shadow-lg [&_button]:!bg-surface-elevated [&_button]:!border-border/30 [&_button]:!text-text-muted [&_button:hover]:!bg-surface-hover [&_button:hover]:!text-text-primary"
          showInteractive={false}
        />
        <MiniMap
          nodeStrokeColor="#637bb8"
          nodeColor={(node) => {
            if (node.type === 'projectNode') return '#22d3a7';
            if (node.type === 'agentNode') return '#a78bfa';
            return '#3b82f6';
          }}
          maskColor="rgba(4, 6, 14, 0.8)"
          className="!bg-abyss !border-border/30 !rounded-lg"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
