import { useState } from 'react';
import { cn, getAgentRoleIcon, shortId, formatRelativeTime } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ChevronDown, ChevronUp, User, RotateCcw } from 'lucide-react';
import type { Task } from '@/types/domain';

interface KanbanTaskCardProps {
  task: Task;
}

export function KanbanTaskCard({ task }: KanbanTaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const priorityColor =
    task.priority >= 4 ? 'bg-danger' :
    task.priority >= 3 ? 'bg-warn' :
    task.priority >= 2 ? 'bg-info' : 'bg-text-muted';

  return (
    <div
      className={cn(
        'group rounded-lg border bg-surface p-3 transition-all cursor-pointer',
        'hover:border-border-strong hover:translate-y-[-1px] hover:shadow-lg hover:shadow-black/20',
        task.status === 'IN_PROGRESS' && 'border-info/30 glow-info',
        task.status === 'FAILED' && 'border-danger/30',
        task.status !== 'IN_PROGRESS' && task.status !== 'FAILED' && 'border-border/50'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Priority pip */}
          <span className={cn('h-2 w-2 rounded-full shrink-0', priorityColor)} title={`Priority ${task.priority}`} />
          <span className="text-xs font-medium text-text-primary truncate leading-snug">
            {task.title}
          </span>
        </div>
        <button
          className="text-text-muted hover:text-text-secondary transition-colors shrink-0"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
          <span className="font-mono">{getAgentRoleIcon(task.role)}</span>
          <span>{task.role}</span>
        </span>

        {task.retryCount > 0 && (
          <span className={cn(
            'inline-flex items-center gap-0.5 text-[10px] font-mono',
            task.retryCount >= task.maxRetries ? 'text-danger' : 'text-text-muted'
          )}>
            <RotateCcw className="h-2.5 w-2.5" />
            {task.retryCount}/{task.maxRetries}
          </span>
        )}

        {task.claimedBy && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-text-muted">
            <User className="h-2.5 w-2.5" />
            {task.claimedBy}
          </span>
        )}
      </div>

      {/* Time since last update */}
      <div className="mt-1.5 text-[10px] text-text-muted">
        {formatRelativeTime(task.updatedAt)}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/30 space-y-2 animate-fade-in">
          {task.description && (
            <p className="text-[11px] text-text-secondary leading-relaxed">{task.description}</p>
          )}
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span className="font-mono">{shortId(task.id)}</span>
            {task.attemptCount != null && task.attemptCount > 0 && (
              <span>{task.attemptCount} attempt{task.attemptCount !== 1 ? 's' : ''}</span>
            )}
            {task.latestAttempt && (
              <StatusBadge status={task.latestAttempt.status} size="sm" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
