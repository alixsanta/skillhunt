import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { MatchResult, SearchMatchInput } from './types';

/**
 * Recherche de freelances par matching (SH-22) — `POST /api/v1/matching/search`.
 *
 * Le navigateur ne parle JAMAIS au matching-service directement (service interne, ni auth
 * ni CORS) : le proxy backend-core porte le RBAC RECRUITER et enrichit les résultats.
 * Mutation (et non query) : une recherche est déclenchée explicitement par l'utilisateur.
 */
export function useMatchSearch() {
  return useMutation<MatchResult[], AxiosError, SearchMatchInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post<MatchResult[]>('/api/v1/matching/search', input);
      return data;
    },
  });
}
