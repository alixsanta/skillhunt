import { render, screen } from '@testing-library/react';
import { GearProgress } from './GearProgress';

describe('GearProgress — part de matériel validé (SH-21a)', () => {
  it('affiche le ratio et le pourcentage validé', () => {
    render(<GearProgress validated={3} total={12} />);
    expect(screen.getByText('3/12')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('arrondit le pourcentage au plus proche (et non vers le bas)', () => {
    // 5/8 = 62,5 % : le seul cas qui distingue Math.round (63) de Math.floor (62). Sans lui,
    // le test précédent (3/12 = 25 % pile) passerait avec n'importe quel mode d'arrondi.
    render(<GearProgress validated={5} total={8} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
  });

  it('ne divise pas par zéro quand le casier est vide', () => {
    render(<GearProgress validated={0} total={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('borne le pourcentage dans [0, 100] même sur des entrées incohérentes (SH-44)', () => {
    // Sûr aujourd'hui (Armurerie passe validated <= total), mais un réemploi avec
    // validated > total produirait un aria-valuenow > 100 — ARIA invalide.
    render(<GearProgress validated={5} total={3} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it("annonce un texte riche aux lecteurs d'écran (aria-valuetext, SH-44/a11y)", () => {
    render(<GearProgress validated={3} total={12} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '3 équipements validés sur 12',
    );
  });
});
