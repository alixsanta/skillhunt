import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import type { Gear } from '@/features/gear/types';
import Armurerie from './Armurerie';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function makeGear(overrides: Partial<Gear>): Gear {
  return {
    id: 'g-1',
    brand: 'DJI',
    model: 'Mavic 3',
    serialNumber: 'SN-1',
    category: 'DRONE',
    status: 'VALIDATED',
    createdAt: '2026-07-01T10:00:00.000Z',
    freelanceId: 'u-1',
    ...overrides,
  } as Gear;
}

const LOCKER: Gear[] = [
  makeGear({ id: 'g-1', brand: 'DJI', model: 'Mavic 3', category: 'DRONE', status: 'VALIDATED' }),
  makeGear({
    id: 'g-2',
    brand: 'Insta360',
    model: 'Pro 2',
    category: 'CAMERA_360',
    status: 'PENDING',
  }),
  makeGear({ id: 'g-3', brand: 'Flir', model: 'Vue TZ20', category: 'SENSOR', status: 'REJECTED' }),
];

function respondWith(items: Gear[]) {
  return http.get(url('/api/v1/gear/me'), () =>
    HttpResponse.json({ items, total: items.length, page: 1, limit: 100 }),
  );
}

// Handler par défaut de la gamification (SH-21c) : la page rend désormais `useGamification()`
// en plus du casier — sans ce handler, TOUS les tests existants échoueraient (MSW
// `onUnhandledRequest: 'error'`) alors qu'ils ne testent pas la gamification. Enregistré dans
// un `beforeEach` (voir plus bas) : les tests qui veulent un profil précis le surchargent via
// leur propre `server.use(...)`, exécuté APRÈS le `beforeEach` et donc prioritaire (MSW empile
// les handlers "runtime" du plus récent au plus ancien).
function defaultGamificationHandler() {
  return http.get(url('/api/v1/gamification/me'), () =>
    HttpResponse.json({ xp: 0, level: 1, levelLabel: 'Recrue', nextLevelAt: 100, badges: [] }),
  );
}

function renderPage() {
  // `useMyGear` définit sa PROPRE politique de retry (pas de retry sur 4xx, 3 essais sur
  // 5xx/réseau), qui prime sur les options du client — un `retry: false` ici serait ignoré
  // et les 3 essais avec le backoff exponentiel par défaut feraient dépasser le timeout de
  // `findByRole('alert')` sur le test du 500. On force donc aussi `retryDelay: 0` pour que
  // les réessais soient instantanés (mirroring de useMyGear.test.tsx).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  // MemoryRouter : le CTA « + Ajouter du matériel » est un lien react-router depuis SH-43.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<Armurerie />, { wrapper });
}

describe('Page Mon Armurerie — vue privée (SH-21a)', () => {
  beforeEach(() => {
    server.use(defaultGamificationHandler());
  });

  it('affiche un état de chargement pendant la requête', () => {
    server.use(respondWith(LOCKER));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent(/chargement/i);
  });

  it('affiche le compteur, la progression et toutes les fiches, tous statuts confondus', async () => {
    server.use(respondWith(LOCKER));
    renderPage();

    // Le <h1> est rendu dans TOUS les états (y compris pendant le chargement) : l'attendre en
    // premier ne garantirait rien (il est déjà présent au tout premier rendu, avant même la
    // réponse MSW). On attend donc plutôt le compteur, qui ne s'affiche qu'une fois la requête
    // résolue, comme véritable point de synchronisation.
    expect(await screen.findByText('3 équipements')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mon Armurerie' })).toBeInTheDocument();
    // 1 VALIDATED sur 3 → 33 % — nommé explicitement : depuis SH-21c, `LevelCard` ajoute SON
    // PROPRE `role="progressbar"` (progression XP) sur la même page, ce qui rendrait une
    // requête non scopée ambiguë.
    expect(screen.getByRole('progressbar', { name: 'Part de matériel validé' })).toHaveAttribute(
      'aria-valuenow',
      '33',
    );

    // Scopé sur la liste du CASIER (nommée « Équipements ») : depuis SH-21c, la page rend
    // aussi la liste du loadout (`LoadoutRow`), qui porterait sinon les mêmes rôles `listitem`
    // (emplacements libres) et fausserait un décompte non scopé.
    expect(
      within(screen.getByRole('list', { name: 'Équipements' })).getAllByRole('listitem'),
    ).toHaveLength(3);
    expect(screen.getByText('VALIDÉ')).toBeInTheDocument();
    expect(screen.getByText('ATTENTE')).toBeInTheDocument();
    expect(screen.getByText('REJETÉ')).toBeInTheDocument();
  });

  it('filtre la liste sur la catégorie choisie, et « Tous » la rétablit', async () => {
    server.use(respondWith(LOCKER));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Drone' }));

    // Scopé sur la liste du CASIER (voir commentaire du test précédent) — le loadout ne
    // filtre jamais par catégorie, il resterait sinon dans `screen.getByRole('list')` non scopé.
    const list = screen.getByRole('list', { name: 'Équipements' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('DJI Mavic 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tous' }));
    expect(
      within(screen.getByRole('list', { name: 'Équipements' })).getAllByRole('listitem'),
    ).toHaveLength(3);
  });

  it('propose un CTA actif vers la déclaration de matériel (SH-43)', async () => {
    server.use(respondWith(LOCKER));
    renderPage();

    expect(await screen.findByText('3 équipements')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: '+ Ajouter du matériel' });
    expect(cta).toHaveAttribute('href', '/mon-armurerie/ajouter');
  });

  it("affiche l'état vide quand le casier ne contient aucun équipement", async () => {
    server.use(respondWith([]));
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Ton arsenal est vide' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it("affiche une erreur en français avec « Réessayer » quand l'API échoue, et recharge au clic", async () => {
    server.use(http.get(url('/api/v1/gear/me'), () => new HttpResponse(null, { status: 500 })));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/impossible de charger/i);

    server.use(respondWith(LOCKER));
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('DJI Mavic 3')).toBeInTheDocument();
  });

  it("explique le 403 d'un compte non-freelance (RBAC vu du front)", async () => {
    server.use(http.get(url('/api/v1/gear/me'), () => new HttpResponse(null, { status: 403 })));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/réservée aux freelances/i);
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });

  it('explique le 401 (session expirée) SANS proposer un Réessayer futile (SH-44)', async () => {
    // Les intercepteurs ont déjà tenté le refresh avant que ce 401 n'arrive au composant :
    // re-cliquer « Réessayer » ne pourrait pas ressusciter la session.
    server.use(http.get(url('/api/v1/gear/me'), () => new HttpResponse(null, { status: 401 })));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/session a expiré/i);
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });

  it('annonce le résultat du filtrage dans une région polie (4.1.3, SH-44)', async () => {
    server.use(respondWith(LOCKER));
    renderPage();

    expect(await screen.findByText('3 équipements affichés')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Drone' }));

    const live = screen.getByText('1 équipement affiché');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('affiche le niveau, les badges et la rangée loadout (SH-21c)', async () => {
    server.use(
      respondWith(LOCKER),
      http.get(url('/api/v1/gamification/me'), () =>
        HttpResponse.json({
          xp: 130,
          level: 2,
          levelLabel: 'Opérateur',
          nextLevelAt: 250,
          badges: [
            {
              id: 'first-validated',
              label: 'Première validation',
              description: 'Un premier équipement validé par un admin',
              earned: true,
            },
          ],
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText('Opérateur')).toBeInTheDocument();
    expect(screen.getByText('Première validation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /loadout/i })).toBeInTheDocument();
  });

  it('« Épingler » sur une fiche validée appelle PATCH /gear/:id/loadout', async () => {
    // g-1 (LOCKER) est déjà VALIDATED et non épinglé (isInLoadout absent des fixtures) :
    // c'est la seule fiche éligible au bouton « Épingler », donc pas besoin d'un id dédié
    // (adaptation du brief, qui utilisait `g-validated`, aux fixtures réelles du fichier).
    let patched: unknown = null;
    server.use(
      respondWith(LOCKER),
      http.patch(url('/api/v1/gear/g-1/loadout'), async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({});
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /épingler .* au loadout/i }));
    await waitFor(() => expect(patched).toEqual({ inLoadout: true }));
  });

  it("« Retirer » sur une fiche épinglée affiche le message d'échec (revue finale SH-21c)", async () => {
    // g-1 déjà VALIDATED : on le marque épinglé pour faire apparaître le bouton « Retirer »
    // dans le LoadoutRow (le callback d'échec doit être partagé avec « Épingler », pas dupliqué).
    const pinnedLocker = LOCKER.map((gear) =>
      gear.id === 'g-1' ? { ...gear, isInLoadout: true } : gear,
    );
    server.use(
      respondWith(pinnedLocker),
      http.patch(url('/api/v1/gear/g-1/loadout'), () =>
        HttpResponse.json({ message: 'Retrait du loadout impossible' }, { status: 400 }),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /retirer .* du loadout/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Retrait du loadout impossible');
  });
});
