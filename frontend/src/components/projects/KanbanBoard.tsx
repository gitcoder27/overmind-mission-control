import { useMemo } from 'react';
import { KanbanColumn } from './KanbanColumn';
import type { Task, TaskStatus } from '@/types/domain';

interface KanbanBoardProps {
  tasks: Task[];
}

interface ColumnConfig {
  status: TaskStatus;
  label: string;
  collapsed?: boolean;
}

const COLUMNS: ColumnConfig[] = [
  { status: 'TODO', label: 'Todo' },
  { status: 'READY', label: 'Ready' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'REVIEW', label: 'Review' },
  { status: 'DONE', label: 'Done' },
  { status: 'BLOCKED', label: 'Blocked', collapsed: true },
  { status: 'FAILED', label: 'Failed', collapsed: true },
  { status: 'CANCELLED', label: 'Cancelled', collapsed: true },
];

export function KanbanBoard({ tasks }: KanbanBoardProps) {
  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const col of COLUMNS) {
      map.set(col.status, []);
    }
    for (const task of tasks) {
      const bucket = map.get(task.status);
      if (bucket) {
        bucket.push(task);
      } else {
        // Unknown status — put in TODO
        map.get('TODO')!.push(task);
      }
    }
    // Sort each column by priority desc, then updated desc
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }
    return map;
  }, [tasks]);

  return (
    <div className="overflow-x-auto" data-testid="kanban-board">
      <div className="flex gap-3 min-w-min pb-2">
        {COLUMNS.map((col) => {
          const colTasks = grouped.get(col.status) || [];
          return (
            <KanbanColumn
              key={col.status}
              status={col.status}
              tasks={colTasks}
              label={col.label}
              collapsed={col.collapsed}
            />
          );
        })}
      </div>
    </div>
  );
}
