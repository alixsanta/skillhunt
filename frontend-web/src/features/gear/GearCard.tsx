import type { ReactNode } from 'react';
import { CATEGORY_META } from './gear-meta';
import { GearStatusBadge } from './GearStatusBadge';
import type { PublicGear } from './types';

/**
 * Fiche technique horizontale (spec §4) : pastille d'icône neutre → marque + modèle →
 * badge de statut. La catégorie se lit dans l'ICÔNE et le label texte, jamais dans une couleur.
 *
 * Typée sur `PublicGear` (le sous-ensemble commun aux deux vues, SH-21b) : `Gear` lui est
 * assignable, et `serialNumber` — délibérément jamais affiché (donnée sensible) — n'est
 * même plus accessible ici par construction.
 *
 * `trailingAction` (SH-21c) : action optionnelle affichée après le badge de statut (épingler/
 * retirer du loadout). Absente en vue publique (recruteur), qui n'appelle jamais cette prop.
 */
export function GearCard({
  gear,
  trailingAction,
}: {
  gear: PublicGear;
  trailingAction?: ReactNode;
}) {
  const { label, Icon } = CATEGORY_META[gear.category];

  return (
    <li className="bg-hud-card border-hud-border flex items-center gap-4 rounded-lg border p-4">
      <span className="bg-hud-pill border-hud-pill-border flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border">
        <Icon aria-hidden="true" className="text-hud-icon h-6 w-6" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-white">
          {gear.brand} {gear.model}
        </span>
        <span className="text-hud-muted block text-xs tracking-widest uppercase">{label}</span>
      </span>

      <GearStatusBadge status={gear.status} />
      {trailingAction}
    </li>
  );
}
