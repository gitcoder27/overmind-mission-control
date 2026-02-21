import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { cn, getAgentRoleIcon } from '@/lib/utils';
import type { Agent } from '@/types/domain';

interface AgentNodeData {
  agent: Agent;
  [key: string]: unknown;
}

const statusDot: Record<string, string> = {
  idle: 'bg-accent',
  busy: 'bg-info animate-pulse-dot',
  offline: 'bg-text-muted',
};

function AgentNodeComponent({ data }: NodeProps) {
  const { agent } = data as AgentNodeData;

  return (
    <div
      className={cn(
        'rounded-lg border border-purple/30 bg-purple/5 p-2.5 min-w-[140px] max-w-[160px] transition-all',
        agent.status === 'busy' && 'glow-info border-info/30 bg-info/5'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple/50 !w-2 !h-2 !border-none" />

      <div className="flex items-center gap-2">
        <span className="text-lg">{getAgentRoleIcon(agent.role)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-text-primary truncate">
            {agent.name}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', statusDot[agent.status] || 'bg-text-muted')} />
            <span className="text-[9px] text-text-muted capitalize">{agent.status}</span>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-purple/50 !w-2 !h-2 !border-none" />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
