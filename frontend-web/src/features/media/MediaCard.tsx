import { STATUS_META, formatDuration } from './media-meta';
import { MediaStatusBadge } from './MediaStatusBadge';
import type { PublicMedia } from './types';

/**
 * Fiche d'un média du portfolio.
 *
 * La vignette est **dérivée de l'état** et non d'un poster : celui-ci est produit par le
 * transcodage (SH-16b), donc absent tant que le pipeline réel n'est pas livré. Chaque état
 * porte son icône et son indice textuel, si bien que la grille reste lisible même quand
 * aucun média n'a d'image.
 */
export function MediaCard({ media }: { media: PublicMedia }) {
  const { hint, Icon } = STATUS_META[media.status];
  const isReady = media.status === 'READY';

  return (
    <li className="border-hud-border bg-hud-card flex flex-col overflow-hidden rounded-lg border">
      <div className="bg-hud-pill relative flex h-24 flex-col items-center justify-center gap-2">
        <Icon aria-hidden="true" className="text-hud-icon h-6 w-6" />
        <span className="text-hud-muted text-xs">{hint}</span>

        {media.type === 'VIDEO_360' && (
          <span className="border-hud-pill-border text-hud-icon absolute top-2 left-2 rounded border px-1.5 py-0.5 text-[11px]">
            360°
          </span>
        )}

        {isReady && media.durationSeconds !== null && (
          <span className="bg-hud-bg text-hud-muted absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-[11px]">
            {formatDuration(media.durationSeconds)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <MediaStatusBadge status={media.status} />
        <span className="truncate font-bold text-white">{media.title}</span>
        {media.errorReason !== null && (
          <span className="text-hud-muted text-xs">{media.errorReason}</span>
        )}
      </div>
    </li>
  );
}
