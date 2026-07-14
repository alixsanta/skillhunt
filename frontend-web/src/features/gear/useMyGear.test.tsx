import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { useMyGear } from './useMyGear';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function wrapper({ children }: { children: ReactNode }) {
  // `retry: false` : sans cela, TanStack Query réessaierait 3 fois avant d'exposer l'erreur.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMyGear — chargement du casier (SH-21a)', () => {
  it('charge le casier en une requête et demande la page maximale', async () => {
    let requestedLimit: string | null = null;

    server.use(
      http.get(url('/api/v1/gear/me'), ({ request }) => {
        requestedLimit = new URL(request.url).searchParams.get('limit');
        return HttpResponse.json({
          items: [
            {
              id: 'g-1',
              brand: 'DJI',
              model: 'Mavic 3',
              serialNumber: 'SN-1',
              category: 'DRONE',
              status: 'VALIDATED',
              createdAt: '2026-07-01T10:00:00.000Z',
              freelanceId: 'u-1',
            },
          ],
          total: 1,
          page: 1,
          limit: 100,
        });
      }),
    );

    const { result } = renderHook(() => useMyGear(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
    expect(requestedLimit).toBe('100');
  });

  it("expose l'erreur quand l'API échoue (pas de plantage silencieux)", async () => {
    server.use(http.get(url('/api/v1/gear/me'), () => new HttpResponse(null, { status: 500 })));

    const { result } = renderHook(() => useMyGear(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
