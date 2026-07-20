import type { ReactNode } from 'react';
import { GearCard } from './GearCard';
import type { PublicGear } from './types';

/**
 * Grille d'inventaire (spec §5.3) : une colonne en mobile (< 1024px, priorité Lot 1),
 * deux colonnes à partir de `lg` (≥ 1024px). Liste sémantique (<ul>/<li>) : les fiches
 * sont annoncées comme une liste par les lecteurs d'écran.
 * Typée sur `PublicGear` (sous-ensemble commun) : sert la vue privée ET la vue publique (SH-21b).
 *
 * `renderAction` (SH-21c) : injecte une action par fiche (ex. « Épingler » côté vue privée) sans
 * coupler `GearGrid` à la logique métier du loadout. La vue publique ne la passe pas.
 */
export function GearGrid({
  items,
  renderAction,
}: {
  items: PublicGear[];
  renderAction?: (gear: PublicGear) => ReactNode;
}) {
  return (
    // aria-label (SH-21c) : la vue privée affiche désormais DEUX listes (loadout + casier
    // complet) — un nom explicite les distingue pour les lecteurs d'écran ET pour les tests
    // (`getByRole('list')` seul serait ambigu dès que `LoadoutRow` est monté à côté).
    <ul aria-label="Équipements" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((gear) => (
        <GearCard key={gear.id} gear={gear} trailingAction={renderAction?.(gear)} />
      ))}
    </ul>
  );
}
