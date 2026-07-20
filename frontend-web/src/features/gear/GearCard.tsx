import type { ReactNode } from 'react';
import { CATEGORY_META } from './gear-meta';
import { GearStatusBadge } from './GearStatusBadge';
import type { PublicGear } from './types';

/**
 * Fiche technique façon « Gear Locker » (SH-46, restyle de la fiche SH-21a) : une ligne d'en-tête
 * catégorie/statut, puis pastille d'icône neutre → marque + modèle. La catégorie se lit dans
 * l'ICÔNE et le label texte, jamais dans une couleur ; le statut garde son libellé texte
 * (`GearStatusBadge`), jamais la couleur seule.
 *
 * Typée sur `PublicGear` (le sous-ensemble commun aux deux vues, SH-21b) : `Gear` lui est
 * assignable, et `serialNumber` — délibérément jamais affiché (donnée sensible) — n'est
 * même plus accessible ici par construction.
 *
 * `trailingAction` (SH-21c) : action optionnelle affichée après la marque/modèle (épingler/
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
    <li className="group border-hud-border bg-hud-card hover:border-hud-positive relative flex flex-col gap-3 overflow-hidden rounded-lg border p-5 transition-colors">
      <div className="flex items-start justify-between gap-2">
        {/* Réutilise CATEGORY_META (gear-meta.ts) — le brief nomme cette table
            `GEAR_CATEGORY_LABELS`, mais l'export réel est `CATEGORY_META[category].label`. */}
        <span className="text-hud-muted text-xs font-bold tracking-widest uppercase">{label}</span>
        <GearStatusBadge status={gear.status} />
      </div>

      <div className="flex items-center gap-4">
        <span className="bg-hud-pill border-hud-pill-border flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border">
          <Icon aria-hidden="true" className="text-hud-icon h-6 w-6" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-white">
            {gear.brand} {gear.model}
          </span>
        </span>

        {trailingAction}
      </div>
    </li>
  );
}
