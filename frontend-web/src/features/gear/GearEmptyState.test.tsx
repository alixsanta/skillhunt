import { render, screen } from '@testing-library/react';
import { GearEmptyState } from './GearEmptyState';

describe('GearEmptyState — casier vide (SH-21a)', () => {
  it("affiche le message d'arsenal vide, l'impact sur le matching et un CTA unique", () => {
    render(<GearEmptyState />);

    expect(screen.getByRole('heading', { name: 'Ton arsenal est vide' })).toBeInTheDocument();
    expect(screen.getByText(/matching/i)).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('+ Ajouter mon premier équipement');
    // Le CTA est DÉSACTIVÉ tant que l'écran de déclaration n'existe pas (hors périmètre
    // SH-21a) : sans cette assertion, la perte du `disabled` rendrait le bouton cliquable
    // vers une route inexistante sans qu'aucun test ne rougisse.
    expect(buttons[0]).toBeDisabled();
  });
});
