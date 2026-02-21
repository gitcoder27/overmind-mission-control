import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDataProvider } from '@/providers/data';
import { queryKeys } from './keys';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';

// ────────────────────────────────────────────────────
// Project mutations
// ────────────────────────────────────────────────────

export function useApproveProject() {
  const provider = useDataProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      await provider.approveProject(id, notes);
    },
    onMutate: async ({ id }) => {
      // Optimistic: update project status in cache
      await queryClient.cancelQueries({ queryKey: queryKeys.project(id) });
      const prev = queryClient.getQueryData(queryKeys.project(id));
      queryClient.setQueryData(queryKeys.project(id), (old: unknown) => {
        if (old && typeof old === 'object' && 'status' in old) {
          return { ...old, status: 'COMPLETED' };
        }
        return old;
      });
      return { prev };
    },
    onError: (_err, { id }, context) => {
      if (context?.prev) {
        queryClient.setQueryData(queryKeys.project(id), context.prev);
      }
      toast('error', 'Approve failed', _err instanceof Error ? _err.message : 'Unknown error');
    },
    onSuccess: () => {
      toast('success', 'Project approved');
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useRequestChanges() {
  const provider = useDataProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      await provider.requestChanges(id, notes);
    },
    onError: (_err) => {
      toast('error', 'Request changes failed', _err instanceof Error ? _err.message : 'Unknown error');
    },
    onSuccess: () => {
      toast('success', 'Changes requested');
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useSetProjectStatus() {
  const provider = useDataProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) => {
      const confirmed = await confirm({
        title: `Set project to ${status}?`,
        message: `This will change the project status to ${status}. ${reason ? `Reason: ${reason}` : ''}`,
        confirmLabel: `Set ${status}`,
        variant: status === 'ARCHIVED' || status === 'FAILED' ? 'danger' : 'warning',
      });
      if (!confirmed) throw new Error('Cancelled');
      await provider.setProjectStatus(id, status, reason);
    },
    onError: (_err) => {
      if (_err instanceof Error && _err.message === 'Cancelled') return;
      toast('error', 'Status change failed', _err instanceof Error ? _err.message : 'Unknown error');
    },
    onSuccess: () => {
      toast('success', 'Project status updated');
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

// ────────────────────────────────────────────────────
// Orchestrator mutations
// ────────────────────────────────────────────────────

export function usePauseOrchestrator() {
  const provider = useDataProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const confirmed = await confirm({
        title: 'Pause orchestrator?',
        message: 'This will stop the orchestrator from processing new tasks. Running attempts will continue until completion.',
        confirmLabel: 'Pause',
        variant: 'warning',
      });
      if (!confirmed) throw new Error('Cancelled');
      await provider.pauseOrchestrator();
    },
    onError: (_err) => {
      if (_err instanceof Error && _err.message === 'Cancelled') return;
      toast('error', 'Pause failed', _err instanceof Error ? _err.message : 'Unknown error');
    },
    onSuccess: () => {
      toast('success', 'Orchestrator paused');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: queryKeys.systemHealth });
    },
  });
}

export function useResumeOrchestrator() {
  const provider = useDataProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await provider.resumeOrchestrator();
    },
    onSuccess: () => {
      toast('success', 'Orchestrator resumed');
    },
    onError: (_err) => {
      toast('error', 'Resume failed', _err instanceof Error ? _err.message : 'Unknown error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: queryKeys.systemHealth });
    },
  });
}

// ────────────────────────────────────────────────────
// Cron mutations
// ────────────────────────────────────────────────────

export function useToggleCronJob() {
  const provider = useDataProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const action = enabled ? 'disable' : 'enable';
      const confirmed = await confirm({
        title: `${enabled ? 'Disable' : 'Enable'} cron job?`,
        message: `This will ${action} the scheduled job. ${enabled ? 'It will no longer run automatically.' : 'It will start running on schedule.'}`,
        confirmLabel: enabled ? 'Disable' : 'Enable',
        variant: enabled ? 'warning' : 'default',
      });
      if (!confirmed) throw new Error('Cancelled');
      if (enabled) {
        await provider.disableCronJob(id);
      } else {
        await provider.enableCronJob(id);
      }
    },
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.cronJobs });
      const prev = queryClient.getQueryData(queryKeys.cronJobs);
      // Optimistic toggle
      queryClient.setQueryData(queryKeys.cronJobs, (old: unknown) => {
        if (Array.isArray(old)) {
          return old.map((j: { id: string; enabled: boolean }) =>
            j.id === id ? { ...j, enabled: !enabled } : j
          );
        }
        return old;
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (_err instanceof Error && _err.message === 'Cancelled') {
        // Rollback optimistic update
        if (context?.prev) {
          queryClient.setQueryData(queryKeys.cronJobs, context.prev);
        }
        return;
      }
      if (context?.prev) {
        queryClient.setQueryData(queryKeys.cronJobs, context.prev);
      }
      toast('error', 'Toggle failed', _err instanceof Error ? _err.message : 'Unknown error');
    },
    onSuccess: (_data, { enabled }) => {
      toast('success', `Cron job ${enabled ? 'disabled' : 'enabled'}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
    },
  });
}

export function useRunCronJob() {
  const provider = useDataProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const confirmed = await confirm({
        title: 'Run cron job now?',
        message: 'This will trigger an immediate execution of this cron job outside its regular schedule.',
        confirmLabel: 'Run Now',
        variant: 'warning',
      });
      if (!confirmed) throw new Error('Cancelled');
      await provider.runCronJob(id);
    },
    onError: (_err) => {
      if (_err instanceof Error && _err.message === 'Cancelled') return;
      toast('error', 'Run failed', _err instanceof Error ? _err.message : 'Unknown error');
    },
    onSuccess: () => {
      toast('success', 'Cron job triggered');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cronJobs });
    },
  });
}
