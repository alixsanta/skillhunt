import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/session-store';
import Login from './Login';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const TOKEN = fakeJwt({ userId: 'u-1', email: 'pro@skillhunt.io', role: 'RECRUITER' });

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  server.use(http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })));
});
afterEach(() => sessionStore.clear());

describe('Écran de connexion (SH-20)', () => {
  it("affiche un message d'erreur en français sur identifiants invalides", async () => {
    server.use(http.post(url('/api/v1/auth/login'), () => new HttpResponse(null, { status: 401 })));

    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email'), 'pilote@skillhunt.io');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'mauvaispass');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    // Message volontairement générique : ne révèle pas si l'email existe (anti-énumération).
    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou mot de passe incorrect');
  });

  it('2FA active : le login demande le code SANS ouvrir de session, puis la vérification connecte (SH-40)', async () => {
    let verifyBody: unknown = null;
    server.use(
      http.post(url('/api/v1/auth/login'), () =>
        HttpResponse.json({ twoFactorRequired: true, twoFactorToken: 'jeton-etape' }),
      ),
      http.post(url('/api/v1/auth/2fa/verify'), async ({ request }) => {
        verifyBody = await request.json();
        return HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' });
      }),
    );

    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'pro@skillhunt.io');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'motdepasse8');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    // Étape 2 : le champ code apparaît, AUCUNE session n'existe encore
    expect(await screen.findByLabelText('Code de vérification')).toBeInTheDocument();
    expect(sessionStore.getAccessToken()).toBeNull();

    await userEvent.type(screen.getByLabelText('Code de vérification'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Valider le code' }));

    await waitFor(() => expect(sessionStore.getAccessToken()).toBe(TOKEN));
    expect(verifyBody).toEqual({ twoFactorToken: 'jeton-etape', code: '123456' });
  });

  it('2FA : un code refusé affiche une erreur et la session reste vide (SH-40)', async () => {
    server.use(
      http.post(url('/api/v1/auth/login'), () =>
        HttpResponse.json({ twoFactorRequired: true, twoFactorToken: 'jeton-etape' }),
      ),
      http.post(url('/api/v1/auth/2fa/verify'), () => new HttpResponse(null, { status: 401 })),
    );

    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'pro@skillhunt.io');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'motdepasse8');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    await userEvent.type(await screen.findByLabelText('Code de vérification'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Valider le code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/code de vérification invalide/i);
    expect(sessionStore.getAccessToken()).toBeNull();
  });

  it('refuse un mot de passe trop court sans appeler le backend', async () => {
    // Aucun handler /login : si le formulaire appelait le backend, MSW ferait échouer le test.
    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email'), 'pilote@skillhunt.io');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'court');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('au moins 8 caractères');
  });

  it("n'affiche pas le formulaire tant que la session est en cours de restauration (SH-51)", async () => {
    // Non-régression : Login décidait sur `user` seul. AuthProvider démarre en status
    // 'restoring' avec `user` nul le temps du refresh silencieux — un utilisateur déjà connecté
    // voyait donc l'écran de connexion avant un saut vers son écran de travail.
    server.use(
      http.post(url('/api/v1/auth/refresh'), async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new HttpResponse(null, { status: 401 });
      }),
    );

    renderLogin();

    // Même texte d'attente que ProtectedRoute : un seul comportement à expliquer.
    expect(screen.getByText('Chargement de votre session…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connexion' })).not.toBeInTheDocument();

    // Une fois la restauration terminée (ici : échec, visiteur anonyme), le formulaire apparaît.
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });
});
