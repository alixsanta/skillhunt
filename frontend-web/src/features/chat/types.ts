import type { UserRole } from '@/features/auth/types';

// Miroir des vues renvoyées par backend-core/src/chat (SH-24).
// À terme, ces types seront couverts par la génération OpenAPI (gen:api) pour le volet REST.

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ConversationSummary {
  conversationId: string;
  with: { id: string; username: string; role: UserRole };
  lastMessage: ChatMessage;
}

// Miroir de MESSAGE_MAX_LENGTH backend (S4) — borne le textarea côté UI.
export const MESSAGE_MAX_LENGTH = 2000;

/** Identifiant de conversation déterministe — MÊME règle que ChatService.conversationIdFor. */
export function conversationIdFor(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}
