import { useToastStore } from '@/stores/toastStore';
import type { Toast } from '@/stores/toastStore';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const iconMap: Record<Toast['type'], typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap: Record<Toast['type'], { border: string; icon: string; bg: string }> = {
  success: { border: 'border-accent/30', icon: 'text-accent', bg: 'bg-accent-dim' },
  error: { border: 'border-danger/30', icon: 'text-danger', bg: 'bg-danger-dim' },
  info: { border: 'border-info/30', icon: 'text-info', bg: 'bg-info-dim' },
  warning: { border: 'border-warn/30', icon: 'text-warn', bg: 'bg-warn-dim' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const Icon = iconMap[toast.type];
  const colors = colorMap[toast.type];

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-xl animate-fade-in',
        'bg-surface/95',
        colors.border
      )}
    >
      <div className={cn('mt-0.5 shrink-0 rounded-lg p-1', colors.bg)}>
        <Icon className={cn('h-4 w-4', colors.icon)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">{toast.title}</p>
        {toast.message && <p className="mt-0.5 text-xs text-text-muted">{toast.message}</p>}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="mt-0.5 shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
