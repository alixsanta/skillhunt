import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { hasPendingMedia, useMyMedia } from './useMyMedia';
import type { PublicMedia } from './types';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function media(status: PublicMedia['status']): PublicMedia {
  return { id: status, status, type: 'VIDEO' } as PublicMedia;
}

// Le sondage est la seule chose qui fait bouger la grille tant qu'aucun WebSocket ne
// couvre les médias : sa condition d'arrêt mérite d'être épinglée.
describe('hasPendingMedia', () => {
  it("est vrai tant qu'un média est déposé ou en traitement", () => {
    expect(hasPendingMedia([media('READY'), media('UPLOADED')])).toBe(true);
    expect(hasPendingMedia([media('PROCESSING')])).toBe(true);
  });

  it('est faux quand tout est stabilisé', () => {
    expect(hasPendingMedia([media('READY'), media('FAILED')])).toBe(false);
    expect(hasPendingMedia([])).toBe(false);
  });

  it("ignore les brouillons : rien ne les fera avancer sans action de l'utilisateur", () => {
    // Un DRAFT attend une confirmation de dépôt, pas un traitement serveur — le sonder
    // indéfiniment ne ferait que du trafic pour rien.
    expect(hasPendingMedia([media('DRAFT')])).toBe(false);
  });
});

// Tests du hook `useMyMedia()` lui-même — pas seulement de sa fonction pure
describe('useMyMedia — chargement du portfolio (SH-18a)', () => {
  function wrapper({ children }: { children: ReactNode }) {
    // `useMyMedia` définit sa PROPRE politique de retry (pas de retry sur 4xx, 3 essais sur
    // 5xx/réseau), qui prime sur les options du client — un `retry: false` ici serait ignoré.
    // On force donc seulement `retryDelay: 0` pour que les réessais d'un 500 soient instantanés
    // et n'allongent pas le test.
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  it('charge le portfolio en une requête et demande la page maximale', async () => {
    let requestedLimit: string | null = null;

    server.use(
      http.get(url('/api/v1/media/me'), ({ request }) => {
        requestedLimit = new URL(request.url).searchParams.get('limit');
        return HttpResponse.json({
          items: [
            {
              id: 'm-1',
              freelanceId: 'u-1',
              title: 'Survol chantier',
              description: null,
              type: 'VIDEO',
              status: 'READY',
              durationSeconds: 120,
              width: 1920,
              height: 1080,
              sizeBytes: 512000000,
              mimeType: 'video/mp4',
              renditions: null,
              createdAt: '2026-07-01T10:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          limit: 100,
        });
      }),
    );

    const { result } = renderHook(() => useMyMedia(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
    expect(requestedLimit).toBe('100');
  });

  it("expose l'erreur quand l'API échoue (pas de plantage silencieux)", async () => {
    server.use(http.get(url('/api/v1/media/me'), () => new HttpResponse(null, { status: 500 })));

    const { result } = renderHook(() => useMyMedia(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('ne réessaie jamais une erreur 4xx (403 — accès refusé)', async () => {
    let callCount = 0;
    server.use(
      http.get(url('/api/v1/media/me'), () => {
        callCount += 1;
        return new HttpResponse(null, { status: 403 });
      }),
    );

    // Ce test utilise son PROPRE QueryClient aux réglages par défaut (retry actif, 3 essais) :
    // si un 403 était compté plus d'une fois, ce serait la preuve que le hook a réessayé. Prouve
    // donc que c'est bien `useMyMedia` qui refuse d'insister sur un 4xx, pas la config du test.
    function retryWrapper({ children }: { children: ReactNode }) {
      const client = new QueryClient();
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => useMyMedia(), { wrapper: retryWrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callCount).toBe(1);
  });
});
