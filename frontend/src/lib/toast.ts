import { useToastStore } from '@/stores/toastStore';
import type { Toast } from '@/stores/toastStore';

/** Convenience function usable outside of React rendering */
export function toast(type: Toast['type'], title: string, message?: string) {
  useToastStore.getState().addToast({ type, title, message });
}
