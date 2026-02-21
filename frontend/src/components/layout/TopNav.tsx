import { ConnectionIndicator } from '@/components/ui/ConnectionIndicator';
import { useSnapshot } from '@/queries/useSnapshot';
import { HealthPill } from '@/components/ui/HealthPill';
import { Bell } from 'lucide-react';

export function TopNav() {
  const { data: snapshot } = useSnapshot();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-abyss/80 backdrop-blur-xl px-6">
      <div className="flex items-center gap-3">
        {snapshot?.health && (
          <HealthPill status={snapshot.health.overall} label={`System ${snapshot.health.overall}`} />
        )}
        {snapshot?.orchestrator && (
          <span className="text-xs font-mono text-text-muted">
            Cursor: {snapshot.orchestrator.cursorPosition}
            {snapshot.orchestrator.stagnant && (
              <span className="ml-1 text-warn">(stagnant)</span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <ConnectionIndicator />
        {snapshot && snapshot.alerts.length > 0 && (
          <div className="relative">
            <Bell className="h-4 w-4 text-text-secondary" />
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
              {snapshot.alerts.length}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
