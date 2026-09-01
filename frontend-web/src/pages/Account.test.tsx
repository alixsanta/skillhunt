import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/session-store';
import Account from './Account';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const TOKEN = fakeJwt({ userId: 'u-1', email: 'pilote@skillhunt.io', role: 'FREELANCE' });
const RECRUITER_TOKEN = fakeJwt({
  userId: 'u-2',
  email: 'recruteur@skillhunt.io',
  role: 'RECRUITER',
});
const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function renderAccount(accessToken: string = TOKEN) {
  // QueryClientProvider : la section 2FA de « Mon compte » interroge /auth/2fa/status (SH-40).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.post(url('/api/v1/auth/refresh'), () =>
      HttpResponse.json({ accessToken, refreshToken: 'r' }),
    ),
  );
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/mon-compte']}>
          <Routes>
            <Route path="/login" element={<p>Écran de connexion</p>} />
            <Route path="/mon-compte" element={<Account />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Session active dès le démarrage : le refresh silencieux renvoie un access token valide.
  // Écrasé au besoin par renderAccount(RECRUITER_TOKEN) pour les tests de rôle.
  server.use(
    http.post(url('/api/v1/auth/refresh'), () =>
      HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
    ),
    // Section 2FA (SH-40) : état par défaut, non testé ici (TwoFactorSettings.test.tsx).
    http.get(url('/api/v1/auth/2fa/status'), () => HttpResponse.json({ enabled: false })),
    // Carte portfolio (SH-18a) : Account appelle useMyMedia() sans condition. Page vide par
    // défaut — les tests qui veulent un contenu précis enregistrent leur propre handler, qui
    // prime sur celui-ci. Sans ce handler par défaut, la requête part non simulée : MSW
    // (onUnhandledRequest: 'error', setupTests.ts) échoue la requête plutôt que le test, et le
    // retry de useMyMedia (aucun `response.status` à lire) programme trois tentatives en
    // backoff exponentiel sur des timers réels — un vrai coût de temps constaté en revue.
    http.get(url('/api/v1/media/me'), () =>
      HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
    ),
  );
});
afterEach(() => sessionStore.clear());

describe('Page Mon compte — déconnexion (SH-20)', () => {
  it('redirige vers /login quand la révocation du logout réussit', async () => {
    server.use(
      http.post(url('/api/v1/auth/logout'), () => new HttpResponse(null, { status: 200 })),
    );

    renderAccount();

    await userEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByText('Écran de connexion')).toBeInTheDocument();
  });

  it('redirige quand même vers /login quand le backend de logout est en échec', async () => {
    // Backend indisponible / coupure réseau : la session locale est purgée par AuthProvider,
    // mais l'erreur réseau est re-lancée. handleLogout doit néanmoins rediriger (try/finally)
    // sans laisser de rejet de promesse non géré.
    server.use(
      http.post(url('/api/v1/auth/logout'), () => new HttpResponse(null, { status: 500 })),
    );

    renderAccount();

    await userEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByText('Écran de connexion')).toBeInTheDocument();
  });
});

describe('Page Mon compte — carte portfolio (SH-18a)', () => {
  it('mène au portfolio et permet de publier directement', async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderAccount();

    expect(await screen.findByRole('link', { name: 'Portfolio' })).toHaveAttribute(
      'href',
      '/portfolio',
    );
    // Publier ne doit pas obliger à passer par la grille.
    expect(screen.getByRole('link', { name: /publier une vidéo/i })).toHaveAttribute(
      'href',
      '/portfolio/ajouter',
    );
  });

  it("résume l'état du portfolio", async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({
          items: [
            { id: 'm-1', status: 'READY' },
            { id: 'm-2', status: 'UPLOADED' },
          ],
          total: 2,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderAccount();

    expect(await screen.findByText(/2 vidéos · 1 en traitement/i)).toBeInTheDocument();
  });

  it('rend le compteur du portfolio audible hors du lien', async () => {
    // Le résumé doit être présent dans le document et ACCESSIBLE (pas masqué par un aria-label
    // sur le lien). Le test échoue si on remettait le résumé à l'intérieur du lien avec un
    // aria-label : l'aria-label remplacerait l'arbre accessible, le résumé ne serait plus
    // lisible à côté du lien dans l'ordre de lecture du document.
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({
          items: [
            { id: 'm-1', status: 'READY' },
            { id: 'm-2', status: 'PROCESSING' },
          ],
          total: 2,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderAccount();

    // Le lien "Portfolio" n'a pas d'aria-label : son nom est juste "Portfolio".
    const link = await screen.findByRole('link', { name: 'Portfolio' });
    expect(link).toBeInTheDocument();

    // Le résumé doit être dans le document et NOT être un enfant du lien (sinon un aria-label
    // sur le lien le masquerait de l'arbre accessible).
    const summary = await screen.findByText(/2 vidéos · 1 en traitement/i);
    expect(summary).toBeInTheDocument();
    expect(link.contains(summary)).toBe(false);
  });

  it('annonce les changements du compteur via aria-live', async () => {
    // Le compteur de la carte du compte est sondé continuellement par useMyMedia tant qu'un
    // média est en traitement. Ces changements doivent être annoncés aux lecteurs d'écran.
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({
          items: [{ id: 'm-1', status: 'PROCESSING' }],
          total: 1,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderAccount();

    const summary = await screen.findByText(/1 vidéo · 1 en traitement/i);
    expect(summary).toHaveAttribute('aria-live', 'polite');
  });

  it('ne montre jamais la carte à un RECRUITER (le backend renverrait 403)', async () => {
    // `GET /media/me` est réservé au FREELANCE (@Roles). On retire volontairement le handler
    // par défaut posé en beforeEach : si la carte (ou `useMyMedia`) émettait quand même la
    // requête, MSW la ferait échouer bruyamment (onUnhandledRequest: 'error', setupTests.ts)
    // au lieu de la laisser passer silencieusement.
    server.resetHandlers(
      http.post(url('/api/v1/auth/refresh'), () =>
        HttpResponse.json({ accessToken: RECRUITER_TOKEN, refreshToken: 'r' }),
      ),
      http.get(url('/api/v1/auth/2fa/status'), () => HttpResponse.json({ enabled: false })),
    );
    renderAccount(RECRUITER_TOKEN);

    expect(await screen.findByText('recruteur@skillhunt.io')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Portfolio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /publier une vidéo/i })).not.toBeInTheDocument();
  });
});
