import { cn } from '@/lib/utils';
import { KanbanTaskCard } from './KanbanTaskCard';
import type { Task, TaskStatus } from '@/types/domain';

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  label: string;
  collapsed?: boolean;
}

const statusGradient: Record<string, string> = {
  TODO: 'from-text-muted/8 to-transparent',
  READY: 'from-info/8 to-transparent',
  IN_PROGRESS: 'from-info/12 to-transparent',
  REVIEW: 'from-warn/8 to-transparent',
  DONE: 'from-accent/8 to-transparent',
  BLOCKED: 'from-danger/8 to-transparent',
  FAILED: 'from-danger/10 to-transparent',
  CANCELLED: 'from-text-muted/5 to-transparent',
};

const statusHeaderColor: Record<string, string> = {
  TODO: 'text-text-muted border-text-muted/30',
  READY: 'text-info border-info/30',
  IN_PROGRESS: 'text-info border-info/40',
  REVIEW: 'text-warn border-warn/30',
  DONE: 'text-accent border-accent/30',
  BLOCKED: 'text-danger border-danger/30',
  FAILED: 'text-danger border-danger/30',
  CANCELLED: 'text-text-muted border-text-muted/20',
};

export function KanbanColumn({ status, tasks, label, collapsed }: KanbanColumnProps) {
  const gradient = statusGradient[status] || statusGradient.TODO;
  const headerColor = statusHeaderColor[status] || statusHeaderColor.TODO;

  if (collapsed && tasks.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border border-border/30 bg-gradient-to-b min-w-[220px]',
        gradient,
        status === 'IN_PROGRESS' && tasks.length > 0 && 'glow-info',
        collapsed && 'min-w-[180px]'
      )}
    >
      {/* Column header */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2.5 border-b',
        headerColor
      )}>
        <span className="text-xs font-bold uppercase tracking-wider">
          {label}
        </span>
        <span className={cn(
          'flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold',
          tasks.length > 0 ? 'bg-surface-elevated' : 'bg-surface-elevated/50 text-text-muted'
        )}>
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[60vh] stagger-children">
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-[11px] text-text-muted italic">
            No tasks
          </div>
        ) : (
          tasks.map((task) => (
            <KanbanTaskCard key={task.id} task={task} />
          ))
        )}
      </div>
    </div>
  );
}
