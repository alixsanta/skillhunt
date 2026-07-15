import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_META } from './gear-meta';
import type { GearCategory } from './types';

interface GearCategoryChipsProps {
  /** Catégories réellement présentes dans le casier (spec §5.1 : pas de chip vide). */
  categories: GearCategory[];
  /** Catégorie active ; `null` = chip « Tous ». */
  selected: GearCategory | null;
  onSelect: (category: GearCategory | null) => void;
}

/**
 * Chips de filtre par catégorie (spec §5.1). Ce sont de vrais <button> : navigables au
 * clavier et annoncés par les lecteurs d'écran via `aria-pressed` (R6).
 */
export function GearCategoryChips({ categories, selected, onSelect }: GearCategoryChipsProps) {
  // Le libellé de l'état sélectionné passe par `aria-pressed` (lecteurs d'écran) ET par un repère
  // VISUEL non-coloré — l'icône ✓ + la graisse — pour ne pas reposer sur la seule couleur
  // (WCAG 1.4.1 : un daltonien doit distinguer la chip active sans percevoir la teinte).
  const chipClass = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs tracking-widest uppercase transition-colors',
      active
        ? 'border-hud-positive text-hud-positive bg-hud-pill font-semibold'
        : 'border-hud-border text-hud-muted hover:text-white',
    );

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
        className={chipClass(selected === null)}
      >
        {selected === null && <Check aria-hidden="true" className="size-3" />}
        Tous
      </button>

      {categories.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={selected === category}
          onClick={() => onSelect(category)}
          className={chipClass(selected === category)}
        >
          {selected === category && <Check aria-hidden="true" className="size-3" />}
          {CATEGORY_META[category].label}
        </button>
      ))}
    </div>
  );
}
