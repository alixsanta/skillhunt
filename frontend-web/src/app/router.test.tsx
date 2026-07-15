import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/session-store';
import { routes } from './routes';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

// Depuis SH-20, `Home` consomme useAuth() : il faut donc un <AuthProvider> et simuler
// le refresh silencieux du démarrage (ici en échec, visiteur non connecté).
// <StrictMode> généralisé (SH-41) : même runtime que `npm run dev` (double montage des effets).
function renderAt(path: string) {
  const memoryRouter = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <StrictMode>
      <AuthProvider>
        <RouterProvider router={memoryRouter} />
      </AuthProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  server.use(http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })));
});
afterEach(() => sessionStore.clear());

describe('router', () => {
  it('rend la page d’accueil sur /', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: /skillhunt/i })).toBeInTheDocument();
  });

  it('rend la page 404 sur une route inconnue', async () => {
    renderAt('/route-inexistante');
    expect(await screen.findByRole('heading', { name: /404/i })).toBeInTheDocument();
  });

  it('redirige un visiteur non connecté de /mon-armurerie vers /login', async () => {
    renderAt('/mon-armurerie');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });
});
