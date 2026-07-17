import { io, type Socket } from 'socket.io-client';
import { DEFAULT_API_URL } from '@/api/client';
import { sessionStore } from '@/features/auth/session-store';

/**
 * Connexion socket.io du chat (SH-24) — UNE socket partagée pour tout l'onglet.
 *
 * Le jeton d'accès part dans `auth` du handshake (payload applicatif), JAMAIS en query
 * string : une URL se logue côté serveur, proxy et historique (C2.2.3). `auth` est une
 * FONCTION : socket.io la réévalue à chaque (re)connexion, donc le jeton est toujours
 * le jeton frais du sessionStore, y compris après une rotation de refresh.
 */
let socket: Socket | null = null;

export function getChatSocket(): Socket {
  if (!socket) {
    // `||` (et non `??`) : même règle que apiClient — VITE_API_URL vide = fallback (SH-38).
    socket = io(import.meta.env.VITE_API_URL || DEFAULT_API_URL, {
      auth: (provide) => provide({ token: sessionStore.getAccessToken() }),
      withCredentials: true,
    });
  }
  return socket;
}

/** Coupe et oublie la socket (déconnexion utilisateur) : la suivante repartira de zéro. */
export function resetChatSocket(): void {
  socket?.disconnect();
  socket = null;
}
