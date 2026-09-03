import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import AddGear from './AddGear';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/mon-armurerie/ajouter']}>
        <Routes>
          <Route path="/mon-armurerie/ajouter" element={children} />
          {/* Cible de la redirection post-création : un marqueur suffit, la vraie page
              Armurerie a ses propres tests. */}
          <Route path="/mon-armurerie" element={<p>PAGE ARMURERIE</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(<AddGear />, { wrapper });
}

async function fillValidForm() {
  await userEvent.selectOptions(screen.getByLabelText('Catégorie'), 'CAMERA_360');
  await userEvent.type(screen.getByLabelText('Marque'), 'Insta360');
  await userEvent.type(screen.getByLabelText('Modèle'), 'Pro 2');
  await userEvent.type(screen.getByLabelText('Numéro de série'), 'SN-99999');
}

describe('Page Déclarer un équipement (SH-43)', () => {
  it("crée l'équipement puis redirige vers « Mon Armurerie »", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(url('/api/v1/gear'), async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(
          {
            id: 'g-new',
            brand: 'Insta360',
            model: 'Pro 2',
            serialNumber: 'SN-99999',
            category: 'CAMERA_360',
            status: 'PENDING',
            createdAt: '2026-07-16T10:00:00.000Z',
            freelanceId: 'u-1',
          },
          { status: 201 },
        );
      }),
    );

    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Déclarer cet équipement' }));

    expect(await screen.findByText('PAGE ARMURERIE')).toBeInTheDocument();
    expect(receivedBody).toEqual({
      brand: 'Insta360',
      model: 'Pro 2',
      serialNumber: 'SN-99999',
      category: 'CAMERA_360',
    });
  });

  it('bloque la soumission côté client quand des champs requis sont vides — SANS appel réseau', async () => {
    // Aucun handler MSW enregistré : le serveur de test est en `onUnhandledRequest: 'error'`,
    // donc le moindre appel réseau ferait échouer ce test. C'est la preuve demandée par la
    // DoD (« validation client prouvée sans appel réseau », C2.2.3).
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Déclarer cet équipement' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('Choisis une catégorie.')).toBeInTheDocument();
    expect(screen.getByText('La marque est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Le modèle est obligatoire.')).toBeInTheDocument();
    expect(
      screen.getByText('Le numéro de série doit contenir au moins 5 caractères.'),
    ).toBeInTheDocument();
  });

  it('refuse un numéro de série trop court (< 5 caractères) sans appel réseau', async () => {
    renderPage();

    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), 'DRONE');
    await userEvent.type(screen.getByLabelText('Marque'), 'DJI');
    await userEvent.type(screen.getByLabelText('Modèle'), 'Mavic 3');
    await userEvent.type(screen.getByLabelText('Numéro de série'), 'SN-1');
    await userEvent.click(screen.getByRole('button', { name: 'Déclarer cet équipement' }));

    expect(
      await screen.findByText('Le numéro de série doit contenir au moins 5 caractères.'),
    ).toBeInTheDocument();
  });

  it('affiche lisiblement les erreurs de validation renvoyées par le backend (400)', async () => {
    server.use(
      http.post(url('/api/v1/gear'), () =>
        HttpResponse.json(
          { message: ['La catégorie de matériel est invalide'], statusCode: 400 },
          { status: 400 },
        ),
      ),
    );

    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Déclarer cet équipement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La catégorie de matériel est invalide',
    );
    // Pas de redirection : on reste sur le formulaire pour corriger.
    expect(screen.queryByText('PAGE ARMURERIE')).not.toBeInTheDocument();
  });

  it("affiche un message générique quand l'API est indisponible (5xx)", async () => {
    server.use(http.post(url('/api/v1/gear'), () => new HttpResponse(null, { status: 500 })));

    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Déclarer cet équipement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/impossible de déclarer/i);
  });
});

describe('Déclaration de matériel — catalogue (SH-51)', () => {
  it('propose les marques de la catégorie choisie', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/catégorie/i), 'DRONE');
    const marque = screen.getByLabelText(/marque/i);
    const listeId = marque.getAttribute('list');
    expect(listeId).not.toBeNull();

    const options = document.getElementById(listeId as string)?.querySelectorAll('option');
    const valeurs = Array.from(options ?? []).map((option) => option.getAttribute('value'));
    expect(valeurs).toContain('DJI');
  });

  it('propose les modèles une fois la marque saisie', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/catégorie/i), 'DRONE');
    await user.type(screen.getByLabelText(/marque/i), 'DJI');

    const modele = screen.getByLabelText(/modèle/i);
    const listeId = modele.getAttribute('list');
    const options = document.getElementById(listeId as string)?.querySelectorAll('option');
    const valeurs = Array.from(options ?? []).map((option) => option.getAttribute('value'));
    expect(valeurs).toContain('Mavic 3 Enterprise');
  });

  it('accepte un matériel absent du catalogue', async () => {
    // Le catalogue assiste, il ne contraint pas : la saisie libre reste possible.
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/catégorie/i), 'DRONE');
    await user.type(screen.getByLabelText(/marque/i), 'Marque Confidentielle');
    await user.type(screen.getByLabelText(/modèle/i), 'Prototype 01');

    expect(screen.getByLabelText(/marque/i)).toHaveValue('Marque Confidentielle');
    expect(screen.getByLabelText(/modèle/i)).toHaveValue('Prototype 01');
  });
});
