import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { FolderKanban } from 'lucide-react';

interface ProjectNodeData {
  label: string;
  projectId: string;
  [key: string]: unknown;
}

function ProjectNodeComponent({ data }: NodeProps) {
  const { label } = data as ProjectNodeData;

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 min-w-[200px] max-w-[240px] glow-accent">
      <div className="flex items-center gap-2 mb-1">
        <FolderKanban className="h-4 w-4 text-accent" />
        <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Project</span>
      </div>
      <div className="text-xs font-medium text-text-primary leading-snug truncate" title={label}>
        {label}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-accent !w-2 !h-2 !border-none" />
    </div>
  );
}

export const ProjectNode = memo(ProjectNodeComponent);
