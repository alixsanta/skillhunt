import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@/test/server';
import { MediaDeleteControl } from './MediaDeleteControl';
import { myMediaQueryKey } from './useMyMedia';

function renderControl() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <MediaDeleteControl mediaId="m-1" title="Survol de chantier" />
    </QueryClientProvider>,
  );
  return { invalidate };
}

const boutonSupprimer = () =>
  screen.getByRole('button', { name: 'Supprimer « Survol de chantier »' });

// SH-54 — avant ce ticket, un quota plein était une impasse : le backend disait
// « Supprimez-en un » et l'interface n'offrait aucun moyen de le faire.
describe('MediaDeleteControl (SH-54)', () => {
  it("ne supprime RIEN au premier clic : il demande d'abord confirmation", async () => {
    // Aucun handler DELETE n'est enregistré : si la requête partait dès le premier clic,
    // le harnais (`onUnhandledRequest: 'error'`) ferait échouer ce test.
    const user = userEvent.setup();
    renderControl();

    await user.click(boutonSupprimer());

    expect(screen.getByText(/supprimer définitivement cette vidéo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer la suppression' })).toBeInTheDocument();
    // Le focus arrive sur le choix SÛR : une suppression est irréversible, la touche
    // Entrée ne doit pas la déclencher par inertie.
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
  });

  it("revient à l'état initial sur « Annuler », et rend le focus au bouton d'origine", async () => {
    const user = userEvent.setup();
    renderControl();

    await user.click(boutonSupprimer());
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByText(/supprimer définitivement/i)).not.toBeInTheDocument();
    // Sans ce retour, le focus serait perdu avec le panneau démonté, et un utilisateur
    // au clavier repartirait du haut de la page.
    expect(boutonSupprimer()).toHaveFocus();
  });

  it('envoie DELETE sur le bon média une fois confirmé, puis recharge le portfolio', async () => {
    const supprimes: string[] = [];
    server.use(
      http.delete('*/api/v1/media/:id', ({ params }) => {
        supprimes.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const { invalidate } = renderControl();

    await user.click(boutonSupprimer());
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    await waitFor(() => expect(supprimes).toEqual(['m-1']));
    // La grille ET le compteur de la page compte lisent cette même clé de requête.
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: myMediaQueryKey }));
  });

  it('affiche le message du backend sur un 409 (transcodage en cours)', async () => {
    // « Réessaie » serait trompeur ici : le backend explique POURQUOI ce n'est pas
    // possible maintenant, on affiche son message tel quel.
    server.use(
      http.delete('*/api/v1/media/:id', () =>
        HttpResponse.json(
          { message: 'Transcodage en cours : réessayez la suppression dans quelques instants.' },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    const { invalidate } = renderControl();

    await user.click(boutonSupprimer());
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent(/transcodage en cours/i);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('affiche un message générique sur une erreur serveur', async () => {
    server.use(http.delete('*/api/v1/media/:id', () => new HttpResponse(null, { status: 500 })));
    const user = userEvent.setup();
    renderControl();

    await user.click(boutonSupprimer());
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/la suppression a échoué/i);
  });

  it('verrouille les boutons pendant la suppression : pas de double envoi', async () => {
    let appels = 0;
    server.use(
      http.delete('*/api/v1/media/:id', async () => {
        appels += 1;
        await delay(150);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderControl();

    await user.click(boutonSupprimer());
    const confirmer = screen.getByRole('button', { name: 'Confirmer la suppression' });
    await user.click(confirmer);

    expect(confirmer).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    await user.click(confirmer);
    await waitFor(() => expect(appels).toBe(1));
  });
});
