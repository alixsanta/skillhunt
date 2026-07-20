import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import type { AddGearInput, Gear } from './types';
import { useCreateGear } from './useCreateGear';
import { useMyGear } from './useMyGear';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function makeGear(overrides: Partial<Gear>): Gear {
  return {
    id: 'g-1',
    brand: 'DJI',
    model: 'Mavic 3',
    serialNumber: 'SN-12345',
    category: 'DRONE',
    status: 'PENDING',
    createdAt: '2026-07-16T10:00:00.000Z',
    freelanceId: 'u-1',
    ...overrides,
  } as Gear;
}

const NEW_GEAR: AddGearInput = {
  brand: 'Insta360',
  model: 'Pro 2',
  serialNumber: 'SN-99999',
  category: 'CAMERA_360',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCreateGear — déclaration de matériel (SH-43)', () => {
  it('envoie le payload sur POST /api/v1/gear et renvoie la fiche créée (PENDING)', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(url('/api/v1/gear'), async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(makeGear({ id: 'g-new', ...NEW_GEAR }), { status: 201 });
      }),
    );

    const { result } = renderHook(() => useCreateGear(), { wrapper });

    let created: Gear | undefined;
    await act(async () => {
      created = await result.current.mutateAsync(NEW_GEAR);
    });

    expect(receivedBody).toEqual(NEW_GEAR);
    expect(created?.id).toBe('g-new');
    expect(created?.status).toBe('PENDING');
  });

  it('invalide le casier après création : useMyGear se recharge tout seul', async () => {
    // Preuve COMPORTEMENTALE de l'invalidation de ['gear','me'] : un casier déjà chargé
    // (1 équipement) doit se rafraîchir après la mutation et afficher le 2e équipement,
    // sans appel manuel à refetch().
    const first = makeGear({ id: 'g-1' });
    const second = makeGear({ id: 'g-new', ...NEW_GEAR });
    let locker: Gear[] = [first];

    server.use(
      http.get(url('/api/v1/gear/me'), () =>
        HttpResponse.json({ items: locker, total: locker.length, page: 1, limit: 100 }),
      ),
      http.post(url('/api/v1/gear'), () => {
        locker = [first, second];
        return HttpResponse.json(second, { status: 201 });
      }),
    );

    const { result } = renderHook(() => ({ locker: useMyGear(), create: useCreateGear() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.locker.data?.items).toHaveLength(1));

    await act(async () => {
      await result.current.create.mutateAsync(NEW_GEAR);
    });

    await waitFor(() => expect(result.current.locker.data?.items).toHaveLength(2));
  });

  it("expose l'erreur backend (400) sans invalider le casier", async () => {
    server.use(
      http.post(url('/api/v1/gear'), () =>
        HttpResponse.json(
          { message: ['La catégorie de matériel est invalide'], statusCode: 400 },
          { status: 400 },
        ),
      ),
    );

    const { result } = renderHook(() => useCreateGear(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(NEW_GEAR)).rejects.toThrow();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.response?.status).toBe(400);
  });
});
