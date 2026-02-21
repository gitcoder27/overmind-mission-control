/**
 * MetricGauge — SVG circular gauge for CPU%, RAM%, Disk%.
 *
 * Animated arc drawn with stroke-dasharray.  The arc is rendered
 * on a 120×120 SVG viewBox with a 270° sweep starting from 135°.
 */

import { cn } from '@/lib/utils';

interface MetricGaugeProps {
  label: string;
  value: number; // 0–100
  color: 'accent' | 'info' | 'warn';
  subtitle?: string;
  className?: string;
}

const COLOR_MAP: Record<string, { stroke: string; glow: string; text: string }> = {
  accent: { stroke: 'stroke-accent', glow: 'drop-shadow(0 0 6px rgba(34,211,167,0.4))', text: 'text-accent' },
  info: { stroke: 'stroke-info', glow: 'drop-shadow(0 0 6px rgba(59,130,246,0.4))', text: 'text-info' },
  warn: { stroke: 'stroke-warn', glow: 'drop-shadow(0 0 6px rgba(245,158,11,0.4))', text: 'text-warn' },
};

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SWEEP = 0.75; // 270° arc
const ARC_LENGTH = CIRCUMFERENCE * SWEEP;

export function MetricGauge({ label, value, color, subtitle, className }: MetricGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const offset = ARC_LENGTH - (ARC_LENGTH * clamped) / 100;
  const c = COLOR_MAP[color];

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-[0deg]">
        {/* Track (background arc) */}
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          className="text-surface-elevated"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          strokeDashoffset="0"
          transform="rotate(135 60 60)"
        />
        {/* Value arc */}
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          className={c.stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          strokeDashoffset={offset}
          transform="rotate(135 60 60)"
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)',
            filter: c.glow,
          }}
        />
        {/* Percentage text */}
        <text
          x="60"
          y="56"
          textAnchor="middle"
          dominantBaseline="central"
          className={cn('fill-current font-mono text-[22px] font-bold', c.text)}
        >
          {Math.round(clamped)}%
        </text>
        <text
          x="60"
          y="76"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-current text-text-muted text-[10px] font-medium tracking-wide uppercase"
        >
          {label}
        </text>
      </svg>
      {subtitle && (
        <span className="mt-1 text-[11px] font-mono text-text-muted">{subtitle}</span>
      )}
    </div>
  );
}
