import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAgent, useAgentFiles, useAgentFileContent, useAgentSessions } from '@/queries/useSnapshot';
import { ConversationReplay } from '@/components/agents/ConversationReplay';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { cn, getAgentRoleIcon, formatDuration, formatRelativeTime, shortId } from '@/lib/utils';
import {
  ArrowLeft, FileText, MessageSquare, Clock, CheckCircle2, XCircle, Copy, Hash,
  Play, Search, SortDesc, Filter, Download, ChevronRight, Activity, Zap, X,
  Terminal,
} from 'lucide-react';
import type { AgentFileInfo, AgentSession } from '@/types/domain';

// ── Constants & config ─────────────────────────────────────────

const statusColors: Record<string, { dot: string; text: string; label: string }> = {
  idle: { dot: 'bg-accent', text: 'text-accent', label: 'Idle' },
  busy: { dot: 'bg-info', text: 'text-info', label: 'Busy' },
  offline: { dot: 'bg-text-muted', text: 'text-text-muted', label: 'Offline' },
};

const modelSourceBadge: Record<string, { bg: string; text: string; label: string }> = {
  primary: { bg: 'bg-accent/15', text: 'text-accent', label: 'Primary' },
  default: { bg: 'bg-info/15', text: 'text-info', label: 'Default' },
  unknown: { bg: 'bg-warn/15', text: 'text-warn', label: 'Unknown' },
};

// ── Shared micro-components ────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCopy(e as unknown as React.MouseEvent); }}
      className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
      title="Copy to clipboard"
    >
      <Copy className="h-3 w-3" />
      {copied ? 'Copied' : ''}
    </span>
  );
}

// ── Markdown viewer ────────────────────────────────────────────

function MarkdownViewer({ content }: { content: string }) {
  const lines = content.split('\n');
  const rendered: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const key = `md-${i}`;

    if (line.startsWith('### ')) {
      rendered.push(<h3 key={key} className="text-sm font-bold mt-4 mb-1.5 text-text-primary">{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      rendered.push(<h2 key={key} className="text-base font-bold mt-5 mb-2 text-text-primary border-b border-border/30 pb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      rendered.push(<h1 key={key} className="text-lg font-bold mt-6 mb-2 text-text-primary">{line.slice(2)}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      rendered.push(
        <div key={key} className="flex gap-2 ml-2 text-sm text-text-secondary leading-relaxed">
          <span className="text-accent mt-0.5 shrink-0">•</span>
          <span>{line.slice(2)}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.+)/);
      if (match) {
        rendered.push(
          <div key={key} className="flex gap-2 ml-2 text-sm text-text-secondary leading-relaxed">
            <span className="text-info/60 font-mono text-xs mt-0.5 shrink-0 w-5 text-right">{match[1]}.</span>
            <span>{match[2]}</span>
          </div>
        );
      }
    } else if (line.startsWith('```')) {
      const codeLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) {
        codeLines.push(lines[j]);
        j++;
      }
      rendered.push(
        <pre key={key} className="bg-void/60 border border-border/20 rounded-lg p-3 my-2 text-xs font-mono text-text-secondary overflow-x-auto">
          {codeLines.join('\n')}
        </pre>
      );
      i = j;
    } else if (line.trim() === '') {
      rendered.push(<div key={key} className="h-2" />);
    } else {
      rendered.push(
        <p key={key} className="text-sm text-text-secondary leading-relaxed">
          {line}
        </p>
      );
    }
  }

  return <div className="space-y-0.5">{rendered}</div>;
}

// ── Document tab (file switcher) ───────────────────────────────

function FileTab({ file, isActive, onClick }: { file: AgentFileInfo; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
        isActive
          ? 'bg-accent/15 text-accent border border-accent/30 shadow-sm shadow-accent/5'
          : file.exists
            ? 'bg-surface-elevated/60 text-text-secondary hover:bg-surface-elevated hover:text-text-primary border border-border/30 hover:border-border-strong'
            : 'bg-surface/40 text-text-muted border border-border/10 opacity-40 cursor-not-allowed'
      )}
      disabled={!file.exists}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span>{file.name}</span>
      {file.exists ? (
        <CheckCircle2 className="h-3 w-3 text-accent shrink-0" />
      ) : (
        <XCircle className="h-3 w-3 text-danger/50 shrink-0" />
      )}
    </button>
  );
}

// ── Session card ───────────────────────────────────────────────

function SessionCard({
  session,
  isActive,
  onSelect,
}: {
  session: AgentSession;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left group rounded-lg border transition-all duration-150 p-3',
        isActive
          ? 'bg-info/8 border-info/30 shadow-sm shadow-info/5'
          : 'bg-surface border-border/20 hover:border-border-strong hover:bg-surface-elevated/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-info' : 'text-text-muted')} />
            <span className={cn('text-xs font-mono font-semibold truncate', isActive ? 'text-info' : 'text-text-primary')}>
              {shortId(session.sessionKey)}
            </span>
            <CopyButton text={session.sessionKey} />
          </div>
          <div className="flex items-center gap-3 ml-5.5">
            {session.messageCount != null && (
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                <Activity className="h-2.5 w-2.5" />
                {session.messageCount} msgs
              </span>
            )}
            {session.updatedAt && (
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatRelativeTime(session.updatedAt)}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className={cn(
          'h-4 w-4 shrink-0 mt-0.5 transition-transform',
          isActive ? 'text-info rotate-0' : 'text-text-muted/40 group-hover:text-text-muted',
        )} />
      </div>
    </button>
  );
}

// ── Empty state helper ─────────────────────────────────────────

function EmptyPanel({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-8 w-8 text-text-muted/20 mb-3" />
      <p className="text-sm text-text-muted">{title}</p>
      {subtitle && <p className="text-xs text-text-muted/60 mt-1">{subtitle}</p>}
    </div>
  );
}

// ── Main page component ────────────────────────────────────────

export function AgentDetailPage({ agentId }: { agentId: string }) {
  const { data: agent, isLoading, error: agentError, refetch } = useAgent(agentId);
  const { data: files } = useAgentFiles(agentId);
  const { data: sessions } = useAgentSessions(agentId);

  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionSortDesc, setSessionSortDesc] = useState(true);

  // File state
  const activeFileKey = selectedFileKey || files?.find((f) => f.exists)?.key || null;
  const { data: fileContent, isLoading: fileLoading } = useAgentFileContent(agentId, activeFileKey || '');

  // Session filtering & sorting
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    let result = [...sessions];

    // Search
    if (sessionSearch) {
      const q = sessionSearch.toLowerCase();
      result = result.filter((s) =>
        s.sessionKey.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return sessionSortDesc ? tb - ta : ta - tb;
    });

    return result;
  }, [sessions, sessionSearch, sessionSortDesc]);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 bg-surface-elevated rounded animate-pulse" />
          <div className="h-6 w-48 bg-surface-elevated rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  // ── Error ──
  if (agentError) {
    return <ErrorState message={agentError.message} onRetry={() => refetch()} />;
  }

  if (!agent) {
    return <ErrorState message={`Agent not found: ${agentId}`} />;
  }

  const st = statusColors[agent.status] || statusColors.offline;
  const ms = modelSourceBadge[agent.modelSource || 'unknown'];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Back nav */}
      <Link
        to="/agents"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors group"
      >
        <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
        Back to Agents
      </Link>

      {/* ═══════════════════════════════════════════════════════
          HEADER CARD
          ═══════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-elevated text-xl border border-border/40 shrink-0">
              {getAgentRoleIcon(agent.role)}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold flex items-center gap-2 flex-wrap">
                <span className="truncate">{agent.name}</span>
                <span className={cn('h-2 w-2 rounded-full shrink-0', st.dot, agent.status === 'busy' && 'animate-pulse-dot')} />
                <span className={cn('text-[10px] font-medium shrink-0', st.text)}>{st.label}</span>
              </h1>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="text-[11px] text-text-muted capitalize">{agent.role}</span>
                <span className="text-[10px] text-text-muted font-mono flex items-center gap-1">
                  <Hash className="h-2.5 w-2.5" />
                  {agent.id}
                  <CopyButton text={agent.id} />
                </span>
                {agent.registered !== undefined && (
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium',
                    agent.registered ? 'bg-accent/10 text-accent' : 'bg-warn/10 text-warn'
                  )}>
                    {agent.registered ? '✓ Registered' : '⚠ Unregistered'}
                  </span>
                )}
              </div>
            </div>
          </div>
          {agent.role === 'coordinator' && (
            <ManagerConsoleButton />
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-5 pt-4 border-t border-border/20">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Model</p>
            <p className="text-sm font-bold font-mono truncate" title={agent.effectiveModel || '—'}>
              {agent.effectiveModel || '—'}
            </p>
            <span className={cn('inline-block mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold', ms.bg, ms.text)}>
              {ms.label}
            </span>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Success Rate</p>
            <p className={cn('text-sm font-bold', agent.successRate >= 90 ? 'text-accent' : agent.successRate >= 70 ? 'text-warn' : 'text-danger')}>
              {agent.successRate}%
            </p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Avg Duration</p>
            <p className="text-sm font-bold">{formatDuration(agent.avgDuration)}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Total Attempts</p>
            <p className="text-sm font-bold">{agent.totalAttempts}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Profile</p>
            {agent.profileHealth ? (
              <span className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                agent.profileHealth.ok ? 'text-accent' : 'text-warn'
              )}>
                {agent.profileHealth.ok ? (
                  <><CheckCircle2 className="h-3.5 w-3.5" /> Complete</>
                ) : (
                  <><XCircle className="h-3.5 w-3.5" /> {agent.profileHealth.missingFiles.length} missing</>
                )}
              </span>
            ) : (
              <span className="text-xs text-text-muted">—</span>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MAIN CONTENT: Documents + Sessions / Transcript
          ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* ── LEFT: Profile Documents (5 cols) ──────────────── */}
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple" />
            Profile Documents
            {files && (
              <span className="text-[10px] text-text-muted font-normal ml-1">
                {files.filter(f => f.exists).length}/{files.length}
              </span>
            )}
          </h2>

          {/* Sticky file tabs */}
          <div className="flex flex-wrap gap-1.5 sticky top-0 z-10 bg-abyss/80 backdrop-blur-sm py-2 -mx-1 px-1">
            {(files || []).map((f) => (
              <FileTab
                key={f.key}
                file={f}
                isActive={f.key === activeFileKey}
                onClick={() => f.exists && setSelectedFileKey(f.key)}
              />
            ))}
          </div>

          {/* Content viewer */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            {/* File header */}
            {activeFileKey && fileContent && (
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-surface-elevated/30">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-purple/70" />
                  <span className="text-xs font-semibold text-text-primary">{fileContent.name}</span>
                  <span className="text-[9px] text-text-muted font-mono">
                    {(fileContent.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(fileContent.content);
                    }}
                    className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors"
                    title="Copy content"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([fileContent.content], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = fileContent.name;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors"
                    title="Download"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* File body */}
            <div className="p-4 max-h-[500px] overflow-y-auto">
              {!activeFileKey && (
                <EmptyPanel icon={FileText} title="No profile files available" subtitle="Register this agent to create profile documents" />
              )}
              {activeFileKey && fileLoading && (
                <div className="space-y-2">
                  <div className="h-4 w-3/4 bg-surface-elevated rounded animate-pulse" />
                  <div className="h-3 w-full bg-surface-elevated rounded animate-pulse" />
                  <div className="h-3 w-5/6 bg-surface-elevated rounded animate-pulse" />
                  <div className="h-3 w-2/3 bg-surface-elevated rounded animate-pulse" />
                </div>
              )}
              {activeFileKey && !fileLoading && fileContent && (
                <MarkdownViewer content={fileContent.content} />
              )}
              {activeFileKey && !fileLoading && !fileContent && (
                <EmptyPanel icon={FileText} title="Could not load file" subtitle="The file may have been removed or is inaccessible" />
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Sessions + Transcript (7 cols) ─────────── */}
        <div className="lg:col-span-7 space-y-3">
          {/* Sessions header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-info" />
              Sessions
              {sessions && (
                <span className="text-[10px] text-text-muted font-normal ml-1">
                  ({sessions.length})
                </span>
              )}
            </h2>
            <div className="flex items-center gap-1.5">
              {/* Sort toggle */}
              <button
                onClick={() => setSessionSortDesc(!sessionSortDesc)}
                className={cn(
                  'p-1.5 rounded-md text-text-muted hover:text-text-secondary transition-colors',
                  !sessionSortDesc && 'rotate-180',
                )}
                title={sessionSortDesc ? 'Newest first' : 'Oldest first'}
              >
                <SortDesc className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Session search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-muted" />
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder="Search sessions by ID..."
              className="w-full bg-surface rounded-lg pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted border border-border/30 focus:outline-none focus:border-info/40 focus:ring-1 focus:ring-info/20"
            />
            {sessionSearch && (
              <button
                onClick={() => setSessionSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Session list */}
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto rounded-lg">
            {filteredSessions.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-4">
                <EmptyPanel
                  icon={MessageSquare}
                  title={sessionSearch ? 'No matching sessions' : 'No sessions found'}
                  subtitle={sessionSearch ? 'Try a different search term' : 'Sessions will appear once the agent runs'}
                />
              </div>
            ) : (
              filteredSessions.map((s) => (
                <SessionCard
                  key={s.sessionKey}
                  session={s}
                  isActive={activeSessionKey === s.sessionKey}
                  onSelect={() => setActiveSessionKey(
                    activeSessionKey === s.sessionKey ? null : s.sessionKey
                  )}
                />
              ))
            )}
          </div>

          {/* Transcript viewer */}
          {activeSessionKey && (
            <div className="mt-3 animate-fade-in">
              <ConversationReplay
                agentId={agentId}
                sessionKey={activeSessionKey}
                onClose={() => setActiveSessionKey(null)}
              />
            </div>
          )}

          {/* No session selected hint */}
          {!activeSessionKey && filteredSessions.length > 0 && (
            <div className="rounded-xl border border-border/30 border-dashed bg-surface/50 p-6">
              <EmptyPanel
                icon={Play}
                title="Select a session to view its transcript"
                subtitle="Click on any session above to inspect the full conversation"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manager Console Deep-Link ─────────────────────────────────

function ManagerConsoleButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate({ to: '/control', search: { tab: 'chat' } })}
      className="flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15 transition-colors whitespace-nowrap"
    >
      <Terminal className="h-3 w-3" />
      Open Manager Console
    </button>
  );
}
