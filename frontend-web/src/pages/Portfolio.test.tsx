import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@/test/server';
import Portfolio from './Portfolio';

function renderPage() {
  // `useMyMedia` définit sa propre politique de retry (3 essais sur 5xx), qui prime sur
  // `retry: false` ici (cf. useMyMedia.test.tsx) — `retryDelay: 0` évite d'allonger le test
  // du délai exponentiel par défaut avant que le cas d'erreur ne se stabilise.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function media(id: string, status: string, title: string) {
  return {
    id,
    freelanceId: 'u-1',
    title,
    description: null,
    type: 'VIDEO',
    status,
    durationSeconds: null,
    width: null,
    height: null,
    sizeBytes: null,
    mimeType: 'video/mp4',
    renditions: null,
    errorReason: null,
    createdAt: '2026-08-31T10:00:00.000Z',
    processedAt: null,
  };
}

describe('Portfolio', () => {
  it('invite à publier quand le portfolio est vide', async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderPage();

    expect(await screen.findByText(/ton portfolio est vide/i)).toBeInTheDocument();
  });

  it('affiche les médias et annonce ce qui est en cours', async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({
          items: [media('m-1', 'READY', 'Survol'), media('m-2', 'UPLOADED', 'Inspection')],
          total: 2,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderPage();

    expect(await screen.findByText('Survol')).toBeInTheDocument();
    // Un utilisateur de lecteur d'écran ne doit pas avoir à relire la grille pour savoir
    // que quelque chose bouge.
    expect(await screen.findByText(/1 vidéo en cours de traitement/i)).toBeInTheDocument();
  });

  it("n'annonce rien quand tout est stabilisé", async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({
          items: [media('m-1', 'READY', 'Survol')],
          total: 1,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderPage();

    expect(await screen.findByText('Survol')).toBeInTheDocument();
    // La région d'annonce DOIT rester dans le DOM, mais VIDE : une région qui disparaît et
    // réapparaît est annoncée de façon peu fiable par les lecteurs d'écran. On teste donc
    // que la région existe ET que son contenu est vide, pas seulement que le texte est absent.
    // Par test id, pas par rôle : `getByRole('paragraph')` suppose qu'il n'existe qu'un seul
    // <p> sur la page — un second <p> ajouté ailleurs le casserait avec une erreur ambiguë.
    const liveRegion = screen.getByTestId('portfolio-live-status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveTextContent('');
  });

  it('signale une erreur de chargement au lieu de rester vide', async () => {
    server.use(http.get('*/api/v1/media/me', () => new HttpResponse(null, { status: 500 })));
    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
