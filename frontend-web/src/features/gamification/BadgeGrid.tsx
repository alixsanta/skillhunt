import { Award, Lock } from 'lucide-react';

interface BadgeItem {
  id: string;
  label: string;
  description: string;
  earned?: boolean;
}

/**
 * Grille de badges (SH-21c). L'état obtenu/verrouillé est écrit en toutes lettres
 * (« Obtenu » / « À débloquer ») — l'opacité seule ne porte jamais l'information (R6).
 * Sans champ `earned` (vue publique), tout badge listé est obtenu par construction.
 */
export function BadgeGrid({ badges }: { badges: BadgeItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {badges.map((badge) => {
        const earned = badge.earned ?? true;
        const Icon = earned ? Award : Lock;
        return (
          <li
            key={badge.id}
            className={`bg-hud-card border-hud-border flex items-center gap-3 rounded-lg border p-3 ${earned ? '' : 'opacity-60'}`}
          >
            <Icon aria-hidden="true" className="text-hud-icon h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-white">{badge.label}</span>
              <span className="text-hud-muted block text-xs">{badge.description}</span>
            </span>
            <span className="text-hud-muted shrink-0 text-xs tracking-widest uppercase">
              {earned ? 'Obtenu' : 'À débloquer'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
