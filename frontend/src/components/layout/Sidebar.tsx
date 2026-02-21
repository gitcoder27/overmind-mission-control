import { useNavigate, useMatchRoute } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/uiStore';
import {
  LayoutDashboard,
  FolderKanban,
  Radio,
  Bot,
  Clock,
  Settings,
  Activity,
  ChevronLeft,
  ChevronRight,
  Terminal,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

const navItems: NavItem[] = [
  { label: 'Overview', path: '/', icon: LayoutDashboard },
  { label: 'Command Center', path: '/control', icon: Terminal },
  { label: 'Projects', path: '/projects', icon: FolderKanban },
  { label: 'Live Ops', path: '/live', icon: Radio },
  { label: 'Agents', path: '/agents', icon: Bot },
  { label: 'Scheduling', path: '/scheduling/cron', icon: Clock },
  { label: 'System', path: '/system', icon: Settings },
  { label: 'Health', path: '/system/health', icon: Activity },
];

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-border bg-abyss transition-all duration-300',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className={cn('flex h-14 items-center border-b border-border px-4', collapsed && 'justify-center')}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-dim">
            <span className="text-lg font-bold text-accent">{'\u25C6'}</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold tracking-tight text-text-primary">OVERMIND</h1>
              <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-text-muted">Mission Control</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {navItems.map((item) => {
          // Use exact match for routes that have sibling sub-routes
          // (e.g. /system should not highlight when /system/health is active)
          const hasChildSibling = navItems.some(
            (other) => other !== item && other.path.startsWith(item.path + '/')
          );
          const isActive = item.path === '/'
            ? matchRoute({ to: '/', fuzzy: false })
            : matchRoute({ to: item.path, fuzzy: !hasChildSibling });

          return (
            <button
              key={item.path}
              onClick={() => navigate({ to: item.path })}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-surface-elevated text-accent'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                className={cn(
                  'h-[18px] w-[18px] shrink-0',
                  isActive ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary'
                )}
              />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-border p-2">
        <button
          onClick={toggle}
          className="flex w-full items-center justify-center rounded-lg px-2 py-2 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
