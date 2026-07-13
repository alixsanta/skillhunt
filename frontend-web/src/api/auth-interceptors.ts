import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { apiClient } from './client';
import { sessionStore } from '@/features/auth/session-store';

export const REFRESH_ENDPOINT = '/api/v1/auth/refresh';

// Marque une requête déjà rejouée : on ne rejoue jamais deux fois (anti-boucle).
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

interface RefreshResponse {
  accessToken: string;
}

// Refresh EN VOL UNIQUE (single-flight).
//
// Si N requêtes prennent un 401 simultanément et déclenchent chacune une rotation,
// chaque rotation révoque le jeton de la précédente (le backend révoque l'ancien jti) :
// l'utilisateur se retrouve déconnecté sans raison. On partage donc UNE seule promesse.
let refreshPromise: Promise<string> | null = null;

function refreshOnce(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      // Body vide : le refresh token voyage dans le cookie httpOnly (SH-20).
      .post<RefreshResponse>(REFRESH_ENDPOINT, {})
      .then((response) => {
        sessionStore.setSession(response.data.accessToken);
        return response.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

let installed = false;

/** Idempotente : un double appel (React StrictMode) n'empile pas les intercepteurs. */
export function installAuthInterceptors(): void {
  if (installed) {
    return;
  }
  installed = true;

  // Requête : injection du bearer quand une session est active.
  apiClient.interceptors.request.use((config) => {
    const token = sessionStore.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Réponse : sur 401, rafraîchir puis rejouer une seule fois.
  apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as RetriableConfig | undefined;

      const isRefreshCall = config?.url === REFRESH_ENDPOINT;
      if (error.response?.status !== 401 || !config || config._retried || isRefreshCall) {
        return Promise.reject(error);
      }

      config._retried = true;

      try {
        await refreshOnce();
        // Le rejeu repasse par l'intercepteur de requête → il portera le NOUVEAU token.
        return await apiClient(config);
      } catch (refreshError) {
        // Refresh expiré ou révoqué : la session est morte. ProtectedRoute redirigera
        // vers /login en réaction au store vidé (pas de couplage au routeur ici).
        sessionStore.clear();
        return Promise.reject(refreshError);
      }
    },
  );
}
