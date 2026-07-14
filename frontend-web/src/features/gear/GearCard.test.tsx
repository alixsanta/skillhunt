import { render, screen } from '@testing-library/react';
import { GearCard } from './GearCard';
import type { Gear } from './types';

function makeGear(overrides: Partial<Gear> = {}): Gear {
  return {
    id: 'g-1',
    brand: 'DJI',
    model: 'Mavic 3 Enterprise',
    serialNumber: 'SN-123456789',
    category: 'DRONE',
    status: 'VALIDATED',
    createdAt: '2026-07-01T10:00:00.000Z',
    freelanceId: 'u-1',
    ...overrides,
  } as Gear;
}

function renderCard(gear: Gear) {
  return render(
    <ul>
      <GearCard gear={gear} />
    </ul>,
  );
}

describe('GearCard — fiche équipement (SH-21a)', () => {
  it('affiche la marque, le modèle et le libellé de catégorie', () => {
    renderCard(makeGear());
    expect(screen.getByText('DJI Mavic 3 Enterprise')).toBeInTheDocument();
    expect(screen.getByText('Drone')).toBeInTheDocument();
  });

  it.each([
    ['VALIDATED', 'VALIDÉ'],
    ['PENDING', 'ATTENTE'],
    ['REJECTED', 'REJETÉ'],
  ] as const)(
    'affiche le libellé texte du statut %s (jamais la couleur seule)',
    (status, label) => {
      renderCard(makeGear({ status }));
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it("n'affiche jamais le numéro de série (donnée sensible)", () => {
    renderCard(makeGear());
    expect(screen.queryByText(/SN-123456789/)).not.toBeInTheDocument();
  });
});
