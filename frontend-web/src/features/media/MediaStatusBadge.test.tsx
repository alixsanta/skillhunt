import { render, screen } from '@testing-library/react';
import { MediaStatusBadge } from './MediaStatusBadge';

describe('MediaStatusBadge', () => {
  it.each([
    ['DRAFT', 'BROUILLON'],
    ['UPLOADED', 'DÉPOSÉE'],
    ['PROCESSING', 'EN TRAITEMENT'],
    ['READY', 'PRÊT'],
    ['FAILED', 'ÉCHEC'],
  ] as const)('affiche le libellé texte du statut %s', (status, label) => {
    render(<MediaStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('rend la pastille décorative invisible aux lecteurs d\'écran', () => {
    const { container } = render(<MediaStatusBadge status="READY" />);
    // Le statut doit rester lisible sans percevoir la couleur : c'est le texte qui porte
    // l'information, la pastille n'est qu'un rappel visuel.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
