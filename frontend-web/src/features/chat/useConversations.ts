import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { ConversationSummary } from './types';

/** Liste des conversations du compte connecté (SH-24, S5) — interlocuteur + dernier message. */
export function useConversations() {
  return useQuery<ConversationSummary[], AxiosError>({
    queryKey: ['chat', 'conversations'],
    queryFn: async () => {
      const { data } = await apiClient.get<ConversationSummary[]>('/api/v1/chat/conversations');
      return data;
    },
  });
}
