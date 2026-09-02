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
const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function renderAccount() {
  // QueryClientProvider : la section 2FA de « Mon compte » interroge /auth/2fa/status (SH-40).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  server.use(
    http.post(url('/api/v1/auth/refresh'), () =>
      HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
    ),
    // Section 2FA (SH-40) : état par défaut, non testé ici (TwoFactorSettings.test.tsx).
    http.get(url('/api/v1/auth/2fa/status'), () => HttpResponse.json({ enabled: false })),
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

describe('Page Mon compte — libellé du rôle (SH-51)', () => {
  it('affiche « Freelance » et jamais la valeur technique', async () => {
    renderAccount();
    expect(await screen.findByText('Freelance')).toBeInTheDocument();
    expect(screen.queryByText('FREELANCE')).not.toBeInTheDocument();
  });
});

const RECRUITER_TOKEN = fakeJwt({
  userId: 'u-2',
  email: 'recruteur@skillhunt.io',
  role: 'RECRUITER',
});

describe('Page Mon compte — étanchéité RBAC des actions (SH-51)', () => {
  it("propose l'Armurerie à un freelance", async () => {
    renderAccount();
    expect(await screen.findByRole('link', { name: /mon armurerie/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /recherche/i })).not.toBeInTheDocument();
  });

  it("ne propose jamais l'Armurerie à un recruteur", async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () =>
        HttpResponse.json({ accessToken: RECRUITER_TOKEN, refreshToken: 'r' }),
      ),
    );
    renderAccount();
    expect(await screen.findByRole('link', { name: /recherche/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /armurerie/i })).not.toBeInTheDocument();
  });
});
