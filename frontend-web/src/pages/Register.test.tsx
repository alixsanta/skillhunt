import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/session-store';
import Register from './Register';

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
          {/* Cible post-inscription (SH-51) : marqueur léger, sur le même principe que
              ProtectedRoute.test.tsx — la vraie Armurerie n'a pas à être montée ici, seule
              la destination de la redirection est sous test. Le mock de /login renvoie
              toujours un token de rôle FREELANCE (voir TOKEN plus haut), donc /recherche
              (destination RECRUITER) n'est jamais atteinte dans ce fichier. */}
          <Route path="/mon-armurerie" element={<p>Armurerie du freelance</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function fillForm() {
  // Mot de passe conforme à RegisterDto (SH-51) : 12+ caractères, minuscule, majuscule, chiffre.
  const password = 'PiloteDrone2026';
  await userEvent.type(await screen.findByLabelText('Email'), 'nouvelle@skillhunt.io');
  await userEvent.type(screen.getByLabelText("Nom d'utilisateur"), 'nouvelle-pilote');
  await userEvent.type(screen.getByLabelText('Mot de passe'), password);
  await userEvent.type(screen.getByLabelText('Confirmation du mot de passe'), password);
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
    // enchaîner un `login` pour que l'utilisateur arrive directement sur son écran de
    // travail (SH-51).
    server.use(
      http.post(url('/api/v1/auth/register'), () => new HttpResponse(null, { status: 201 })),
      http.post(url('/api/v1/auth/login'), () =>
        HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
      ),
    );

    renderRegister();
    await fillForm();

    // Navigation vers l'écran de travail du FREELANCE (SH-51) + session ouverte : preuve
    // que le login enchaîné a réussi.
    expect(await screen.findByText('Armurerie du freelance')).toBeInTheDocument();
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

    await screen.findByText('Armurerie du freelance');
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
    // Le mock de /login renvoie toujours TOKEN (rôle FREELANCE, cf. plus haut), quel que
    // soit le rôle soumis à l'inscription : la destination suit le rôle réellement porté
    // par le token émis, pas le rôle choisi dans le formulaire.
    await screen.findByText('Armurerie du freelance');
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

    // SH-51 : la règle est passée de 8 caractères à un mot de passe robuste (12+, minuscule,
    // majuscule, chiffre) ; le message a suivi.
    expect(await screen.findByRole('alert')).toHaveTextContent('ne respecte pas toutes les règles');
  });

  it("n'affiche pas le formulaire tant que la session est en cours de restauration (SH-51)", async () => {
    // Non-régression : Register décidait sur `user` seul. AuthProvider démarre en status
    // 'restoring' avec `user` nul le temps du refresh silencieux — un utilisateur déjà connecté
    // voyait donc l'écran d'inscription avant un saut vers son écran de travail.
    server.use(
      http.post(url('/api/v1/auth/refresh'), async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new HttpResponse(null, { status: 401 });
      }),
    );

    renderRegister();

    // Même texte d'attente que ProtectedRoute : un seul comportement à expliquer.
    expect(screen.getByText('Chargement de votre session…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Créer un compte' })).not.toBeInTheDocument();

    // Une fois la restauration terminée (ici : échec, visiteur anonyme), le formulaire apparaît.
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });
});

describe('Inscription — robustesse du mot de passe (SH-51)', () => {
  it('refuse un mot de passe faible sans émettre le moindre appel réseau', async () => {
    // MSW est en `onUnhandledRequest: 'error'` : aucune route register n'est simulée ici,
    // donc si le formulaire appelait l'API, le test échouerait de lui-même.
    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/^email$/i), 'jury@skillhunt.io');
    await user.type(screen.getByLabelText(/nom d'utilisateur/i), 'PiloteJury');
    await user.type(screen.getByLabelText(/^mot de passe$/i), 'motdepasse');
    await user.type(screen.getByLabelText(/confirmation/i), 'motdepasse');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/mot de passe/i);
  });

  it('signale une confirmation divergente', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/^email$/i), 'jury@skillhunt.io');
    await user.type(screen.getByLabelText(/nom d'utilisateur/i), 'PiloteJury');
    await user.type(screen.getByLabelText(/^mot de passe$/i), 'PiloteDrone2026');
    await user.type(screen.getByLabelText(/confirmation/i), 'PiloteDrone2027');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ne correspondent pas/i);
  });

  it('coche les règles au fur et à mesure de la saisie', async () => {
    const user = userEvent.setup();
    renderRegister();

    const liste = await screen.findByRole('list', { name: /règles du mot de passe/i });
    // Champ vide : aucune règle n'est encore respectée.
    expect(within(liste).queryAllByRole('listitem', { name: /: respectée$/ })).toHaveLength(0);

    await user.type(screen.getByLabelText(/^mot de passe$/i), 'PiloteDrone2026');

    // L'état est lu par le NOM ACCESSIBLE, jamais par un attribut technique (convention du
    // CLAUDE.md front). Le test prouve du même coup que la progression est audible (R6).
    expect(within(liste).getAllByRole('listitem', { name: /: respectée$/ })).toHaveLength(4);
  });
});
