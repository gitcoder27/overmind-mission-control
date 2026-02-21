import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { cn, getAgentRoleIcon } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Task } from '@/types/domain';

interface TaskNodeData {
  task: Task;
  statusColor: string;
  [key: string]: unknown;
}

function TaskNodeComponent({ data }: NodeProps) {
  const { task, statusColor } = data as TaskNodeData;

  return (
    <div
      className={cn(
        'rounded-lg border bg-surface p-3 min-w-[180px] max-w-[200px] transition-all',
        task.status === 'IN_PROGRESS' && 'glow-info',
        task.status === 'DONE' && 'border-accent/30',
        task.status === 'FAILED' && 'border-danger/30',
        task.status !== 'IN_PROGRESS' && task.status !== 'DONE' && task.status !== 'FAILED' && 'border-border/50'
      )}
      style={{ borderLeftWidth: '3px', borderLeftColor: statusColor }}
    >
      <Handle type="target" position={Position.Top} className="!bg-border !w-2 !h-2 !border-none" />

      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{getAgentRoleIcon(task.role)}</span>
        <span className="text-[10px] text-text-muted capitalize">{task.role}</span>
      </div>

      <div className="text-xs font-medium text-text-primary truncate leading-snug" title={task.title}>
        {task.title}
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <StatusBadge status={task.status} size="sm" pulse={task.status === 'IN_PROGRESS'} />
        {task.claimedBy && (
          <span className="text-[9px] text-purple font-mono">{task.claimedBy}</span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-border !w-2 !h-2 !border-none" />
    </div>
  );
}

export const TaskNode = memo(TaskNodeComponent);
