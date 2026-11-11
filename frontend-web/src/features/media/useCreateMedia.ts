import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { CreateMediaInput, CreateMediaResponse } from './types';

/** Corps d'erreur du ValidationPipe NestJS : un message, ou un tableau de messages français. */
export type ApiValidationError = AxiosError<{ message?: string | string[] }>;

/**
 * Déclaration d'un média (`POST /api/v1/media`).
 *
 * Crée la ligne au statut `DRAFT` et rend l'URL PUT signée. Le portfolio n'est PAS invalidé
 * ici : la déclaration seule ne produit rien de consultable — c'est la confirmation du dépôt
 * qui fait entrer le média dans la grille.
 */
export function useCreateMedia() {
  return useMutation<CreateMediaResponse, ApiValidationError, CreateMediaInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post<CreateMediaResponse>('/api/v1/media', input);
      return data;
    },
  });
}
