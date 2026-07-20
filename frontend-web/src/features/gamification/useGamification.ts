import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { GamificationProfile, PublicGamificationProfile } from './types';

/** Profil de gamification du freelance connecté (SH-21c). */
export function useGamification() {
  return useQuery<GamificationProfile, AxiosError>({
    queryKey: ['gamification', 'me'],
    queryFn: async () => (await apiClient.get<GamificationProfile>('/api/v1/gamification/me')).data,
  });
}

/** Profil public (niveau + badges obtenus) d'un freelance, vu par un recruteur. */
export function useFreelanceGamification(freelanceId: string) {
  return useQuery<PublicGamificationProfile, AxiosError>({
    queryKey: ['gamification', 'freelance', freelanceId],
    queryFn: async () =>
      (
        await apiClient.get<PublicGamificationProfile>(
          `/api/v1/gamification/freelance/${freelanceId}`,
        )
      ).data,
  });
}
