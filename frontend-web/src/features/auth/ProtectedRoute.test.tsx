import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { rotatingRefreshHandler } from '@/test/auth-handlers';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';
import { sessionStore } from './session-store';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const TOKEN = fakeJwt({ userId: 'u-1', email: 'pilote@skillhunt.io', role: 'FREELANCE' });
const url = (path: string) => `${DEFAULT_API_URL}${path}`;

// <StrictMode> généralisé (SH-41) : le double montage des effets est le runtime réel
// de `npm run dev` — c'est lui qui avait révélé la double rotation du cookie (SH-20).
function renderAt(path: string) {
  return render(
    <StrictMode>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<p>Écran de connexion</p>} />
            <Route
              path="/mon-compte"
              element={
                <ProtectedRoute>
                  <p>Contenu protégé</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </StrictMode>,
  );
}

afterEach(() => sessionStore.clear());

describe('ProtectedRoute (SH-20)', () => {
  it('redirige un visiteur non authentifié vers /login', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })),
    );

    renderAt('/mon-compte');

    expect(await screen.findByText('Écran de connexion')).toBeInTheDocument();
    expect(screen.queryByText('Contenu protégé')).not.toBeInTheDocument();
  });

  it('laisse passer un utilisateur authentifié (backend qui rotationne simulé, SH-41)', async () => {
    const refresh = rotatingRefreshHandler(TOKEN);
    server.use(refresh.handler);

    renderAt('/mon-compte');

    expect(await screen.findByText('Contenu protégé')).toBeInTheDocument();
  });

  it('ne redirige PAS tant que la session est en cours de restauration', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), async () => {
        // Réponse lente : on veut observer l'état intermédiaire.
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' });
      }),
    );

    renderAt('/mon-compte');

    // Le piège : sans état 'restoring', l'utilisateur serait éjecté vers /login à chaque F5.
    expect(screen.queryByText('Écran de connexion')).not.toBeInTheDocument();
    expect(await screen.findByText('Contenu protégé')).toBeInTheDocument();
  });
});
