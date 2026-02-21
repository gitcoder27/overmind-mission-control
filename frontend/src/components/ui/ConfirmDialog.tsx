import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { confirmChannel } from '@/lib/confirm';
import type { ConfirmDialogState } from '@/lib/confirm';
import { AlertTriangle } from 'lucide-react';

const variantStyles: Record<string, { button: string; icon: string }> = {
  danger: { button: 'bg-danger text-white hover:bg-danger/80', icon: 'text-danger' },
  warning: { button: 'bg-warn text-void hover:bg-warn/80', icon: 'text-warn' },
  default: { button: 'bg-accent text-void hover:bg-accent/80', icon: 'text-info' },
};

/**
 * Mount this once at the app root level to provide the confirmation dialog UI.
 */
export function ConfirmDialogProvider() {
  const [state, setState] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    confirmChannel.push = setState;
    return () => {
      confirmChannel.push = null;
    };
  }, []);

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    setState(null);
  }, [state]);

  if (!state) return null;

  const variant = variantStyles[state.variant || 'default'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-void/60 backdrop-blur-sm" onClick={handleCancel} />
      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-fade-in">
        <div className="flex items-start gap-4">
          <div className={cn('shrink-0 rounded-xl bg-surface-elevated p-2.5', variant.icon)}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-text-primary">{state.title}</h3>
            <p className="mt-1.5 text-sm text-text-muted leading-relaxed">{state.message}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors"
          >
            {state.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            className={cn('rounded-lg px-4 py-2 text-sm font-bold transition-colors', variant.button)}
          >
            {state.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
