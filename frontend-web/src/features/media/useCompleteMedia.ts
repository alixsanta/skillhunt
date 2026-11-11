import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { PublicMedia } from './types';
import { myMediaQueryKey } from './useMyMedia';

/**
 * Confirmation du dépôt (`POST /api/v1/media/:id/complete`).
 *
 * L'API vérifie alors la taille et le type RÉELS de l'objet déposé, puis enfile le
 * transcodage. Au succès, le portfolio est invalidé : la grille se recharge et le média
 * apparaît, avec son sondage.
 */
export function useCompleteMedia() {
  const queryClient = useQueryClient();

  return useMutation<PublicMedia, AxiosError, { id: string }>({
    mutationFn: async ({ id }) => {
      const { data } = await apiClient.post<PublicMedia>(`/api/v1/media/${id}/complete`);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: myMediaQueryKey });
    },
  });
}
