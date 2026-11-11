import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import type { MatchResult } from '@/features/matching/types';
import { DEFAULT_RADIUS_KM } from '@/features/matching/SearchFilters';
import Search from './Search';

// La carte a ses propres tests (SearchMap.test.tsx) ; ici on vérifie seulement QUAND elle
// apparaît, et — depuis SH-51 — avec QUEL rayon initial. `radiusKm` est exposé en attribut
// `data-*` pour que le test puisse l'observer sans rendre une vraie carte Leaflet.
vi.mock('@/features/matching/SearchMap', () => ({
  SearchMap: ({ radiusKm }: { radiusKm: number }) => (
    <div role="region" aria-label="Carte des freelances" data-radius-km={radiusKm} />
  ),
}));

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

const RESULTS: MatchResult[] = [
  {
    freelanceId: '3f1b2c9e-6d54-4a1b-9d0e-7c2f5a8b1234',
    username: 'pilote-pro',
    score: 0.92,
    distanceKm: 12.5,
    latitude: 43.6045,
    longitude: 1.4442,
  },
  {
    freelanceId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    username: 'drone-master',
    score: 0.71,
    distanceKm: 3.2,
    latitude: 43.7,
    longitude: 1.5,
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<Search />, { wrapper });
}

async function fillAndSubmit() {
  // Les compétences se choisissent désormais via les puces à bascule (SH-51), plus un
  // champ texte séparé par des virgules.
  await userEvent.click(screen.getByRole('button', { name: /pilotage drone/i }));
  await userEvent.click(screen.getByRole('button', { name: /^thermographie$/i }));
  await userEvent.selectOptions(screen.getByLabelText(/lieu de mission/i), 'Toulouse');
  await userEvent.click(screen.getByRole('button', { name: 'Lancer la recherche' }));
}

describe('Page Recherche de freelances (SH-22)', () => {
  it("envoie la recherche au proxy et affiche les résultats dans l'ordre du service", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(url('/api/v1/matching/search'), async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(RESULTS);
      }),
    );

    renderPage();
    await fillAndSubmit();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    // L'ordre du service fait foi (score décroissant)
    expect(within(items[0]).getByText('pilote-pro')).toBeInTheDocument();
    expect(within(items[0]).getByText('92 %')).toBeInTheDocument();
    expect(within(items[0]).getByText('12.5 km')).toBeInTheDocument();
    expect(within(items[1]).getByText('drone-master')).toBeInTheDocument();

    // La saisie libre est découpée sur les virgules, et la ville choisie fournit lat/lon
    expect(receivedBody).toMatchObject({
      skills: ['pilotage drone', 'thermographie'],
      radiusKm: 50,
    });
    const body = receivedBody as { lat: number; lon: number };
    expect(body.lat).toBeCloseTo(43.6045, 2);
    expect(body.lon).toBeCloseTo(1.4442, 2);
  });

  it('affiche la carte de répartition avec les résultats (SH-23)', async () => {
    server.use(http.post(url('/api/v1/matching/search'), () => HttpResponse.json(RESULTS)));

    renderPage();
    // La carte est visible dès l'arrivée depuis SH-51 ; elle le reste une fois les
    // résultats reçus — c'est le même panneau, pas un remontage conditionnel.
    expect(screen.getByRole('region', { name: /carte des freelances/i })).toBeInTheDocument();

    await fillAndSubmit();
    await screen.findAllByRole('listitem');
    expect(screen.getByRole('region', { name: /carte des freelances/i })).toBeInTheDocument();
  });

  it('présente les résultats dans une liste nommée', async () => {
    server.use(http.post(url('/api/v1/matching/search'), () => HttpResponse.json(RESULTS)));

    renderPage();
    await fillAndSubmit();

    expect(
      await screen.findByRole('list', { name: /résultats de la recherche/i }),
    ).toBeInTheDocument();
  });

  it("relie chaque résultat à l'armurerie publique du freelance (SH-21b)", async () => {
    server.use(http.post(url('/api/v1/matching/search'), () => HttpResponse.json(RESULTS)));

    renderPage();
    await fillAndSubmit();

    const links = await screen.findAllByRole('link', { name: "Voir l'armurerie" });
    expect(links[0]).toHaveAttribute(
      'href',
      '/freelances/3f1b2c9e-6d54-4a1b-9d0e-7c2f5a8b1234/armurerie',
    );
  });

  it('bloque la soumission côté client sans compétence — SANS appel réseau', async () => {
    // Aucun handler MSW : le moindre appel réseau ferait échouer ce test
    // (onUnhandledRequest: 'error') — preuve de la validation client (C2.2.3).
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Lancer la recherche' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Renseigne au moins une compétence.',
    );
  });

  it('borne le rayon de mission entre 1 et 500 km', () => {
    // Depuis SH-51 le rayon se règle au curseur natif (type="range") : le navigateur
    // (et jsdom, vérifié en pratique) refuse structurellement toute valeur hors de
    // [min, max], donc « 900 » ne peut plus être saisi pour déclencher le message
    // d'erreur client — ce scénario n'est plus atteignable depuis l'UI. On vérifie à la
    // place que les bornes annoncées au navigateur sont bien les mêmes (1..500), qui sont
    // aussi celles revalidées dans `handleSubmit` en filet de sécurité (defense in depth).
    renderPage();

    const radius = screen.getByLabelText(/rayon/i);
    expect(radius).toHaveAttribute('min', '1');
    expect(radius).toHaveAttribute('max', '500');
  });

  it('affiche un état vide explicite quand aucun freelance ne correspond', async () => {
    server.use(http.post(url('/api/v1/matching/search'), () => HttpResponse.json([])));

    renderPage();
    await fillAndSubmit();

    expect(await screen.findByText(/aucun freelance ne correspond/i)).toBeInTheDocument();
  });

  it("explique le 403 d'un compte non-recruteur (RBAC vu du front)", async () => {
    server.use(
      http.post(url('/api/v1/matching/search'), () => new HttpResponse(null, { status: 403 })),
    );

    renderPage();
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/réservée aux recruteurs/i);
  });

  it('affiche une erreur quand le matching est indisponible (502), et la recherche peut être relancée', async () => {
    server.use(
      http.post(url('/api/v1/matching/search'), () => new HttpResponse(null, { status: 502 })),
    );

    renderPage();
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponible/i);

    server.use(http.post(url('/api/v1/matching/search'), () => HttpResponse.json(RESULTS)));
    await userEvent.click(screen.getByRole('button', { name: 'Lancer la recherche' }));

    expect(await screen.findByText('pilote-pro')).toBeInTheDocument();
  });
});

describe('Recherche — saisie visuelle (SH-51)', () => {
  it('propose les compétences en boutons à bascule', async () => {
    const user = userEvent.setup();
    renderPage();

    const puce = screen.getByRole('button', { name: /pilotage drone/i });
    expect(puce).toHaveAttribute('aria-pressed', 'false');

    await user.click(puce);
    expect(puce).toHaveAttribute('aria-pressed', 'true');

    await user.click(puce);
    expect(puce).toHaveAttribute('aria-pressed', 'false');
  });

  it('accepte une compétence absente des suggestions', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/ajouter une compétence/i), 'bathymétrie{Enter}');
    expect(screen.getByRole('button', { name: /bathymétrie/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('affiche la carte avant toute recherche', () => {
    renderPage();
    // La carte n'attend plus une première soumission : le recruteur voit son périmètre
    // de mission dès l'arrivée (SH-51).
    expect(screen.getByRole('region', { name: /carte des freelances/i })).toBeInTheDocument();
  });

  it('centre la carte, dès l’arrivée, sur le même rayon par défaut que le curseur du formulaire (SH-51)', () => {
    // Revue de code SH-51 : le rayon par défaut de l'état initial de la carte et celui du
    // curseur de `SearchFilters` venaient de deux valeurs codées en dur indépendantes, qui
    // pouvaient diverger silencieusement. Les deux lisent désormais `DEFAULT_RADIUS_KM`.
    renderPage();

    expect(screen.getByRole('region', { name: /carte des freelances/i })).toHaveAttribute(
      'data-radius-km',
      String(DEFAULT_RADIUS_KM),
    );
    expect(screen.getByLabelText(/rayon de mission/i)).toHaveValue(String(DEFAULT_RADIUS_KM));
  });
});
