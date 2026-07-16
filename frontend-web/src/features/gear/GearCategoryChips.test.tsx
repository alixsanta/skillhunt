import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GearCategoryChips } from './GearCategoryChips';

describe('GearCategoryChips — filtre par catégorie (SH-21a)', () => {
  it('rend une chip « Tous » puis une chip par catégorie présente dans le casier', () => {
    render(
      <GearCategoryChips categories={['DRONE', 'SENSOR']} selected={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Drone' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Capteur' })).toBeInTheDocument();
    // Aucune chip pour une catégorie absente du casier.
    expect(screen.queryByRole('button', { name: 'Robotique' })).not.toBeInTheDocument();
  });

  it('remonte la catégorie choisie, et `null` pour « Tous »', async () => {
    const onSelect = vi.fn();
    render(<GearCategoryChips categories={['DRONE']} selected="DRONE" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Drone' }));
    expect(onSelect).toHaveBeenCalledWith('DRONE');

    await userEvent.click(screen.getByRole('button', { name: 'Tous' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
