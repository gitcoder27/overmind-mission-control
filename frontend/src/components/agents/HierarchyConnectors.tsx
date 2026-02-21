/**
 * HierarchyConnectors – Desktop-only visual connectors between tier lanes.
 * Pure presentational SVG/CSS. Hidden on mobile via lg: breakpoint.
 */
export function HierarchyConnector({ from, to }: { from: 'manager' | 'lead'; to: 'lead' | 'worker' }) {
  const colors = {
    'manager-lead': { stroke: 'rgba(167, 139, 250, 0.25)', glow: 'rgba(167, 139, 250, 0.08)' },
    'lead-worker': { stroke: 'rgba(59, 130, 246, 0.20)', glow: 'rgba(59, 130, 246, 0.06)' },
  };
  const key = `${from}-${to}` as keyof typeof colors;
  const c = colors[key];

  return (
    <div className="hidden lg:flex justify-center py-1" aria-hidden="true">
      <svg
        width="120"
        height="36"
        viewBox="0 0 120 36"
        fill="none"
        className="overflow-visible"
      >
        {/* Central vertical line */}
        <line
          x1="60" y1="0" x2="60" y2="36"
          stroke={c.stroke}
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        {/* Branching arms */}
        <line x1="30" y1="36" x2="60" y2="18" stroke={c.stroke} strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="90" y1="36" x2="60" y2="18" stroke={c.stroke} strokeWidth="1.5" strokeDasharray="3 3" />
        {/* Glow dot at center */}
        <circle cx="60" cy="18" r="3" fill={c.glow} stroke={c.stroke} strokeWidth="1" />
      </svg>
    </div>
  );
}
