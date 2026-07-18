import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { LoadoutRow } from './LoadoutRow';
import type { PublicGear } from './types';

const pinned = [
  {
    id: 'g-1',
    brand: 'DJI',
    model: 'Mavic 3',
    category: 'DRONE',
    status: 'VALIDATED',
    isInLoadout: true,
    createdAt: '2026-07-01T10:00:00.000Z',
  },
] as PublicGear[];

describe('LoadoutRow (SH-21c)', () => {
  it('affiche les équipements épinglés puis des emplacements libres jusqu à 4', () => {
    render(<LoadoutRow items={pinned} onUnpin={() => {}} />);
    expect(screen.getByRole('heading', { name: /loadout/i })).toBeInTheDocument();
    expect(screen.getByText('DJI Mavic 3')).toBeInTheDocument();
    expect(screen.getAllByText('Emplacement libre')).toHaveLength(3);
  });

  it('« Retirer » déclenche onUnpin avec l id du gear', async () => {
    const onUnpin = vi.fn();
    render(<LoadoutRow items={pinned} onUnpin={onUnpin} />);
    await userEvent.click(screen.getByRole('button', { name: /retirer dji mavic 3 du loadout/i }));
    expect(onUnpin).toHaveBeenCalledWith('g-1');
  });
});
