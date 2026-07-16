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

  it("n'expose jamais le numéro de série — ni en texte, ni en attribut (SH-44)", () => {
    // La valeur cherchée est DÉRIVÉE de la fixture, jamais recopiée : une assertion sur un
    // littéral se périmerait en silence le jour où la fixture change (le test continuerait
    // de passer alors même que la fiche afficherait le numéro de série).
    const gear = makeGear();
    const { container } = renderCard(gear);
    expect(screen.queryByText(gear.serialNumber)).not.toBeInTheDocument();
    // Durcissement SH-44 (item 4) : une fuite via title/aria-label/data-* passerait le
    // queryByText — on balaye TOUT le HTML rendu, attributs compris.
    expect(container.innerHTML).not.toContain(gear.serialNumber);
  });
});
