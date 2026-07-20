import { render, screen, within } from '@testing-library/react';
import { BadgeGrid } from './BadgeGrid';

const badges = [
  {
    id: 'first-validated',
    label: 'Première validation',
    description: 'Un premier équipement validé par un admin',
    earned: true,
  },
  { id: 'arsenal-5', label: 'Arsenal étoffé', description: '5 équipements validés', earned: false },
];

describe('BadgeGrid (SH-21c)', () => {
  it("chaque badge porte son libellé ET son état en texte — jamais l'opacité seule (R6)", () => {
    render(<BadgeGrid badges={badges} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Première validation')).toBeInTheDocument();
    expect(within(items[0]).getByText('Obtenu')).toBeInTheDocument();
    expect(within(items[1]).getByText('À débloquer')).toBeInTheDocument();
  });

  it('mode public : badges sans earned = tous affichés comme obtenus', () => {
    render(
      <BadgeGrid
        badges={[{ id: 'certified', label: 'Certifié', description: 'Une certification validée' }]}
      />,
    );
    expect(screen.getByText('Obtenu')).toBeInTheDocument();
  });
});
