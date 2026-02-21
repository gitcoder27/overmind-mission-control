import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { ToastContainer } from '@/components/ui/Toast';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useUiStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';

export function RootLayout() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <div className="min-h-screen bg-void bg-grid">
      <Sidebar />
      <div className={cn('transition-all duration-300', collapsed ? 'ml-16' : 'ml-56')}>
        <TopNav />
        <main className="p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <ToastContainer />
      <ConfirmDialogProvider />
    </div>
  );
}
