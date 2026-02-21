/**
 * SparklineChart — tiny SVG polyline showing the last N data points.
 */

import { cn } from '@/lib/utils';

interface SparklineChartProps {
  data: number[];
  max?: number;
  color?: 'accent' | 'info' | 'warn' | 'danger';
  width?: number;
  height?: number;
  className?: string;
}

const STROKE_COLORS: Record<string, string> = {
  accent: '#22d3a7',
  info: '#3b82f6',
  warn: '#f59e0b',
  danger: '#ef4444',
};

const FILL_COLORS: Record<string, string> = {
  accent: 'rgba(34,211,167,0.08)',
  info: 'rgba(59,130,246,0.08)',
  warn: 'rgba(245,158,11,0.08)',
  danger: 'rgba(239,68,68,0.08)',
};

export function SparklineChart({
  data,
  max: maxOverride,
  color = 'accent',
  width = 120,
  height = 32,
  className,
}: SparklineChartProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className={cn('block', className)}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={STROKE_COLORS[color]}
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity={0.3}
        />
      </svg>
    );
  }

  const pad = 2;
  const maxVal = maxOverride ?? Math.max(...data, 1);
  const step = (width - pad * 2) / (data.length - 1);

  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = height - pad - ((v / maxVal) * (height - pad * 2));
    return `${x},${y}`;
  });

  const polyline = points.join(' ');
  // Area fill: close the path at the bottom
  const areaPath = `M${points[0]} ${points.slice(1).map((p) => `L${p}`).join(' ')} L${pad + (data.length - 1) * step},${height - pad} L${pad},${height - pad} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('block', className)}
    >
      <path d={areaPath} fill={FILL_COLORS[color]} />
      <polyline
        points={polyline}
        fill="none"
        stroke={STROKE_COLORS[color]}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
