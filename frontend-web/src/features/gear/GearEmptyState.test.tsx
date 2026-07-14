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
  });
});
