import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { rotatingRefreshHandler } from '@/test/auth-handlers';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import { sessionStore } from './session-store';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const TOKEN = fakeJwt({ userId: 'u-1', email: 'pilote@skillhunt.io', role: 'FREELANCE' });
const url = (path: string) => `${DEFAULT_API_URL}${path}`;

// Sonde : affiche l'état de la session et permet de déclencher les actions.
function Probe() {
  const { user, status, login, logout } = useAuth();

  if (status === 'restoring') {
    return <p>Restauration de la session…</p>;
  }

  return (
    <div>
      <p>{user ? `Connecté : ${user.email}` : 'Déconnecté'}</p>
      <button onClick={() => login('pilote@skillhunt.io', 'motdepasse8')}>Se connecter</button>
      <button onClick={() => logout()}>Se déconnecter</button>
    </div>
  );
}

// TOUS les rendus passent sous <StrictMode> (SH-41) : le double montage/démontage des effets
// est le comportement de `npm run dev` — c'est lui qui avait révélé la double rotation du
// cookie (bug 2 de SH-20). Tester sans StrictMode, c'est tester un runtime qui n'existe pas.
function renderProbe() {
  return render(
    <StrictMode>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </StrictMode>,
  );
}

afterEach(() => sessionStore.clear());

describe('AuthProvider (SH-20, StrictMode généralisé en SH-41)', () => {
  it('restaure la session au démarrage malgré un backend qui ROTATIONNE le refresh', async () => {
    // Handler « rotation » : un 2e appel du même cookie recevrait 401 et purgerait la
    // session — si une rotation concurrente réapparaît, ce test rougit (SH-41).
    const refresh = rotatingRefreshHandler(TOKEN);
    server.use(refresh.handler);

    renderProbe();

    // Un état de chargement est affiché tant que la restauration est en vol :
    // sans lui, les routes protégées redirigeraient vers /login à chaque F5.
    expect(screen.getByText('Restauration de la session…')).toBeInTheDocument();

    expect(await screen.findByText('Connecté : pilote@skillhunt.io')).toBeInTheDocument();

    // La session doit TENIR : un seul refresh est parti, et l'utilisateur reste connecté.
    await waitFor(() => expect(refresh.calls()).toBe(1));
    expect(screen.getByText('Connecté : pilote@skillhunt.io')).toBeInTheDocument();
    expect(sessionStore.getAccessToken()).toBe(TOKEN);
  });

  it("reste déconnecté quand aucun cookie valide n'existe", async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })),
    );

    renderProbe();

    expect(await screen.findByText('Déconnecté')).toBeInTheDocument();
  });

  it('ouvre une session au login', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })),
      http.post(url('/api/v1/auth/login'), () =>
        HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
      ),
    );

    renderProbe();
    await screen.findByText('Déconnecté');

    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('Connecté : pilote@skillhunt.io')).toBeInTheDocument();
  });

  it("ne déclenche qu'un seul refresh sous StrictMode (pas de double rotation qui se révoque, SH-20)", async () => {
    const refresh = rotatingRefreshHandler(TOKEN);
    server.use(refresh.handler);

    renderProbe();

    expect(await screen.findByText('Connecté : pilote@skillhunt.io')).toBeInTheDocument();

    // Laisse le temps à un éventuel second appel concurrent de partir avant d'asserter.
    await waitFor(() => expect(refresh.calls()).toBe(1));
  });

  it('purge la session au logout et appelle le backend (révocation Redis)', async () => {
    let logoutCalled = false;

    const refresh = rotatingRefreshHandler(TOKEN);
    server.use(
      refresh.handler,
      http.post(url('/api/v1/auth/logout'), () => {
        logoutCalled = true;
        return HttpResponse.json({ success: true });
      }),
    );

    renderProbe();
    await screen.findByText('Connecté : pilote@skillhunt.io');

    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByText('Déconnecté')).toBeInTheDocument();
    await waitFor(() => expect(logoutCalled).toBe(true));
    expect(sessionStore.getAccessToken()).toBeNull();
  });
});
