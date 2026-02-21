import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { useTranscript, useTranscriptItemRaw } from '@/queries/useSnapshot';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import type { TranscriptItem, ContentPart, ToolGroup, TranscriptItemKind } from '@/types/domain';
import {
  MessageSquare, Bot, User, Terminal, Settings, ChevronDown, ChevronRight,
  Search, X, Zap, Brain, AlertTriangle, ArrowDown,
  Code, Activity, Clock, Filter, Wrench, Hash, Maximize2,
  CheckCircle2, XCircle, Copy, Layers,
} from 'lucide-react';

interface ConversationReplayProps {
  agentId: string;
  sessionKey: string;
  onClose?: () => void;
}

// ── Filter config ──────────────────────────────────────────────

type FilterMode = 'all' | 'chat' | 'tools' | 'events';

const filterConfig: Record<FilterMode, { label: string; icon: typeof MessageSquare; kinds: TranscriptItemKind[] }> = {
  all: { label: 'All', icon: Layers, kinds: ['chat', 'tool_call', 'tool_result', 'event'] },
  chat: { label: 'Chat', icon: MessageSquare, kinds: ['chat'] },
  tools: { label: 'Tools', icon: Wrench, kinds: ['tool_call', 'tool_result'] },
  events: { label: 'Events', icon: Activity, kinds: ['event'] },
};

// ── Role configuration ─────────────────────────────────────────

const roleConfig = {
  system: {
    icon: Settings,
    label: 'System',
    bg: 'bg-surface-elevated/40',
    border: 'border-text-muted/15',
    accent: 'text-text-muted',
    stripe: 'bg-text-muted/30',
  },
  user: {
    icon: User,
    label: 'User',
    bg: 'bg-info/6',
    border: 'border-info/20',
    accent: 'text-info',
    stripe: 'bg-info',
  },
  assistant: {
    icon: Bot,
    label: 'Assistant',
    bg: 'bg-accent/5',
    border: 'border-accent/15',
    accent: 'text-accent',
    stripe: 'bg-accent',
  },
  tool: {
    icon: Terminal,
    label: 'Tool',
    bg: 'bg-purple/5',
    border: 'border-purple/15',
    accent: 'text-purple',
    stripe: 'bg-purple',
  },
  toolResult: {
    icon: Terminal,
    label: 'Tool',
    bg: 'bg-purple/5',
    border: 'border-purple/15',
    accent: 'text-purple',
    stripe: 'bg-purple',
  },
} as const;

const eventConfig = {
  session: { icon: Activity, label: 'Session', accent: 'text-text-muted' },
  model_change: { icon: Zap, label: 'Model Change', accent: 'text-warn' },
  thinking_level_change: { icon: Brain, label: 'Thinking', accent: 'text-purple' },
} as const;

// ── Helpers ────────────────────────────────────────────────────

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function groupToolItems(items: TranscriptItem[]): (TranscriptItem | ToolGroup)[] {
  const groupMap = new Map<string, ToolGroup>();
  const consumed = new Set<number>();

  for (const item of items) {
    if (item.kind === 'tool_call' && item.toolGroupId) {
      groupMap.set(item.toolGroupId, { groupId: item.toolGroupId, call: item, result: null });
      consumed.add(item.index);
    }
  }

  for (const item of items) {
    if (item.kind === 'tool_result' && item.toolGroupId && groupMap.has(item.toolGroupId)) {
      groupMap.get(item.toolGroupId)!.result = item;
      consumed.add(item.index);
    }
  }

  const result: (TranscriptItem | ToolGroup)[] = [];
  const emittedGroups = new Set<string>();

  for (const item of items) {
    if (consumed.has(item.index)) {
      if (item.kind === 'tool_call' && item.toolGroupId && !emittedGroups.has(item.toolGroupId)) {
        result.push(groupMap.get(item.toolGroupId)!);
        emittedGroups.add(item.toolGroupId);
      }
      continue;
    }
    result.push(item);
  }

  return result;
}

function isToolGroup(item: TranscriptItem | ToolGroup): item is ToolGroup {
  return 'groupId' in item;
}

// ── Content part renderers ─────────────────────────────────────

function TextBlock({ text, searchTerm }: { text: string; searchTerm?: string }) {
  if (!text) return null;

  if (searchTerm) {
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <div className="text-[13px] text-text-secondary leading-[1.7] whitespace-pre-wrap break-words font-[350]">
        {parts.map((part, i) =>
          regex.test(part)
            ? <mark key={i} className="bg-warn/25 text-warn rounded-sm px-0.5">{part}</mark>
            : part
        )}
      </div>
    );
  }

  return (
    <div className="text-[13px] text-text-secondary leading-[1.7] whitespace-pre-wrap break-words font-[350]">
      {text}
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group/think">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-purple/70 hover:text-purple transition-colors font-medium py-1"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Brain className="h-3 w-3" />
        <span>Thinking</span>
        {!expanded && (
          <span className="text-text-muted font-normal ml-1 truncate max-w-[200px]">
            {text.slice(0, 60)}…
          </span>
        )}
      </button>
      {expanded && (
        <div className="ml-5 mt-1 rounded-lg bg-purple/5 border border-purple/10 px-3 py-2.5 animate-fade-in">
          <div className="text-[12px] text-purple/70 leading-relaxed whitespace-pre-wrap break-words italic">
            {text}
          </div>
        </div>
      )}
    </div>
  );
}

function ContentPartRenderer({ part, searchTerm }: { part: ContentPart; searchTerm?: string }) {
  switch (part.type) {
    case 'text':
      return <TextBlock text={part.text} searchTerm={searchTerm} />;
    case 'thinking':
      return <ThinkingBlock text={part.text} />;
    case 'tool_use':
    case 'tool_result':
      return null; // Rendered by ToolGroupCard
    default:
      return <TextBlock text={JSON.stringify(part)} />;
  }
}

// ── Tool Group Card ────────────────────────────────────────────

const ToolGroupCard = memo(function ToolGroupCard({ group, agentId, sessionKey }: {
  group: ToolGroup;
  agentId: string;
  sessionKey: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showFullCall, setShowFullCall] = useState(false);
  const [showFullResult, setShowFullResult] = useState(false);

  const callItem = group.call;
  const resultItem = group.result;
  const toolName = callItem.toolMeta?.toolName || 'unknown';
  const isError = resultItem?.toolMeta?.isError || false;
  const resultStatus = resultItem ? (isError ? 'error' : 'success') : 'pending';

  const toolUsePart = callItem.contentParts.find(p => p.type === 'tool_use');
  const toolInput = toolUsePart && 'input' in toolUsePart ? toolUsePart.input : null;
  const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput, null, 2);

  const toolResultPart = resultItem?.contentParts.find(p => p.type === 'tool_result');
  const resultText = toolResultPart && 'text' in toolResultPart ? toolResultPart.text : '';

  const callTruncated = callItem.truncated;
  const resultTruncated = resultItem?.truncated || false;

  const { data: fullCall } = useTranscriptItemRaw(agentId, sessionKey, callItem.index, showFullCall && callTruncated);
  const { data: fullResult } = useTranscriptItemRaw(agentId, sessionKey, resultItem?.index ?? -1, showFullResult && resultTruncated && !!resultItem);

  const displayInput = useMemo(() => {
    if (showFullCall && fullCall) {
      const p = fullCall.contentParts.find(p => p.type === 'tool_use');
      if (p && 'input' in p) {
        return typeof p.input === 'string' ? p.input : JSON.stringify(p.input, null, 2);
      }
    }
    return inputStr;
  }, [showFullCall, fullCall, inputStr]);

  const displayResult = useMemo(() => {
    if (showFullResult && fullResult) {
      const p = fullResult.contentParts.find(p => p.type === 'tool_result');
      if (p && 'text' in p) return p.text;
    }
    return resultText;
  }, [showFullResult, fullResult, resultText]);

  const statusIcon = resultStatus === 'error'
    ? <XCircle className="h-3.5 w-3.5 text-danger" />
    : resultStatus === 'success'
      ? <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
      : <Clock className="h-3.5 w-3.5 text-text-muted animate-pulse-dot" />;

  return (
    <div
      className={cn(
        'group relative rounded-lg border transition-all duration-200',
        isError
          ? 'bg-danger/[0.03] border-danger/20 hover:border-danger/30'
          : 'bg-purple/[0.03] border-purple/15 hover:border-purple/25',
      )}
      data-testid="tool-group-card"
    >
      <div className={cn(
        'absolute left-0 top-3 bottom-3 w-[2px] rounded-full',
        isError ? 'bg-danger/40' : 'bg-purple/40',
      )} />

      {/* Collapsed summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left pl-4 pr-3 py-2.5 flex items-center gap-2.5"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-purple/60" /> : <ChevronRight className="h-3.5 w-3.5 text-purple/60" />}
          <Terminal className={cn('h-3.5 w-3.5', isError ? 'text-danger' : 'text-purple')} />
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={cn(
            'text-[12px] font-bold font-mono',
            isError ? 'text-danger' : 'text-purple',
          )}>
            {toolName}
          </span>
          {statusIcon}
          {resultItem && (
            <span className="text-[10px] text-text-muted font-mono">
              {humanSize(resultItem.contentSize)}
            </span>
          )}
          {(callTruncated || resultTruncated) && (
            <span className="text-[9px] text-warn/70 bg-warn/10 px-1.5 py-0.5 rounded font-medium">
              truncated
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {callItem.timestamp && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <Clock className="h-2.5 w-2.5" />
              {formatRelativeTime(callItem.timestamp)}
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="pl-4 pr-3 pb-3 space-y-3 animate-fade-in border-t border-purple/10 mt-0 pt-3">
          {/* Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple/60 flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" />
                Input
                {callTruncated && !showFullCall && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowFullCall(true); }}
                    className="ml-2 text-[9px] text-info/70 hover:text-info bg-info/10 px-1.5 py-0.5 rounded font-semibold transition-colors flex items-center gap-0.5"
                  >
                    <Maximize2 className="h-2 w-2" />
                    Load full ({humanSize(callItem.contentSize)})
                  </button>
                )}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(displayInput)}
                className="p-1 rounded text-text-muted/40 hover:text-text-muted transition-colors"
                title="Copy input"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <pre className="bg-void/50 border border-border/20 rounded-lg p-3 text-[11px] font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[300px] overflow-y-auto">
              {displayInput}
            </pre>
          </div>

          {/* Result */}
          {resultItem && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn(
                  'text-[10px] font-bold uppercase tracking-wider flex items-center gap-1',
                  isError ? 'text-danger/60' : 'text-accent/60',
                )}>
                  {isError ? <AlertTriangle className="h-2.5 w-2.5" /> : <Code className="h-2.5 w-2.5" />}
                  {isError ? 'Error' : 'Result'}
                  <span className="font-mono font-normal text-text-muted ml-1">
                    {humanSize(resultItem.contentSize)}
                  </span>
                  {resultTruncated && !showFullResult && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowFullResult(true); }}
                      className="ml-2 text-[9px] text-info/70 hover:text-info bg-info/10 px-1.5 py-0.5 rounded font-semibold transition-colors flex items-center gap-0.5"
                    >
                      <Maximize2 className="h-2 w-2" />
                      Load full ({humanSize(resultItem.contentSize)})
                    </button>
                  )}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(displayResult)}
                  className="p-1 rounded text-text-muted/40 hover:text-text-muted transition-colors"
                  title="Copy result"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <pre className={cn(
                'rounded-lg border p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[400px] overflow-y-auto',
                isError
                  ? 'bg-danger/5 border-danger/15 text-danger/80'
                  : 'bg-void/40 border-border/15 text-text-secondary',
              )}>
                {displayResult}
              </pre>
            </div>
          )}

          {/* Forensic IDs */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[9px] text-text-muted/50 font-mono flex items-center gap-1">
              <Hash className="h-2 w-2" />
              {group.groupId.slice(0, 16)}
            </span>
            {callItem.usage && (callItem.usage.inputTokens + callItem.usage.outputTokens > 0) && (
              <span className="text-[9px] text-text-muted/50 font-mono">
                {(callItem.usage.inputTokens + callItem.usage.outputTokens).toLocaleString()} tok
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// ── Standalone tool result (orphan — no matching call) ─────────

function StandaloneToolResult({ item, agentId, sessionKey }: {
  item: TranscriptItem;
  agentId: string;
  sessionKey: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const isError = item.toolMeta?.isError || false;
  const resultPart = item.contentParts.find(p => p.type === 'tool_result');
  const text = resultPart && 'text' in resultPart ? resultPart.text : item.contentText;

  const { data: fullItem } = useTranscriptItemRaw(agentId, sessionKey, item.index, showFull && item.truncated);
  const displayText = useMemo(() => {
    if (showFull && fullItem) {
      const p = fullItem.contentParts.find(p => p.type === 'tool_result');
      if (p && 'text' in p) return p.text;
    }
    return text;
  }, [showFull, fullItem, text]);

  return (
    <div className={cn(
      'group relative rounded-lg border transition-all',
      isError ? 'bg-danger/[0.03] border-danger/15' : 'bg-surface-elevated/20 border-border/20',
    )} data-testid="standalone-tool-result">
      <div className={cn('absolute left-0 top-3 bottom-3 w-[2px] rounded-full', isError ? 'bg-danger/40' : 'bg-text-muted/20')} />
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left pl-4 pr-3 py-2 flex items-center gap-2"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-text-muted" /> : <ChevronRight className="h-3 w-3 text-text-muted" />}
        {isError ? <AlertTriangle className="h-3 w-3 text-danger" /> : <Code className="h-3 w-3 text-text-muted" />}
        <span className={cn('text-[11px] font-semibold', isError ? 'text-danger' : 'text-text-secondary')}>
          {isError ? 'Error Result' : 'Tool Result'}
        </span>
        <span className="text-[10px] text-text-muted font-mono">{humanSize(item.contentSize)}</span>
        {item.truncated && (
          <span className="text-[9px] text-warn/70 bg-warn/10 px-1.5 py-0.5 rounded font-medium">truncated</span>
        )}
      </button>
      {expanded && (
        <div className="pl-4 pr-3 pb-3 animate-fade-in">
          {item.truncated && !showFull && (
            <button
              onClick={() => setShowFull(true)}
              className="mb-2 text-[10px] text-info/70 hover:text-info bg-info/10 px-2 py-1 rounded font-semibold transition-colors flex items-center gap-1"
            >
              <Maximize2 className="h-2.5 w-2.5" />
              Load full payload ({humanSize(item.contentSize)})
            </button>
          )}
          <pre className={cn(
            'rounded-lg border p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[400px] overflow-y-auto',
            isError ? 'bg-danger/5 border-danger/15 text-danger/80' : 'bg-void/40 border-border/15 text-text-secondary',
          )}>
            {displayText}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Event row (non-message) ────────────────────────────────────

function EventRow({ item }: { item: TranscriptItem }) {
  const config = eventConfig[item.eventType as keyof typeof eventConfig] || eventConfig.session;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-[10px]" data-testid="transcript-event">
      <div className="flex-1 h-px bg-border/30" />
      <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-elevated/50', config.accent)}>
        <Icon className="h-3 w-3" />
        <span className="font-medium">{item.contentText}</span>
        {item.timestamp && (
          <span className="text-text-muted ml-1">{formatRelativeTime(item.timestamp)}</span>
        )}
      </div>
      <div className="flex-1 h-px bg-border/30" />
    </div>
  );
}

// ── Chat message card ──────────────────────────────────────────

const ChatMessageCard = memo(function ChatMessageCard({ item, searchTerm }: { item: TranscriptItem; searchTerm: string }) {
  const role = (item.role || 'user') as keyof typeof roleConfig;
  const config = roleConfig[role] || roleConfig.user;
  const Icon = config.icon;

  const hasThinking = item.contentParts.some(p => p.type === 'thinking');
  const totalTokens = item.usage
    ? (item.usage.inputTokens || 0) + (item.usage.outputTokens || 0)
    : 0;

  const chatParts = item.contentParts.filter(p =>
    p.type === 'text' || p.type === 'thinking'
  );
  const isMatch = searchTerm && item.contentText.toLowerCase().includes(searchTerm.toLowerCase());

  // Skip rendering tool_result/tool_use parts that will be handled by ToolGroupCard
  if (chatParts.length === 0) return null;

  return (
    <div
      className={cn(
        'group relative rounded-lg border transition-all duration-150',
        config.bg, config.border,
        isMatch && 'ring-1 ring-warn/40',
      )}
      data-testid="transcript-message"
    >
      <div className={cn('absolute left-0 top-3 bottom-3 w-[2px] rounded-full', config.stripe)} />

      <div className="pl-4 pr-3 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn('flex items-center justify-center w-5 h-5 rounded-md', config.accent)}>
              <Icon className="h-3 w-3" />
            </div>
            <span className={cn('text-[11px] font-bold uppercase tracking-wider', config.accent)}>
              {config.label}
            </span>
            {item.model && (
              <span className="text-[9px] text-text-muted font-mono bg-surface-elevated/50 px-1.5 py-0.5 rounded-md">
                {item.model}
              </span>
            )}
            {hasThinking && (
              <span className="text-[9px] text-purple/60 flex items-center gap-0.5">
                <Brain className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {totalTokens > 0 && (
              <span className="text-[9px] text-text-muted font-mono">
                {totalTokens.toLocaleString()} tok
              </span>
            )}
            {item.usage && item.usage.cacheReadTokens > 0 && (
              <span className="text-[9px] text-accent/50 font-mono" title="Cache read tokens">
                ↩{item.usage.cacheReadTokens.toLocaleString()}
              </span>
            )}
            {item.timestamp && (
              <span className="flex items-center gap-1 text-[9px] text-text-muted">
                <Clock className="h-2.5 w-2.5" />
                {formatRelativeTime(item.timestamp)}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2 ml-7">
          {chatParts.map((part, i) => (
            <ContentPartRenderer key={`${item.index}-${i}`} part={part} searchTerm={searchTerm} />
          ))}
        </div>
      </div>
    </div>
  );
});

// ── Stats bar ──────────────────────────────────────────────────

function TranscriptStats({ messageCount, totalEvents, toolCallCount, model, parseErrors }: {
  messageCount: number;
  totalEvents: number;
  toolCallCount: number;
  model: string | null;
  parseErrors: number;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border/30 text-[10px] text-text-muted bg-surface-elevated/30">
      <span className="flex items-center gap-1">
        <MessageSquare className="h-3 w-3" />
        {messageCount} messages
      </span>
      {toolCallCount > 0 && (
        <span className="flex items-center gap-1 text-purple/70">
          <Wrench className="h-3 w-3" />
          {toolCallCount} tool calls
        </span>
      )}
      {totalEvents > messageCount && (
        <span className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {totalEvents} total
        </span>
      )}
      {model && (
        <span className="flex items-center gap-1 text-accent/70">
          <Zap className="h-3 w-3" />
          {model}
        </span>
      )}
      {parseErrors > 0 && (
        <span className="flex items-center gap-1 text-warn">
          <AlertTriangle className="h-3 w-3" />
          {parseErrors} parse errors
        </span>
      )}
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────────────

function FilterBar({ mode, onModeChange, counts }: {
  mode: FilterMode;
  onModeChange: (m: FilterMode) => void;
  counts: Record<FilterMode, number>;
}) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border/20 bg-void/30" data-testid="filter-bar">
      <Filter className="h-3 w-3 text-text-muted mr-1" />
      {(Object.entries(filterConfig) as [FilterMode, typeof filterConfig.all][]).map(([key, cfg]) => {
        const Icon = cfg.icon;
        const isActive = mode === key;
        const count = counts[key];
        return (
          <button
            key={key}
            onClick={() => onModeChange(key)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all',
              isActive
                ? 'bg-info/15 text-info border border-info/30'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-elevated/50 border border-transparent',
            )}
          >
            <Icon className="h-3 w-3" />
            {cfg.label}
            <span className={cn(
              'text-[9px] font-mono ml-0.5',
              isActive ? 'text-info/70' : 'text-text-muted/60',
            )}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── CHUNKED RENDERING ──────────────────────────────────────────

const INITIAL_CHUNK = 60;
const LOAD_MORE_CHUNK = 40;

// ── Main component ─────────────────────────────────────────────

export function ConversationReplay({ agentId, sessionKey, onClose }: ConversationReplayProps) {
  const { data: transcript, isLoading, error } = useTranscript(agentId, sessionKey, {
    includeEvents: true,
    includeThinking: true,
    maxContentSize: 500,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolled = useRef(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [visibleCount, setVisibleCount] = useState(INITIAL_CHUNK);

  // Count items by kind
  const kindCounts = useMemo(() => {
    const counts: Record<FilterMode, number> = { all: 0, chat: 0, tools: 0, events: 0 };
    if (!transcript?.items) return counts;
    for (const item of transcript.items) {
      counts.all++;
      if (item.kind === 'chat') counts.chat++;
      else if (item.kind === 'tool_call' || item.kind === 'tool_result') counts.tools++;
      else if (item.kind === 'event') counts.events++;
    }
    return counts;
  }, [transcript]);

  // Filter + search
  const filteredItems = useMemo(() => {
    if (!transcript?.items) return [];
    const allowedKinds = filterConfig[filterMode].kinds;
    return transcript.items.filter((item) => {
      if (!allowedKinds.includes(item.kind)) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return item.contentText.toLowerCase().includes(q)
          || item.summary.toLowerCase().includes(q)
          || (item.toolMeta?.toolName || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [transcript, filterMode, searchTerm]);

  // Group tool pairs
  const timelineItems = useMemo(() => groupToolItems(filteredItems), [filteredItems]);

  // Reset visible count when filter/search changes
  useEffect(() => {
    setVisibleCount(INITIAL_CHUNK);
  }, [filterMode, searchTerm]);

  const hasMore = visibleCount < timelineItems.length;

  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + LOAD_MORE_CHUNK, timelineItems.length));
  }, [timelineItems.length]);

  // Scroll tracking
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (bottomRef.current && typeof bottomRef.current.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Auto-scroll to bottom only on initial transcript load
  useEffect(() => {
    if (transcript && !hasAutoScrolled.current) {
      hasAutoScrolled.current = true;
      // Defer to allow DOM to settle after first render
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [transcript, scrollToBottom]);

  const matchCount = searchTerm ? filteredItems.length : 0;

  const visibleItems = timelineItems.slice(0, visibleCount);

  return (
    <div
      className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden animate-fade-in relative"
      data-testid="conversation-replay"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated/40 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-info/10">
            <MessageSquare className="h-3.5 w-3.5 text-info" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-text-primary block">Session Transcript</span>
            <span className="text-[10px] font-mono text-text-muted block truncate" title={sessionKey}>
              {sessionKey.length > 28 ? `${sessionKey.slice(0, 14)}...${sessionKey.slice(-10)}` : sessionKey}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchTerm(''); }}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              showSearch ? 'text-info bg-info/10' : 'text-text-muted hover:text-text-secondary hover:bg-surface-elevated',
            )}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-elevated transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-border/30 bg-surface-elevated/20 animate-fade-in shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search messages, tool names, results…"
              autoFocus
              className="w-full bg-surface rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted border border-border/30 focus:outline-none focus:border-info/40 focus:ring-1 focus:ring-info/20"
            />
            {searchTerm && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
                {matchCount} match{matchCount !== 1 ? 'es' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filter bar */}
      {transcript && (
        <FilterBar mode={filterMode} onModeChange={setFilterMode} counts={kindCounts} />
      )}

      {/* Stats */}
      {transcript && (
        <TranscriptStats
          messageCount={transcript.messageCount}
          totalEvents={transcript.totalEvents}
          toolCallCount={transcript.toolCallCount}
          model={transcript.model}
          parseErrors={transcript.parseErrors}
        />
      )}

      {/* Timeline body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0"
        onScroll={handleScroll}
        style={{ maxHeight: 'calc(100vh - 320px)', minHeight: '300px' }}
      >
        {isLoading && (
          <div className="space-y-3 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className={cn('w-full', i % 2 === 0 ? 'h-12' : 'h-20')} />
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="transcript-error">
            <AlertTriangle className="h-8 w-8 text-danger/60 mb-3" />
            <p className="text-sm font-medium text-danger">Failed to load transcript</p>
            <p className="text-xs text-text-muted mt-1 max-w-xs">{error.message}</p>
          </div>
        )}

        {!isLoading && !error && timelineItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="conversation-empty">
            <MessageSquare className="h-8 w-8 text-text-muted/30 mb-3" />
            <p className="text-sm text-text-muted">
              {searchTerm ? 'No matching messages' : 'No messages in this session'}
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-info/70 hover:text-info mt-2 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {visibleItems.map((entry) => (
          <div key={isToolGroup(entry) ? `tg-${entry.groupId}` : entry.index} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 60px' }}>
            {isToolGroup(entry) ? (
              <ToolGroupCard
                group={entry}
                agentId={agentId}
                sessionKey={sessionKey}
              />
            ) : entry.kind === 'event' ? (
              <EventRow item={entry} />
            ) : entry.kind === 'tool_result' ? (
              <StandaloneToolResult
                item={entry}
                agentId={agentId}
                sessionKey={sessionKey}
              />
            ) : (
              <ChatMessageCard item={entry} searchTerm={searchTerm} />
            )}
          </div>
        ))}

        {hasMore && (
          <div className="flex justify-center py-3">
            <button
              onClick={loadMore}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-info bg-info/10 border border-info/20 hover:bg-info/20 transition-colors"
            >
              <ArrowDown className="h-3 w-3" />
              Load more ({timelineItems.length - visibleCount} remaining)
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom */}
      {!isAtBottom && timelineItems.length > 5 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-2 rounded-full bg-info/20 text-info border border-info/30 hover:bg-info/30 transition-all shadow-lg animate-fade-in"
          title="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
