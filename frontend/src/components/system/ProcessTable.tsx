/**
 * ProcessTable — top processes by CPU or memory.
 * Max 8 rows, sortable columns.
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpDown } from 'lucide-react';
import type { ProcessInfo } from '@/types/metrics';

interface ProcessTableProps {
  title: string;
  processes: ProcessInfo[];
  className?: string;
}

type SortKey = 'pid' | 'name' | 'cpu' | 'memory';
type SortDir = 'asc' | 'desc';

export function ProcessTable({ title, processes, className }: ProcessTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...processes];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc'
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return arr.slice(0, 8);
  }, [processes, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const cols: { key: SortKey; label: string; align: string; width: string }[] = [
    { key: 'pid', label: 'PID', align: 'text-left', width: 'w-16' },
    { key: 'name', label: 'Name', align: 'text-left', width: 'flex-1' },
    { key: 'cpu', label: 'CPU%', align: 'text-right', width: 'w-14' },
    { key: 'memory', label: 'MEM%', align: 'text-right', width: 'w-14' },
  ];

  return (
    <div className={cn('rounded-xl border border-border bg-surface overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-border">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{title}</h4>
      </div>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
        {cols.map((col) => (
          <button
            key={col.key}
            onClick={() => toggleSort(col.key)}
            className={cn(
              'flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors',
              col.align,
              col.width,
              sortKey === col.key ? 'text-accent' : 'text-text-muted hover:text-text-secondary'
            )}
          >
            {col.label}
            <ArrowUpDown className="h-2.5 w-2.5" />
          </button>
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-border/30">
        {sorted.map((p, i) => (
          <div
            key={p.pid}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 text-[11px] font-mono transition-colors hover:bg-surface-hover',
              i % 2 === 0 ? 'bg-transparent' : 'bg-surface-elevated/30'
            )}
          >
            <span className="w-16 text-text-muted">{p.pid}</span>
            <span className="flex-1 truncate text-text-primary">{p.name}</span>
            <span className="w-14 text-right text-text-secondary">{p.cpu.toFixed(1)}</span>
            <span className="w-14 text-right text-text-secondary">{p.memory.toFixed(1)}</span>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="px-4 py-4 text-center text-[11px] text-text-muted">No process data</div>
        )}
      </div>
    </div>
  );
}
