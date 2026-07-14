import { render, screen } from '@testing-library/react';
import { GearProgress } from './GearProgress';

describe('GearProgress — part de matériel validé (SH-21a)', () => {
  it('affiche le ratio et le pourcentage validé', () => {
    render(<GearProgress validated={3} total={12} />);
    expect(screen.getByText('3/12')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('ne divise pas par zéro quand le casier est vide', () => {
    render(<GearProgress validated={0} total={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
