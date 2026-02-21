/**
 * TemperatureBar — horizontal bars with color zones for sensor temperatures.
 */

import { cn } from '@/lib/utils';
import { Thermometer } from 'lucide-react';
import type { TemperatureReading } from '@/types/metrics';

interface TemperatureBarProps {
  readings: TemperatureReading[];
  className?: string;
}

function tempColor(current: number, high: number | null): string {
  const threshold = high ?? 80;
  if (current >= threshold) return 'bg-danger';
  if (current >= threshold * 0.85) return 'bg-warn';
  return 'bg-accent';
}

function tempPercent(current: number, critical: number | null): number {
  const max = critical ?? 100;
  return Math.min(100, (current / max) * 100);
}

export function TemperatureBar({ readings, className }: TemperatureBarProps) {
  if (readings.length === 0) return null;

  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Thermometer className="h-4 w-4 text-danger" />
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Temperatures</h4>
      </div>
      <div className="space-y-2.5">
        {readings.map((t) => (
          <div key={t.label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[10px] font-mono text-text-muted" title={t.label}>
              {t.label}
            </span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-elevated">
              <div
                className={cn('h-full rounded-full transition-all duration-700 ease-out', tempColor(t.current, t.high))}
                style={{ width: `${tempPercent(t.current, t.critical)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-[10px] font-mono text-text-secondary">
              {t.current.toFixed(0)}°C
              {t.high != null && ` / ${t.high.toFixed(0)}°C`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
