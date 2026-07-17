import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';

/** Épingler/retirer un équipement du loadout (SH-21c) — invalide casier ET gamification. */
export function useSetLoadout() {
  const queryClient = useQueryClient();
  return useMutation<unknown, AxiosError, { gearId: string; inLoadout: boolean }>({
    mutationFn: async ({ gearId, inLoadout }) =>
      (await apiClient.patch(`/api/v1/gear/${gearId}/loadout`, { inLoadout })).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gear', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['gamification', 'me'] });
    },
  });
}
