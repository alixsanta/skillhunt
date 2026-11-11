import { MediaCard } from './MediaCard';
import type { PublicMedia } from './types';

/**
 * Grille du portfolio : une colonne en mobile (priorité Lot 1), deux à partir de `lg`.
 * Liste sémantique (`<ul>`/`<li>`) et nommée : la page recruteur affiche DEUX listes
 * (matériel puis vidéos), un nom explicite les distingue pour les lecteurs d'écran
 * comme pour les tests. Calque de `GearGrid`.
 */
export function MediaGrid({
  items,
  deletable = false,
}: {
  items: PublicMedia[];
  /** Transmis à chaque carte. Faux par défaut : cf. `MediaCard`. */
  deletable?: boolean;
}) {
  return (
    <ul aria-label="Vidéos du portfolio" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((media) => (
        <MediaCard key={media.id} deletable={deletable} media={media} />
      ))}
    </ul>
  );
}
