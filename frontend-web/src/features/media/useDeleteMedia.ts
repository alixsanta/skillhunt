import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import { myMediaQueryKey } from './useMyMedia';

/**
 * Suppression d'un média (`DELETE /api/v1/media/:id`, SH-54).
 *
 * Le backend supprime la ligne ET tous les objets du média, et libère une place du quota.
 * Au succès, le portfolio est invalidé : la grille et le compteur de la page compte, qui
 * partagent la même clé de requête, se rechargent ensemble.
 *
 * L'identité vient du token (jamais d'un id de propriétaire côté client) et le bearer est
 * injecté par les intercepteurs d'`apiClient` (SH-20) — ne pas les court-circuiter ici.
 */
export function useDeleteMedia() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { id: string }>({
    mutationFn: async ({ id }) => {
      await apiClient.delete(`/api/v1/media/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: myMediaQueryKey });
    },
  });
}
