import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GearEmptyState } from './GearEmptyState';

describe('GearEmptyState — casier vide (SH-21a, CTA activé en SH-43)', () => {
  it("affiche le message d'arsenal vide, l'impact sur le matching et un CTA vers la déclaration", () => {
    render(<GearEmptyState />, { wrapper: MemoryRouter });

    expect(screen.getByRole('heading', { name: 'Ton arsenal est vide' })).toBeInTheDocument();
    expect(screen.getByText(/matching/i)).toBeInTheDocument();

    // Le CTA est désormais un LIEN actif vers l'écran de déclaration (SH-43) : s'il redevenait
    // un bouton désactivé ou pointait ailleurs, ce test rougit.
    const cta = screen.getByRole('link', { name: '+ Ajouter mon premier équipement' });
    expect(cta).toHaveAttribute('href', '/mon-armurerie/ajouter');
  });
});
