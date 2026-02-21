import { cn, formatRelativeTime, truncate } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import type { EventItem } from '@/types/domain';
import { Activity, AlertTriangle, Info, Bug } from 'lucide-react';

interface EventFeedProps {
  events: EventItem[];
  maxItems?: number;
  compact?: boolean;
}

const levelIcon: Record<string, typeof Info> = {
  INFO: Info,
  WARN: AlertTriangle,
  ERROR: AlertTriangle,
  DEBUG: Bug,
};

const levelColor: Record<string, string> = {
  INFO: 'text-text-muted',
  WARN: 'text-warn',
  ERROR: 'text-danger',
  DEBUG: 'text-purple',
};

export function EventFeed({ events, maxItems = 20, compact }: EventFeedProps) {
  const visible = events.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-text-muted">
        <Activity className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-xs">No recent events</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {visible.map((event) => {
        const Icon = levelIcon[event.level] || Info;
        return (
          <div
            key={event.id}
            className={cn(
              'group flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-hover',
              compact ? 'py-1.5' : 'py-2'
            )}
          >
            <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', levelColor[event.level])} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-primary">
                  {event.eventType.replace(/_/g, ' ')}
                </span>
                {event.level !== 'INFO' && <StatusBadge status={event.level} size="sm" />}
              </div>
              {!compact && event.payload && (
                <p className="mt-0.5 text-[11px] text-text-muted font-mono">
                  {truncate(JSON.stringify(event.payload), 120)}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-text-muted whitespace-nowrap">
              {formatRelativeTime(event.createdAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
