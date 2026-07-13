import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/session-store';
import Login from './Login';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

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

  it('refuse un mot de passe trop court sans appeler le backend', async () => {
    // Aucun handler /login : si le formulaire appelait le backend, MSW ferait échouer le test.
    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email'), 'pilote@skillhunt.io');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'court');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('au moins 8 caractères');
  });
});
