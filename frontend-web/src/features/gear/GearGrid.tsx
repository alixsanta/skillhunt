import { GearCard } from './GearCard';
import type { PublicGear } from './types';

/**
 * Grille d'inventaire (spec §5.3) : une colonne en mobile (< 1024px, priorité Lot 1),
 * deux colonnes à partir de `lg` (≥ 1024px). Liste sémantique (<ul>/<li>) : les fiches
 * sont annoncées comme une liste par les lecteurs d'écran.
 * Typée sur `PublicGear` (sous-ensemble commun) : sert la vue privée ET la vue publique (SH-21b).
 */
export function GearGrid({ items }: { items: PublicGear[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((gear) => (
        <GearCard key={gear.id} gear={gear} />
      ))}
    </ul>
  );
}
