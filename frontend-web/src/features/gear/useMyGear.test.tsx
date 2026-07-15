import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { useMyGear } from './useMyGear';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function wrapper({ children }: { children: ReactNode }) {
  // `useMyGear` définit sa PROPRE politique de retry (pas de retry sur 4xx, 3 essais sur
  // 5xx/réseau), qui prime sur les options du client — un `retry: false` ici serait ignoré.
  // On force donc seulement `retryDelay: 0` pour que les réessais d'un 500 soient instantanés
  // et n'allongent pas le test.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
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

  it('ne réessaie jamais une erreur 4xx (403 — RECRUITER sur une route réservée FREELANCE)', async () => {
    let callCount = 0;
    server.use(
      http.get(url('/api/v1/gear/me'), () => {
        callCount += 1;
        return new HttpResponse(null, { status: 403 });
      }),
    );

    // Ce test utilise son PROPRE QueryClient aux réglages par défaut (retry actif, 3 essais) :
    // si un 403 était compté plus d'une fois, ce serait la preuve que le hook a réessayé. Prouve
    // donc que c'est bien `useMyGear` qui refuse d'insister sur un 4xx, pas la config du test.
    function retryWrapper({ children }: { children: ReactNode }) {
      const client = new QueryClient();
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => useMyGear(), { wrapper: retryWrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callCount).toBe(1);
  });
});
