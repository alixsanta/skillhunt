import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/session-store';
import Home from './Home';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function renderHome() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => sessionStore.clear());

describe("Page d'accueil — attente de la session avant décision (SH-51)", () => {
  it("n'affiche ni le hero ni une redirection tant que la session est en cours de restauration", async () => {
    // Non-régression : Home décidait sur `user` seul. AuthProvider démarre en
    // status 'restoring' avec `user` nul le temps du refresh silencieux — un visiteur voyait
    // donc le hero public avant un éventuel saut vers son écran, dès l'ouverture de l'appli.
    server.use(
      http.post(url('/api/v1/auth/refresh'), async () => {
        // Réponse lente : on observe l'état intermédiaire, comme ProtectedRoute.test.tsx.
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new HttpResponse(null, { status: 401 });
      }),
    );

    renderHome();

    // Même texte d'attente que ProtectedRoute : un seul comportement à expliquer.
    expect(screen.getByText('Chargement de votre session…')).toBeInTheDocument();
    expect(screen.queryByText(/preuve de compétence/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument();

    // Une fois la restauration terminée (ici : échec, visiteur anonyme), le hero apparaît.
    expect(await screen.findByRole('link', { name: 'Se connecter' })).toBeInTheDocument();
  });
});
