import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import type { PublicGear } from './types';
import { useFreelanceGear } from './useFreelanceGear';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;
const FREELANCE_ID = '3f1b2c9e-6d54-4a1b-9d0e-7c2f5a8b1234';

const VALIDATED_ITEM: PublicGear = {
  id: 'g-1',
  brand: 'DJI',
  model: 'Mavic 3',
  category: 'DRONE',
  status: 'VALIDATED',
  createdAt: '2026-07-01T10:00:00.000Z',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useFreelanceGear — casier public d'un freelance (SH-21b)", () => {
  it('charge le casier validé du freelance ciblé en une requête (page maximale)', async () => {
    let requestedLimit: string | null = null;

    server.use(
      http.get(url(`/api/v1/gear/freelance/${FREELANCE_ID}`), ({ request }) => {
        requestedLimit = new URL(request.url).searchParams.get('limit');
        return HttpResponse.json({ items: [VALIDATED_ITEM], total: 1, page: 1, limit: 100 });
      }),
    );

    const { result } = renderHook(() => useFreelanceGear(FREELANCE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(requestedLimit).toBe('100');
  });

  it('ne réessaie jamais une erreur 4xx (404 profil introuvable : réponse définitive)', async () => {
    let callCount = 0;
    server.use(
      http.get(url(`/api/v1/gear/freelance/${FREELANCE_ID}`), () => {
        callCount += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );

    // QueryClient aux réglages par défaut (retry actif) : prouve que c'est bien le hook
    // qui refuse d'insister sur un 4xx, pas la config du test (mirroring useMyGear.test).
    function retryWrapper({ children }: { children: ReactNode }) {
      const client = new QueryClient();
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => useFreelanceGear(FREELANCE_ID), {
      wrapper: retryWrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callCount).toBe(1);
  });
});
