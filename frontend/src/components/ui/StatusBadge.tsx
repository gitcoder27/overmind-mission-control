import { cn, getStatusColor } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  pulse?: boolean;
}

const colorClasses: Record<string, { bg: string; text: string; dot: string }> = {
  accent: { bg: 'bg-accent-dim', text: 'text-accent', dot: 'bg-accent' },
  info: { bg: 'bg-info-dim', text: 'text-info', dot: 'bg-info' },
  warn: { bg: 'bg-warn-dim', text: 'text-warn', dot: 'bg-warn' },
  danger: { bg: 'bg-danger-dim', text: 'text-danger', dot: 'bg-danger' },
  purple: { bg: 'bg-purple-dim', text: 'text-purple', dot: 'bg-purple' },
  'text-muted': { bg: 'bg-surface-elevated', text: 'text-text-muted', dot: 'bg-text-muted' },
};

export function StatusBadge({ status, size = 'sm', pulse }: StatusBadgeProps) {
  const colorKey = getStatusColor(status);
  const colors = colorClasses[colorKey] || colorClasses['text-muted'];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        colors.bg,
        colors.text,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      )}
    >
      <span
        className={cn(
          'rounded-full',
          colors.dot,
          size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
          pulse && 'animate-pulse-dot'
        )}
      />
      {status.replace(/_/g, ' ')}
    </span>
  );
}
