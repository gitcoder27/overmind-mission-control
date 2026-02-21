import { useState, useCallback } from 'react';
import { cn, formatRelativeTime, truncate } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import type { EventItem } from '@/types/domain';
import { Activity, AlertTriangle, Info, Bug, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
      title="Copy JSON"
    >
      {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function EventFeed({ events, maxItems = 20, compact }: EventFeedProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const visible = events.slice(0, maxItems);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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
        const hasPayload = !compact && event.payload && Object.keys(event.payload).length > 0;
        const isExpanded = expandedIds.has(event.id);
        const fullJson = hasPayload ? JSON.stringify(event.payload, null, 2) : '';

        return (
          <div key={event.id}>
            <div
              role={hasPayload ? 'button' : undefined}
              tabIndex={hasPayload ? 0 : undefined}
              onClick={() => hasPayload && toggleExpand(event.id)}
              onKeyDown={(e) => {
                if (hasPayload && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  toggleExpand(event.id);
                }
              }}
              className={cn(
                'group flex items-start gap-2 rounded-lg px-2.5 transition-colors hover:bg-surface-hover',
                compact ? 'py-1.5' : 'py-2',
                hasPayload && 'cursor-pointer select-none',
                isExpanded && 'bg-surface-hover'
              )}
            >
              {/* Expand/collapse chevron */}
              {hasPayload ? (
                isExpanded
                  ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                  : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
              ) : (
                <span className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', levelColor[event.level])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">
                    {event.eventType.replace(/_/g, ' ')}
                  </span>
                  {event.level !== 'INFO' && <StatusBadge status={event.level} size="sm" />}
                </div>
                {hasPayload && !isExpanded && (
                  <p className="mt-0.5 text-[11px] text-text-muted font-mono">
                    {truncate(JSON.stringify(event.payload), 120)}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-text-muted whitespace-nowrap">
                {formatRelativeTime(event.createdAt)}
              </span>
            </div>

            {/* Expanded payload panel */}
            {isExpanded && hasPayload && (
              <div className="ml-9 mr-2.5 mb-2 rounded-lg border border-border bg-[#0d1117] overflow-hidden animate-fade-in">
                <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
                    Event Payload
                  </span>
                  <CopyButton text={fullJson} />
                </div>
                <pre className="p-3 text-[11px] leading-relaxed font-mono text-text-secondary overflow-x-auto max-h-80 overflow-y-auto whitespace-pre">
                  {fullJson}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
