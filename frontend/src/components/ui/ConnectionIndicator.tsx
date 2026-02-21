import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/uiStore';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

export function ConnectionIndicator() {
  const status = useUiStore((s) => s.connectionStatus);
  const lastUpdated = useUiStore((s) => s.lastUpdated);

  const config = {
    connected: { icon: Wifi, label: 'Connected', color: 'text-accent', bg: 'bg-accent-dim', dot: 'bg-accent' },
    connecting: { icon: Loader2, label: 'Connecting', color: 'text-warn', bg: 'bg-warn-dim', dot: 'bg-warn' },
    reconnecting: { icon: Loader2, label: 'Reconnecting', color: 'text-warn', bg: 'bg-warn-dim', dot: 'bg-warn' },
    disconnected: { icon: WifiOff, label: 'Disconnected', color: 'text-danger', bg: 'bg-danger-dim', dot: 'bg-danger' },
  }[status];

  const Icon = config.icon;

  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs', config.bg)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot, status === 'connected' && 'animate-pulse-dot')} />
      <Icon className={cn('h-3 w-3', config.color, (status === 'connecting' || status === 'reconnecting') && 'animate-spin')} />
      <span className={cn('font-medium', config.color)}>{config.label}</span>
      {lastUpdated && status === 'connected' && (
        <span className="text-text-muted ml-1 hidden sm:inline">{'\u00b7'} Updated {new Date(lastUpdated).toLocaleTimeString()}</span>
      )}
    </div>
  );
}
