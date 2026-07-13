import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { sessionStore } from '@/features/auth/session-store';
import { AppProviders } from './providers';
import App from './App';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

// Depuis SH-20, `Home` consomme useAuth() : il faut donc les providers applicatifs
// (comme dans main.tsx) et simuler le refresh silencieux du démarrage (échec ici,
// visiteur non connecté).
beforeEach(() => {
  server.use(http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })));
});
afterEach(() => sessionStore.clear());

describe('App', () => {
  it('monte le routeur et affiche la page d’accueil par défaut', async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );
    expect(await screen.findByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /skillhunt/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /se connecter/i })).toBeInTheDocument();
  });
});
