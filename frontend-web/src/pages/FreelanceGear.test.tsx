import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import type { PublicGear } from '@/features/gear/types';
import FreelanceGear from './FreelanceGear';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;
const FREELANCE_ID = '3f1b2c9e-6d54-4a1b-9d0e-7c2f5a8b1234';

function makePublicGear(overrides: Partial<PublicGear>): PublicGear {
  return {
    id: 'g-1',
    brand: 'DJI',
    model: 'Mavic 3',
    category: 'DRONE',
    status: 'VALIDATED',
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  } as PublicGear;
}

// La vue publique ne reçoit QUE du matériel VALIDATED : le backend (SH-39) filtre côté
// service et le DTO public n'expose ni serialNumber ni freelanceId.
const VALIDATED_LOCKER: PublicGear[] = [
  makePublicGear({ id: 'g-1', brand: 'DJI', model: 'Mavic 3', category: 'DRONE' }),
  makePublicGear({ id: 'g-2', brand: 'Insta360', model: 'Pro 2', category: 'CAMERA_360' }),
];

function respondWith(items: PublicGear[]) {
  return http.get(url(`/api/v1/gear/freelance/${FREELANCE_ID}`), () =>
    HttpResponse.json({ items, total: items.length, page: 1, limit: 100 }),
  );
}

// Handler par défaut de la gamification publique (SH-21c) : la page consomme désormais ce
// endpoint pour TOUTES ses vues — sans profil (0 badge), le niveau reste discret.
function respondWithNoGamification() {
  return http.get(url(`/api/v1/gamification/freelance/${FREELANCE_ID}`), () =>
    HttpResponse.json({ level: 1, levelLabel: 'Recrue', badges: [] }),
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/freelances/${FREELANCE_ID}/armurerie`]}>
        <Routes>
          <Route path="/freelances/:freelanceId/armurerie" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(<FreelanceGear />, { wrapper });
}

beforeEach(() => {
  server.use(respondWithNoGamification());
});

describe('Page Armurerie publique — vue recruteur (SH-21b)', () => {
  it('affiche le matériel validé du freelance avec compteur et fiches', async () => {
    server.use(respondWith(VALIDATED_LOCKER));
    renderPage();

    expect(await screen.findByText('2 équipements validés')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Armurerie du freelance' })).toBeInTheDocument();

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('DJI Mavic 3')).toBeInTheDocument();
    expect(screen.getByText('Insta360 Pro 2')).toBeInTheDocument();
    // Chaque fiche porte son libellé de statut (l'information ne repose pas sur la couleur, R6)
    expect(screen.getAllByText('VALIDÉ')).toHaveLength(2);
  });

  it("ne propose AUCUN CTA d'ajout ni barre de progression (spec §5.2)", async () => {
    server.use(respondWith(VALIDATED_LOCKER));
    renderPage();

    await screen.findByText('2 équipements validés');
    expect(screen.queryByRole('link', { name: /ajouter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ajouter/i })).not.toBeInTheDocument();
    // 100 % de validé par construction : la barre de progression n'apporte aucune information ici
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('propose « Contacter » vers le fil de discussion du freelance (SH-24)', async () => {
    server.use(respondWith(VALIDATED_LOCKER));
    renderPage();

    await screen.findByText('2 équipements validés');
    expect(screen.getByRole('link', { name: /contacter/i })).toHaveAttribute(
      'href',
      `/messages/${FREELANCE_ID}`,
    );
  });

  it('filtre par catégorie via les chips, et « Tous » rétablit la liste', async () => {
    server.use(respondWith(VALIDATED_LOCKER));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Drone' }));

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('DJI Mavic 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tous' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
  });

  it("affiche un état vide NEUTRE (sans CTA d'ajout) quand rien n'est validé", async () => {
    server.use(respondWith([]));
    renderPage();

    expect(await screen.findByText('Aucun équipement validé pour le moment.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    // Aucun CTA d'AJOUT (on ne déclare pas dans le casier d'un tiers)…
    expect(screen.queryByRole('button', { name: /ajouter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ajouter/i })).not.toBeInTheDocument();
    // … mais « Contacter » reste pertinent : le profil existe, la mise en relation aussi (SH-24)
    expect(screen.getByRole('link', { name: /contacter/i })).toBeInTheDocument();
  });

  it('explique le 404 (profil freelance introuvable)', async () => {
    server.use(
      http.get(
        url(`/api/v1/gear/freelance/${FREELANCE_ID}`),
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/profil freelance introuvable/i);
  });

  it("explique le 403 d'un compte non-recruteur (RBAC vu du front)", async () => {
    server.use(
      http.get(
        url(`/api/v1/gear/freelance/${FREELANCE_ID}`),
        () => new HttpResponse(null, { status: 403 }),
      ),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/réservée aux recruteurs/i);
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });

  it("affiche une erreur avec « Réessayer » quand l'API échoue (5xx), et recharge au clic", async () => {
    server.use(
      http.get(
        url(`/api/v1/gear/freelance/${FREELANCE_ID}`),
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/impossible de charger/i);

    server.use(respondWith(VALIDATED_LOCKER));
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('DJI Mavic 3')).toBeInTheDocument();
  });

  it('affiche le loadout en tête, le niveau et les badges obtenus (SH-21c)', async () => {
    server.use(
      respondWith([
        makePublicGear({ id: 'g-1', brand: 'DJI', model: 'Mavic 3', isInLoadout: true }),
        makePublicGear({ id: 'g-2', brand: 'Insta360', model: 'Pro 2', category: 'CAMERA_360' }),
      ]),
      http.get(url(`/api/v1/gamification/freelance/${FREELANCE_ID}`), () =>
        HttpResponse.json({
          level: 2,
          levelLabel: 'Opérateur',
          badges: [
            {
              id: 'first-validated',
              label: 'Première validation',
              description: 'Un premier équipement validé par un admin',
            },
          ],
        }),
      ),
    );
    renderPage();

    expect(await screen.findByText('Opérateur')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /loadout/i })).toBeInTheDocument();
    expect(screen.getByText('Première validation')).toBeInTheDocument();
    // Vue publique : pas d'XP chiffré, pas de contrôle d'épinglage
    expect(screen.queryByText(/XP/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /épingler|retirer/i })).not.toBeInTheDocument();
  });
});
