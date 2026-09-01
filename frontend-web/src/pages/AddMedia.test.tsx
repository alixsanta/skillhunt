import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@/test/server';
import AddMedia from './AddMedia';

const STORAGE_URL = 'http://localhost:4566/skillhunt-media/private/media/f1/m1/master.mp4';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AddMedia />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/titre/i), 'Survol de chantier');
  await user.upload(
    screen.getByLabelText(/fichier/i),
    new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
  );
  await user.click(screen.getByRole('button', { name: /publier/i }));
}

describe('AddMedia', () => {
  it("refuse de publier sans titre, sans appeler l'API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(
      screen.getByLabelText(/fichier/i),
      new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
    );
    await user.click(screen.getByRole('button', { name: /publier/i }));

    // Aucun handler n'est enregistré : si l'API était appelée, le harnais
    // (`onUnhandledRequest: 'error'`) ferait échouer le test.
    expect(await screen.findByText(/le titre est obligatoire/i)).toBeInTheDocument();
  });

  it('enchaîne déclaration, dépôt direct puis confirmation', async () => {
    const appels: string[] = [];
    server.use(
      http.post('*/api/v1/media', async () => {
        appels.push('declare');
        return HttpResponse.json({
          media: { id: 'm-1', status: 'DRAFT', title: 'Survol de chantier' },
          upload: {
            url: STORAGE_URL,
            method: 'PUT',
            headers: { 'Content-Type': 'video/mp4' },
            expiresIn: 900,
          },
        });
      }),
      http.put(STORAGE_URL, () => {
        appels.push('depot');
        return new HttpResponse(null, { status: 200 });
      }),
      http.post('*/api/v1/media/m-1/complete', () => {
        appels.push('confirme');
        return HttpResponse.json({ id: 'm-1', status: 'UPLOADED' });
      }),
    );

    renderPage();
    await fillAndSubmit();

    await waitFor(() => expect(appels).toEqual(['declare', 'depot', 'confirme']));
  });

  it('ne confirme pas quand le dépôt échoue, et propose de réessayer', async () => {
    let confirmed = false;
    server.use(
      http.post('*/api/v1/media', () =>
        HttpResponse.json({
          media: { id: 'm-1', status: 'DRAFT', title: 'Survol de chantier' },
          upload: {
            url: STORAGE_URL,
            method: 'PUT',
            headers: { 'Content-Type': 'video/mp4' },
            expiresIn: 900,
          },
        }),
      ),
      http.put(STORAGE_URL, () => new HttpResponse(null, { status: 403 })),
      http.post('*/api/v1/media/m-1/complete', () => {
        confirmed = true;
        return HttpResponse.json({ id: 'm-1', status: 'UPLOADED' });
      }),
    );

    renderPage();
    await fillAndSubmit();

    expect(await screen.findByText(/l'envoi a échoué/i)).toBeInTheDocument();
    // Confirmer un dépôt qui a échoué ferait entrer un média sans fichier dans le portfolio.
    expect(confirmed).toBe(false);
  });

  it("expose la progression du dépôt aux technologies d'assistance", async () => {
    server.use(
      http.post('*/api/v1/media', () =>
        HttpResponse.json({
          media: { id: 'm-1', status: 'DRAFT', title: 'Survol de chantier' },
          upload: {
            url: STORAGE_URL,
            method: 'PUT',
            headers: { 'Content-Type': 'video/mp4' },
            expiresIn: 900,
          },
        }),
      ),
      http.put(STORAGE_URL, () => new HttpResponse(null, { status: 200 })),
      http.post('*/api/v1/media/m-1/complete', () =>
        HttpResponse.json({ id: 'm-1', status: 'UPLOADED' }),
      ),
    );

    renderPage();
    await fillAndSubmit();

    // Une barre qui grandit sans rôle ni valeur ne dit rien à un lecteur d'écran.
    const barre = await screen.findByRole('progressbar');
    expect(barre).toHaveAttribute('aria-valuenow');
  });
});
