import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { PaginatedGear } from './types';

/**
 * Chargement du casier du freelance authentifié (`GET /api/v1/gear/me`).
 *
 * Le casier est chargé en UNE requête et les chips filtrent ensuite en mémoire (SH-21a) :
 * la barre de progression a de toute façon besoin du total tous statuts, et re-requêter à
 * chaque chip ferait N appels réseau pour une donnée déjà chargée.
 *
 * L'identité vient du token (jamais d'un id client) et le bearer est injecté par les
 * intercepteurs d'`apiClient` (SH-20) — ne pas les court-circuiter.
 */
export const GEAR_PAGE_LIMIT = 100; // plafond imposé par QueryGearDto côté backend
export const myGearQueryKey = ['gear', 'me'] as const;

export function useMyGear() {
  return useQuery<PaginatedGear, AxiosError>({
    queryKey: myGearQueryKey,
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedGear>('/api/v1/gear/me', {
        params: { limit: GEAR_PAGE_LIMIT },
      });
      return data;
    },
  });
}
