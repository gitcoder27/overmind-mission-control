import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'info',
    WAITING_USER_APPROVAL: 'warn',
    COMPLETED: 'accent',
    DONE: 'accent',
    SUCCEEDED: 'accent',
    BLOCKED: 'danger',
    FAILED: 'danger',
    QUEUED: 'text-muted',
    TODO: 'text-muted',
    READY: 'info',
    IN_PROGRESS: 'info',
    RUNNING: 'info',
    REVIEW: 'warn',
    TIMEOUT: 'warn',
    CANCELLED: 'text-muted',
    ARCHIVED: 'text-muted',
  };
  return map[status] || 'text-muted';
}

export function getAgentRoleIcon(role: string): string {
  const map: Record<string, string> = {
    coordinator: '\u2318',
    architect: '\u25B3',
    builder: '\u2692',
    scout: '\u2609',
    oracle: '\u25C6',
    qa: '\u2714',
  };
  return map[role] || '\u25CF';
}

export function progressPercent(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}
