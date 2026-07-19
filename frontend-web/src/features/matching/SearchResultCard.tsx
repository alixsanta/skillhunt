import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { MatchResult } from './types';

interface SearchResultCardProps {
  result: MatchResult;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
}

/**
 * Une fiche de résultat de recherche (SH-22), extraite de `Search.tsx` (SH-46) pour la
 * vue split-view. Le survol met en évidence le marqueur correspondant sur `SearchMap`.
 */
export function SearchResultCard({ result, isHighlighted, onHover }: SearchResultCardProps) {
  return (
    <li
      onMouseEnter={() => onHover(result.freelanceId)}
      onMouseLeave={() => onHover(null)}
      className={
        'bg-hud-card flex flex-wrap items-center gap-4 rounded-lg border p-4 transition-colors ' +
        (isHighlighted ? 'border-hud-positive' : 'border-hud-border')
      }
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-white">
          {result.username ?? 'Freelance'}
        </span>
        <span className="text-hud-muted block text-xs tracking-widest uppercase">
          {result.distanceKm} km
        </span>
      </span>

      {/* Le score reste lisible sans la couleur : libellé texte en clair (R6) */}
      <span className="text-hud-positive text-lg font-bold" aria-label="score de matching">
        {Math.round(result.score * 100)}&nbsp;%
      </span>

      <Button asChild>
        <Link to={`/freelances/${result.freelanceId}/armurerie`}>Voir l'armurerie</Link>
      </Button>
    </li>
  );
}
