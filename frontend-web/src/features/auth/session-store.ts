import { decodeAccessToken } from './token';
import type { AuthUser } from './types';

/**
 * Session courante, EN MÉMOIRE UNIQUEMENT (SH-20).
 *
 * Rien n'est écrit dans localStorage/sessionStorage : l'access token disparaît avec
 * l'onglet. La persistance de la session est assurée par le cookie httpOnly du refresh
 * token, que le JavaScript ne peut pas lire (anti-XSS, C2.2.3).
 *
 * Store hors React : l'intercepteur Axios n'est pas un composant et doit pouvoir lire
 * le token. React s'y abonne via useSyncExternalStore.
 */
let accessToken: string | null = null;
let currentUser: AuthUser | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export const sessionStore = {
  getAccessToken: (): string | null => accessToken,

  getUser: (): AuthUser | null => currentUser,

  setSession(token: string): void {
    accessToken = token;
    currentUser = decodeAccessToken(token);
    emit();
  },

  clear(): void {
    accessToken = null;
    currentUser = null;
    emit();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
