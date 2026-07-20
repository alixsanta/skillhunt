import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import { sessionStore } from '@/features/auth/session-store';
import { getChatSocket } from './socket';
import { conversationIdFor, type ChatMessage } from './types';

/** Résultat d'un envoi, calqué sur l'accusé de la gateway (jamais d'exception à gérer en JSX). */
export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Fil de discussion avec `peerId` (SH-24) : historique via REST, vie du fil via WebSocket.
 *
 * L'affichage ne fait confiance qu'aux messages CONFIRMÉS par le serveur : l'envoi
 * n'ajoute rien localement, c'est l'écho `message:new` (poussé aux deux parties) qui
 * matérialise le message — une seule source de vérité, pas d'état "fantôme" à réconcilier.
 */
export function useChatThread(peerId: string) {
  const me = sessionStore.getUser();
  const conversationId = me ? conversationIdFor(me.userId, peerId) : null;

  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);

  const historyQuery = useQuery<ChatMessage[], AxiosError>({
    queryKey: ['chat', 'with', peerId],
    queryFn: async () => {
      const { data } = await apiClient.get<ChatMessage[]>(`/api/v1/chat/with/${peerId}`);
      return data;
    },
  });

  // Abonnement temps réel : seuls les messages de CE fil sont retenus (étanchéité d'affichage —
  // le serveur ne pousse de toute façon que les fils de l'utilisateur, C2.2.3).
  useEffect(() => {
    const socket = getChatSocket();
    const onMessage = (message: ChatMessage) => {
      if (message.conversationId !== conversationId) {
        return;
      }
      setLiveMessages((previous) =>
        previous.some((m) => m.id === message.id) ? previous : [...previous, message],
      );
    };

    socket.on('message:new', onMessage);
    return () => {
      socket.off('message:new', onMessage);
    };
  }, [conversationId]);

  // Historique + direct, dédoublonnés par id (l'écho d'un message déjà chargé ne double pas).
  const messages = useMemo(() => {
    const history = historyQuery.data ?? [];
    const knownIds = new Set(history.map((m) => m.id));
    return [...history, ...liveMessages.filter((m) => !knownIds.has(m.id))];
  }, [historyQuery.data, liveMessages]);

  const send = useCallback(
    (body: string): Promise<SendResult> =>
      new Promise((resolve) => {
        getChatSocket().emit(
          'message:send',
          { toUserId: peerId, body },
          (ack: { ok: boolean; error?: string }) => {
            resolve(ack.ok ? { ok: true } : { ok: false, error: ack.error ?? 'Envoi impossible' });
          },
        );
      }),
    [peerId],
  );

  return {
    me,
    messages,
    send,
    isPending: historyQuery.isPending,
    isError: historyQuery.isError,
    error: historyQuery.error,
    refetch: historyQuery.refetch,
  };
}
