import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/session-store';
import Register from './Register';
import Account from './Account';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const TOKEN = fakeJwt({ userId: 'u-2', email: 'nouvelle@skillhunt.io', role: 'FREELANCE' });
const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function renderRegister() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/mon-compte" element={<Account />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function fillForm() {
  await userEvent.type(await screen.findByLabelText('Email'), 'nouvelle@skillhunt.io');
  await userEvent.type(screen.getByLabelText("Nom d'utilisateur"), 'nouvelle-pilote');
  await userEvent.type(screen.getByLabelText('Mot de passe'), 'motdepasse8');
  await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
}

beforeEach(() => {
  // Aucune session au démarrage : le refresh silencieux échoue (pas de cookie).
  server.use(http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })));
});
afterEach(() => sessionStore.clear());

describe("Écran d'inscription (SH-20)", () => {
  it("enchaîne automatiquement un login après le register : l'utilisateur arrive connecté", async () => {
    // `register` ne renvoie aucun token (le backend ne le fait pas) : AuthProvider doit
    // enchaîner un `login` pour que l'utilisateur arrive directement sur son compte.
    server.use(
      http.post(url('/api/v1/auth/register'), () => new HttpResponse(null, { status: 201 })),
      http.post(url('/api/v1/auth/login'), () =>
        HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
      ),
    );

    renderRegister();
    await fillForm();

    // Navigation vers /mon-compte + session ouverte : preuve que le login enchaîné a réussi.
    expect(await screen.findByText('nouvelle@skillhunt.io')).toBeInTheDocument();
    expect(sessionStore.getAccessToken()).toBe(TOKEN);
  });

  it("affiche une erreur générique quand l'inscription échoue, sans tenter de login", async () => {
    let loginCalled = false;
    server.use(
      http.post(url('/api/v1/auth/register'), () => new HttpResponse(null, { status: 409 })),
      http.post(url('/api/v1/auth/login'), () => {
        loginCalled = true;
        return HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' });
      }),
    );

    renderRegister();
    await fillForm();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Inscription impossible. Cet email est peut-être déjà utilisé.',
    );
    expect(loginCalled).toBe(false);
    expect(sessionStore.getAccessToken()).toBeNull();
  });

  it('envoie la position de la ville choisie pour un FREELANCE (SH-34)', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(url('/api/v1/auth/register'), async ({ request }) => {
        receivedBody = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
      http.post(url('/api/v1/auth/login'), () =>
        HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
      ),
    );

    renderRegister();
    // Rôle par défaut : FREELANCE → le champ ville est visible et obligatoire
    await userEvent.selectOptions(await screen.findByLabelText("Ville d'activité"), 'Toulouse');
    await fillForm();

    await screen.findByText('nouvelle@skillhunt.io');
    expect(receivedBody).toMatchObject({
      role: 'FREELANCE',
      // Champs latitude/longitude EXPLICITES (pas de tableau) : le piège d'ordre
      // GeoJSON [lon, lat] est neutralisé à la frontière API (SH-34).
      location: { latitude: 43.6045, longitude: 1.4442 },
    });
  });

  it("masque le champ ville pour un RECRUTEUR et n'envoie aucune position (SH-34)", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(url('/api/v1/auth/register'), async ({ request }) => {
        receivedBody = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
      http.post(url('/api/v1/auth/login'), () =>
        HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
      ),
    );

    renderRegister();
    await userEvent.selectOptions(await screen.findByLabelText('Je suis'), 'RECRUITER');

    expect(screen.queryByLabelText("Ville d'activité")).not.toBeInTheDocument();

    await fillForm();
    await screen.findByText('nouvelle@skillhunt.io');
    expect(receivedBody).not.toHaveProperty('location');
    expect(receivedBody).toMatchObject({ role: 'RECRUITER' });
  });

  it('refuse un mot de passe trop court sans appeler le backend', async () => {
    // Aucun handler /register : si le formulaire appelait le backend, MSW ferait échouer le test.
    renderRegister();

    await userEvent.type(await screen.findByLabelText('Email'), 'nouvelle@skillhunt.io');
    await userEvent.type(screen.getByLabelText("Nom d'utilisateur"), 'nouvelle-pilote');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'court');
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('au moins 8 caractères');
  });
});
