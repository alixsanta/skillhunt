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

  it("refuse de publier un fichier d'un type non supporté, sans appeler l'API", async () => {
    // `applyAccept: false` : par défaut, `user.upload` filtre lui-même selon l'attribut
    // `accept`, ce qui masquerait exactement le trou qu'on vérifie ici. En vrai, le
    // sélecteur « tous les fichiers » et le glisser-déposer ignorent `accept` — c'est ce
    // qu'on reproduit en désactivant ce filtrage côté test.
    const user = userEvent.setup({ applyAccept: false });
    renderPage();

    await user.type(screen.getByLabelText(/titre/i), 'Survol de chantier');
    await user.upload(
      screen.getByLabelText(/fichier/i),
      new File(['x'], 'photo.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: /publier/i }));

    // Aucun handler n'est enregistré : si l'API était appelée malgré le type refusé, le
    // harnais (`onUnhandledRequest: 'error'`) ferait échouer le test.
    expect(await screen.findByText(/format non supporté/i)).toBeInTheDocument();
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

  it('affiche le message du backend sur un 409 (quota atteint), pas le générique', async () => {
    // Le générique (« réessaie dans un instant ») est la pire réponse possible sur un 409
    // quota : chaque réessai déclare un nouveau `DRAFT`, qui compte lui-même dans le quota.
    server.use(
      http.post('*/api/v1/media', () =>
        HttpResponse.json(
          { message: 'Quota atteint : 20 médias au maximum. Supprimez-en un avant d\'en ajouter.' },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    await fillAndSubmit();

    expect(
      await screen.findByText(/quota atteint.*20 médias au maximum/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/réessaie dans un instant/i)).not.toBeInTheDocument();
  });

  it('annonce une valeur numérique uniquement pendant le dépôt, phases indéterminées sinon', async () => {
    // Chaque appel est bloqué tant qu'on ne le libère pas explicitement, pour observer
    // chaque phase sans dépendre d'un timing de résolution réseau.
    let resolveDeclare: (() => void) | undefined;
    const declarePromise = new Promise<void>((resolve) => {
      resolveDeclare = resolve;
    });
    let resolvePut: (() => void) | undefined;
    const putPromise = new Promise<void>((resolve) => {
      resolvePut = resolve;
    });
    let resolveComplete: (() => void) | undefined;
    const completePromise = new Promise<void>((resolve) => {
      resolveComplete = resolve;
    });

    server.use(
      http.post('*/api/v1/media', async () => {
        await declarePromise;
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
      http.put(STORAGE_URL, async () => {
        await putPromise;
        return new HttpResponse(null, { status: 200 });
      }),
      http.post('*/api/v1/media/m-1/complete', async () => {
        await completePromise;
        return HttpResponse.json({ id: 'm-1', status: 'UPLOADED' });
      }),
    );

    renderPage();
    const submitted = fillAndSubmit();

    // Déclaration : progression indéterminée — pas de valeur numérique fictive.
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuetext',
        'Déclaration en cours…',
      );
    });
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');

    resolveDeclare?.();

    // Dépôt : seule phase à progression connue en octets, donc seule à porter une valeur.
    await waitFor(() => {
      expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toMatch(/^Envoi/);
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow');

    resolvePut?.();

    // Confirmation : de nouveau indéterminée.
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuetext',
        'Confirmation en cours…',
      );
    });
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');

    resolveComplete?.();
    await submitted;
  });
});
