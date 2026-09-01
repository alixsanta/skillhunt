import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { PaginatedMedia, PublicMedia } from './types';

export const MEDIA_PAGE_LIMIT = 100; // plafond imposé par QueryMediaDto côté backend
export const POLL_INTERVAL_MS = 5000;
export const myMediaQueryKey = ['media', 'me'] as const;

/**
 * Un média est « en cours » tant qu'il attend le worker. `DRAFT` n'en fait pas partie :
 * il attend une confirmation de dépôt de la part de l'utilisateur, pas un traitement
 * serveur — le sonder ne produirait que du trafic inutile.
 */
export function hasPendingMedia(items: PublicMedia[]): boolean {
  return items.some((media) => media.status === 'UPLOADED' || media.status === 'PROCESSING');
}

/**
 * Chargement du portfolio du freelance authentifié (`GET /api/v1/media/me`).
 *
 * Chargé en UNE requête, comme le casier de SH-21a : le compteur de la page compte a besoin
 * du total tous statuts, et re-requêter par statut ferait N appels pour une donnée déjà là.
 *
 * Le sondage s'arrête de lui-même dès que plus rien n'est en cours, et ne démarre jamais sur
 * un portfolio entièrement stabilisé.
 *
 * L'identité vient du token (jamais d'un id client) et le bearer est injecté par les
 * intercepteurs d'`apiClient` (SH-20) — ne pas les court-circuiter ici.
 */
export function useMyMedia() {
  return useQuery<PaginatedMedia, AxiosError>({
    queryKey: myMediaQueryKey,
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedMedia>('/api/v1/media/me', {
        params: { limit: MEDIA_PAGE_LIMIT },
      });
      return data;
    },
    refetchInterval: (query) =>
      hasPendingMedia(query.state.data?.items ?? []) ? POLL_INTERVAL_MS : false,
    // Ne jamais réessayer une erreur 4xx : un 403 (RECRUITER sur une route @Roles(FREELANCE))
    // ou un 401 (session expirée, déjà géré par les intercepteurs) est une réponse définitive
    // du serveur, pas un aléa réseau. Seuls les 5xx et les échecs réseau méritent un retry.
    retry: (failureCount, error) => {
      const status = error.response?.status;
      if (status !== undefined && status >= 400 && status < 500) {
        return false;
      }
      return failureCount < 3;
    },
  });
}
