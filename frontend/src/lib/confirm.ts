export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

export interface ConfirmDialogState extends ConfirmDialogOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Singleton channel: the ConfirmDialogProvider registers here, `confirm()` pushes requests.
 */
export const confirmChannel = {
  push: null as ((s: ConfirmDialogState) => void) | null,
};

/**
 * Imperative confirm dialog API.
 * Returns a promise that resolves to true (confirmed) or false (cancelled).
 */
export function confirm(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (confirmChannel.push) {
      confirmChannel.push({ ...options, resolve });
    } else {
      resolve(false);
    }
  });
}
