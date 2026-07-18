import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { useGamification, useFreelanceGamification } from './useGamification';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('hooks gamification (SH-21c)', () => {
  it('useGamification lit GET /api/v1/gamification/me', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/api/v1/gamification/me`, () =>
        HttpResponse.json({ xp: 80, level: 1, levelLabel: 'Recrue', nextLevelAt: 100, badges: [] }),
      ),
    );
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.data?.levelLabel).toBe('Recrue'));
  });

  it('useFreelanceGamification lit le profil public réduit', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/api/v1/gamification/freelance/u-1`, () =>
        HttpResponse.json({ level: 2, levelLabel: 'Opérateur', badges: [] }),
      ),
    );
    const { result } = renderHook(() => useFreelanceGamification('u-1'), { wrapper });
    await waitFor(() => expect(result.current.data?.levelLabel).toBe('Opérateur'));
  });
});
