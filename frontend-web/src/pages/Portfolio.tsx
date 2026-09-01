import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MediaEmptyState } from '@/features/media/MediaEmptyState';
import { MediaGrid } from '@/features/media/MediaGrid';
import { countPendingMedia, hasPendingMedia, useMyMedia } from '@/features/media/useMyMedia';

/** Portfolio du freelance authentifié (SH-18a). */
export default function Portfolio() {
  const { data, isPending, isError } = useMyMedia();

  const items = data?.items ?? [];
  const enCours = countPendingMedia(items);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Portfolio</h1>
        <Button asChild>
          <Link to="/portfolio/ajouter">+ Ajouter une vidéo</Link>
        </Button>
      </div>

      {/* Le sondage fait évoluer la grille sans action de l'utilisateur : le changement
          doit être ANNONCÉ, pas seulement affiché. */}
      <p aria-live="polite" className="text-hud-muted text-sm">
        {hasPendingMedia(items)
          ? `${enCours} vidéo${enCours > 1 ? 's' : ''} en cours de traitement`
          : ''}
      </p>

      {isPending && <p role="status" className="text-hud-muted text-sm">Chargement du portfolio…</p>}

      {isError && (
        <p className="text-hud-rejected text-sm" role="alert">
          Impossible de charger le portfolio. Réessaie dans un instant.
        </p>
      )}

      {!isPending && !isError && (items.length === 0 ? <MediaEmptyState /> : <MediaGrid items={items} />)}
    </section>
  );
}
