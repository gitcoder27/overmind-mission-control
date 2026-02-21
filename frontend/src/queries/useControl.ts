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
  const managerSessionKey = queryKeys.managerSession(sessionKey);

  const sessionQuery = useQuery({
    queryKey: managerSessionKey,
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
      const streamPrefix = `manager-stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      let sawDelta = false;

      const appendDelta = (outputIndex: number, delta: string, eventSessionKey: string) => {
        const targetSessionKey = eventSessionKey || sessionKey;
        const streamMessageId = `${streamPrefix}:${outputIndex}`;
        queryClient.setQueryData<ManagerChatMessage[]>(
          queryKeys.managerSession(targetSessionKey),
          (old) => {
            const rows = [...(old || [])];
            const existingIdx = rows.findIndex((row) => row.id === streamMessageId);
            if (existingIdx >= 0) {
              rows[existingIdx] = {
                ...rows[existingIdx],
                content: `${rows[existingIdx].content}${delta}`,
                timestamp: new Date().toISOString(),
              };
            } else {
              rows.push({
                id: streamMessageId,
                role: 'assistant',
                content: delta,
                timestamp: new Date().toISOString(),
              });
            }
            return rows;
          },
        );
      };

      try {
        await provider.streamManagerMessage({ sessionKey, message }, (event) => {
          if (event.type !== 'delta') return;
          sawDelta = true;
          appendDelta(event.outputIndex, event.delta, event.sessionKey);
        });
        return;
      } catch (streamErr) {
        // Fallback to legacy non-streaming endpoint only if no streamed content arrived.
        if (sawDelta) {
          throw streamErr;
        }

        const fallback = await provider.sendManagerMessage({ sessionKey, message });
        const fallbackMessages: ManagerChatMessage[] = fallback.messages.map((msg, idx) => ({
          id: `${streamPrefix}:fallback:${idx}`,
          role: msg.role,
          content: msg.content,
          timestamp: new Date().toISOString(),
        }));
        queryClient.setQueryData<ManagerChatMessage[]>(
          managerSessionKey,
          (old) => [...(old || []), ...fallbackMessages],
        );
      }
    },
    onMutate: async (message: string) => {
      // Optimistically add user message
      await queryClient.cancelQueries({ queryKey: managerSessionKey });
      const userMsg: ManagerChatMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      queryClient.setQueryData<ManagerChatMessage[]>(
        managerSessionKey,
        (old) => [...(old || []), userMsg],
      );
    },
    onError: (err) => {
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
