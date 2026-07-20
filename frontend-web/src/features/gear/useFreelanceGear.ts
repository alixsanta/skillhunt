import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import { GEAR_PAGE_LIMIT } from './useMyGear';
import type { PaginatedPublicGear } from './types';

/**
 * Casier PUBLIC d'un freelance, vu par un recruteur (SH-21b, endpoint SH-39).
 *
 * Le backend impose le filtre `VALIDATED` et la projection sans `serialNumber` : ce hook
 * n'envoie AUCUN paramètre de statut (le DTO public le rejetterait en 400). Même stratégie
 * que useMyGear : une requête page maximale, filtrage par catégorie en mémoire ensuite.
 */
export function useFreelanceGear(freelanceId: string) {
  return useQuery<PaginatedPublicGear, AxiosError>({
    queryKey: ['gear', 'freelance', freelanceId],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedPublicGear>(
        `/api/v1/gear/freelance/${freelanceId}`,
        { params: { limit: GEAR_PAGE_LIMIT } },
      );
      return data;
    },
    // Pas de retry sur 4xx (même politique que useMyGear) : un 403 (rôle non-RECRUITER)
    // ou un 404 (profil introuvable) est une réponse définitive, pas un aléa réseau.
    retry: (failureCount, error) => {
      const status = error.response?.status;
      if (status !== undefined && status >= 400 && status < 500) {
        return false;
      }
      return failureCount < 3;
    },
  });
}
