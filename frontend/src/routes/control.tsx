import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type FormEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useSnapshot } from '@/queries/useSnapshot';
import { useCreateProject, useManagerChat } from '@/queries/useControl';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import type { IntakeRouteType } from '@/types/domain';
import {
  Rocket,
  MessageSquareText,
  Send,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Zap,
  Search,
  Code2,
  GitMerge,
  ChevronDown,
  Terminal as TerminalIcon,
  Bot,
  User,
  Info,
} from 'lucide-react';

// ──────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────

const DEFAULT_SESSION_KEY = 'dashboard:control';

const ROUTE_OPTIONS: { value: IntakeRouteType; label: string; icon: typeof Zap; desc: string }[] = [
  { value: 'auto', label: 'Auto', icon: Zap, desc: 'Let Overmind decide the best route' },
  { value: 'coding', label: 'Coding', icon: Code2, desc: 'Software engineering tasks' },
  { value: 'research', label: 'Research', icon: Search, desc: 'Investigation and analysis' },
  { value: 'hybrid', label: 'Hybrid', icon: GitMerge, desc: 'Combined coding + research' },
];

const PRIORITY_LEVELS = [
  { value: 1, label: 'Low', color: 'text-text-muted' },
  { value: 2, label: 'Normal', color: 'text-text-secondary' },
  { value: 3, label: 'Medium', color: 'text-info' },
  { value: 4, label: 'High', color: 'text-warn' },
  { value: 5, label: 'Critical', color: 'text-danger' },
];

type TabId = 'intake' | 'chat';

// ──────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────

export function ControlPage() {
  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;
  const initialTab = (searchParams?.tab === 'chat' ? 'chat' : 'intake') as TabId;
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const { data: snapshot } = useSnapshot();
  const orchestratorPaused = snapshot?.orchestrator && !snapshot.orchestrator.running;

  return (
    <div className="space-y-0 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-dim border border-accent/20">
            <TerminalIcon className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Command Center</h2>
            <p className="text-xs text-text-muted mt-0.5">Launch missions & direct the coordinator</p>
          </div>
        </div>
        {orchestratorPaused && (
          <div className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn-dim px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warn" />
            <span className="text-xs font-medium text-warn">Orchestrator paused</span>
          </div>
        )}
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 rounded-xl border border-border bg-abyss p-1 mb-6">
        <TabButton
          active={activeTab === 'intake'}
          onClick={() => setActiveTab('intake')}
          icon={<Rocket className="h-4 w-4" />}
          label="Project Intake"
        />
        <TabButton
          active={activeTab === 'chat'}
          onClick={() => setActiveTab('chat')}
          icon={<MessageSquareText className="h-4 w-4" />}
          label="Manager Console"
        />
      </div>

      {/* ── Tab Content ── */}
      <div className="relative">
        {activeTab === 'intake' ? (
          <IntakeTab orchestratorPaused={!!orchestratorPaused} />
        ) : (
          <ChatTab />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Tab Button
// ──────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
        active
          ? 'bg-surface-elevated text-accent shadow-sm shadow-accent/5'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface/50',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ──────────────────────────────────────────────────────
// Intake Tab
// ──────────────────────────────────────────────────────

function IntakeTab({ orchestratorPaused }: { orchestratorPaused: boolean }) {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const [goal, setGoal] = useState('');
  const [routeType, setRouteType] = useState<IntakeRouteType>('auto');
  const [priority, setPriority] = useState(3);
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const goalRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    goalRef.current?.focus();
  }, []);

  const isValid = goal.trim().length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || createProject.isPending) return;
    try {
      await createProject.mutateAsync({
        goal: goal.trim(),
        routeType,
        priority,
        notes: notes.trim() || undefined,
      });
    } catch {
      // Error handled by mutation's onError callback
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (isValid && !createProject.isPending) {
        const form = (e.target as HTMLElement).closest('form');
        form?.requestSubmit();
      }
    }
  };

  // Success state
  if (createProject.isSuccess && createProject.data) {
    const { projectId } = createProject.data;
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-accent-dim border-2 border-accent/30">
            <CheckCircle2 className="h-10 w-10 text-accent" />
          </div>
        </div>
        <h3 className="text-xl font-bold mb-2">Mission Launched</h3>
        <p className="text-sm text-text-muted mb-1">Project created and queued for orchestration</p>
        <p className="text-xs font-mono text-text-muted/70 mb-8">{projectId}</p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate({ to: '/projects/$projectId', params: { projectId } })}
            className="flex items-center gap-2 rounded-lg bg-accent/10 border border-accent/20 px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/15 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Project
          </button>
          <button
            onClick={() => navigate({ to: '/live' })}
            className="flex items-center gap-2 rounded-lg bg-surface-elevated border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
            View Live Ops
          </button>
          <button
            onClick={() => {
              createProject.reset();
              setGoal('');
              setNotes('');
              setRouteType('auto');
              setPriority(3);
            }}
            className="flex items-center gap-2 rounded-lg bg-surface-elevated border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <Rocket className="h-3.5 w-3.5" />
            New Mission
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
      {/* Orchestrator warning */}
      {orchestratorPaused && (
        <div className="flex items-start gap-3 rounded-lg border border-warn/20 bg-warn-dim px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-warn mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-warn">Orchestrator is paused</p>
            <p className="text-xs text-warn/70 mt-0.5">
              You can still create projects — they'll be queued and processed once the orchestrator resumes.
            </p>
          </div>
        </div>
      )}

      {/* Goal */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Sparkles className="h-3.5 w-3.5" />
          Mission Objective
        </label>
        <div className="relative">
          <textarea
            ref={goalRef}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want Overmind to accomplish..."
            className={cn(
              'w-full rounded-xl border bg-surface px-4 py-3.5 text-sm text-text-primary placeholder:text-text-muted/50',
              'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40',
              'resize-none transition-all duration-200',
              goal.length > 0 ? 'border-accent/20' : 'border-border',
            )}
            rows={3}
            maxLength={2000}
          />
          <span className="absolute bottom-2.5 right-3 text-[10px] font-mono text-text-muted/40">
            {goal.length}/2000
          </span>
        </div>
      </div>

      {/* Route Type Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Route Type</label>
        <div className="grid grid-cols-4 gap-2">
          {ROUTE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = routeType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRouteType(opt.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 transition-all duration-200',
                  isSelected
                    ? 'border-accent/30 bg-accent-dim text-accent'
                    : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text-secondary',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-text-muted/60">
          {ROUTE_OPTIONS.find((o) => o.value === routeType)?.desc}
        </p>
      </div>

      {/* Advanced Options Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')} />
        Advanced Options
      </button>

      {showAdvanced && (
        <div className="space-y-4 animate-fade-in">
          {/* Priority */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Priority</label>
            <div className="flex gap-1.5">
              {PRIORITY_LEVELS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    'flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-all duration-150',
                    priority === p.value
                      ? 'border-accent/30 bg-accent-dim text-accent'
                      : 'border-border bg-surface text-text-muted hover:border-border-strong',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Notes / Context
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context, constraints, or references..."
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 resize-none transition-all"
              rows={2}
              maxLength={5000}
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {createProject.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-dim px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
          <p className="text-xs text-danger">
            {createProject.error instanceof Error ? createProject.error.message : 'Failed to create project'}
          </p>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[11px] text-text-muted/50">
          <kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">⌘</kbd>
          {' + '}
          <kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">Enter</kbd>
          {' to submit'}
        </p>
        <button
          type="submit"
          disabled={!isValid || createProject.isPending}
          className={cn(
            'flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-200',
            isValid && !createProject.isPending
              ? 'bg-accent text-void hover:bg-accent/90 shadow-md shadow-accent/20 hover:shadow-accent/30'
              : 'bg-surface-elevated text-text-muted cursor-not-allowed',
          )}
        >
          {createProject.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              Launch Mission
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────
// Chat Tab
// ──────────────────────────────────────────────────────

function ChatTab() {
  const [sessionKey] = useState(DEFAULT_SESSION_KEY);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isLoadingHistory, isSending, sendMessage, sendError } = useManagerChat(sessionKey);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    try {
      await sendMessage(text);
    } catch {
      // Error handled by the hook's toast
    }
    inputRef.current?.focus();
  }, [input, isSending, sendMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface overflow-hidden animate-fade-in" style={{ height: 'calc(100vh - 250px)', minHeight: 420 }}>
      {/* Chat Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-3 bg-abyss/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-dim border border-purple/20">
          <Bot className="h-4 w-4 text-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Overmind Coordinator</span>
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse-dot" />
          </div>
          <p className="text-[11px] text-text-muted font-mono truncate">session: {sessionKey}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 border border-border">
          <Info className="h-3 w-3 text-text-muted" />
          <span className="text-[10px] text-text-muted">{messages.length} messages</span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scroll-smooth">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            <span className="ml-2 text-sm text-text-muted">Loading conversation...</span>
          </div>
        ) : messages.length === 0 ? (
          <EmptyChatState />
        ) : (
          messages.map((msg, idx) => (
            <ChatBubble key={msg.id || idx} message={msg} />
          ))
        )}

        {isSending && (
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-2 w-2 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-text-muted">Coordinator is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {sendError && (
        <div className="flex items-center gap-2 border-t border-danger/20 bg-danger-dim px-4 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0" />
          <p className="text-xs text-danger">
            {sendError instanceof Error ? sendError.message : 'Message delivery failed'}
          </p>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-border bg-abyss/50 px-4 py-3">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the coordinator..."
            className={cn(
              'flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary',
              'placeholder:text-text-muted/50 resize-none',
              'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40',
              'transition-all duration-200',
              'max-h-32',
            )}
            rows={1}
            disabled={isSending}
            style={{
              height: 'auto',
              minHeight: '44px',
              maxHeight: '128px',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 shrink-0',
              input.trim() && !isSending
                ? 'bg-accent text-void hover:bg-accent/90 shadow-md shadow-accent/20'
                : 'bg-surface-elevated text-text-muted cursor-not-allowed border border-border',
            )}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-text-muted/40 text-right">
          <kbd className="rounded border border-border/50 px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send
          {' · '}
          <kbd className="rounded border border-border/50 px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Chat Sub-Components
// ──────────────────────────────────────────────────────

function EmptyChatState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-full bg-purple/10 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-elevated border border-border">
          <MessageSquareText className="h-8 w-8 text-purple/60" />
        </div>
      </div>
      <h4 className="text-sm font-semibold mb-1">Manager Console</h4>
      <p className="text-xs text-text-muted max-w-xs">
        Chat directly with the Overmind coordinator. Ask about project status, give instructions, or review operations.
      </p>
      <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-md">
        {['What projects are running?', 'Summarize today\'s progress', 'Check for blockers'].map((q) => (
          <span
            key={q}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] text-text-muted hover:text-text-secondary hover:border-border-strong cursor-default transition-colors"
          >
            {q}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({
  message,
}: {
  message: { id?: string; role: string; content: string; timestamp: string | null };
}) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5',
          isUser
            ? 'bg-info-dim border border-info/20'
            : 'bg-purple-dim border border-purple/20',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5 text-info" /> : <Bot className="h-3.5 w-3.5 text-purple" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-info/10 border border-info/15 text-text-primary rounded-tr-md'
            : 'bg-surface-elevated border border-border text-text-primary rounded-tl-md',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
        {message.timestamp && (
          <p className={cn('mt-1.5 text-[10px]', isUser ? 'text-info/40 text-right' : 'text-text-muted/40')}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}
