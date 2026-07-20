import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { AddGearInput, Gear } from './types';
import { myGearQueryKey } from './useMyGear';

/**
 * Corps d'erreur du ValidationPipe NestJS : `message` est un tableau de messages en français
 * (un par contrainte violée), ou une chaîne pour les autres exceptions.
 */
export type ApiValidationError = AxiosError<{ message?: string | string[] }>;

/**
 * Déclaration d'un équipement (`POST /api/v1/gear`, SH-43).
 *
 * L'équipement est créé au statut `PENDING` pour le freelance authentifié — l'identité vient
 * du token (intercepteurs d'`apiClient`, SH-20), jamais d'un id client.
 *
 * Au succès, le casier (`['gear','me']`) est invalidé : « Mon Armurerie » se recharge toute
 * seule et la nouvelle fiche apparaît sans refetch manuel.
 */
export function useCreateGear() {
  const queryClient = useQueryClient();

  return useMutation<Gear, ApiValidationError, AddGearInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post<Gear>('/api/v1/gear', input);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: myGearQueryKey });
    },
  });
}
