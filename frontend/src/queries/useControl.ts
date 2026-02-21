import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataProvider } from '@/providers/data';
import { queryKeys } from './keys';
import { toast } from '@/lib/toast';
import type { IntakeRequest, ManagerChatMessage } from '@/types/domain';

// ────────────────────────────────────────────────────
// Project Intake
// ────────────────────────────────────────────────────

export function useCreateProject() {
  const provider = useDataProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (intake: IntakeRequest) => {
      return provider.createProject(intake);
    },
    onSuccess: (data) => {
      toast('success', 'Project created', `ID: ${data.projectId}`);
    },
    onError: (err) => {
      toast('error', 'Project creation failed', err instanceof Error ? err.message : 'Unknown error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// ────────────────────────────────────────────────────
// Manager Chat
// ────────────────────────────────────────────────────

/**
 * Tracks local chat messages in-memory so we get instant UX.
 * The backend session history is the source of truth, but we
 * optimistically append user/assistant turns.
 */
export function useManagerChat(sessionKey: string) {
  const provider = useDataProvider();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: queryKeys.managerSession(sessionKey),
    queryFn: async () => {
      try {
        const result = await provider.getManagerSession(sessionKey);
        return result.messages;
      } catch {
        // New session with no history — start empty
        return [] as ManagerChatMessage[];
      }
    },
    staleTime: 30000,
    enabled: !!sessionKey,
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      return provider.sendManagerMessage({ sessionKey, message });
    },
    onMutate: async (message: string) => {
      // Optimistically add user message
      await queryClient.cancelQueries({ queryKey: queryKeys.managerSession(sessionKey) });
      const prev = queryClient.getQueryData<ManagerChatMessage[]>(queryKeys.managerSession(sessionKey));
      const userMsg: ManagerChatMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      queryClient.setQueryData<ManagerChatMessage[]>(
        queryKeys.managerSession(sessionKey),
        (old) => [...(old || []), userMsg],
      );
      return { prev };
    },
    onSuccess: (data) => {
      // Append assistant response
      const assistantMsg: ManagerChatMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
      };
      queryClient.setQueryData<ManagerChatMessage[]>(
        queryKeys.managerSession(sessionKey),
        (old) => [...(old || []), assistantMsg],
      );
    },
    onError: (err, _message, context) => {
      // Rollback optimistic user message
      if (context?.prev) {
        queryClient.setQueryData(queryKeys.managerSession(sessionKey), context.prev);
      }
      toast('error', 'Message failed', err instanceof Error ? err.message : 'Unknown error');
    },
    onSettled: () => {
      // Invalidate related state that may have changed
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  return {
    messages: sessionQuery.data || [],
    isLoadingHistory: sessionQuery.isLoading,
    historyError: sessionQuery.error,
    sendMessage: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    sendError: sendMutation.error,
  };
}
