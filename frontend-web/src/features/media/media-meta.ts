import { AlertTriangle, Clock, FileVideo, Loader, PlayCircle, type LucideIcon } from 'lucide-react';
import type { MediaStatus } from './types';

/**
 * Statut : le libellé TEXTE accompagne toujours la pastille colorée — l'information ne
 * repose jamais sur la couleur seule (accessibilité R6, calque de `gear-meta.ts`).
 *
 * `hint` et `Icon` alimentent la zone visuelle de la carte : tant que SH-16b n'a pas
 * produit de poster, c'est l'état qui donne son identité visuelle à la vignette.
 */
export const STATUS_META: Record<
  MediaStatus,
  { label: string; dotClass: string; textClass: string; hint: string; Icon: LucideIcon }
> = {
  DRAFT: {
    label: 'BROUILLON',
    dotClass: 'bg-hud-muted',
    textClass: 'text-hud-muted',
    hint: 'Dépôt non confirmé',
    Icon: FileVideo,
  },
  UPLOADED: {
    label: 'DÉPOSÉE',
    dotClass: 'bg-hud-muted',
    textClass: 'text-hud-muted',
    hint: "En file d'attente",
    Icon: Clock,
  },
  PROCESSING: {
    label: 'EN TRAITEMENT',
    dotClass: 'bg-hud-pending',
    textClass: 'text-hud-pending',
    hint: 'Transcodage en cours',
    Icon: Loader,
  },
  READY: {
    label: 'PRÊT',
    dotClass: 'bg-hud-positive',
    textClass: 'text-hud-positive',
    hint: 'Prêt à la lecture',
    Icon: PlayCircle,
  },
  FAILED: {
    label: 'ÉCHEC',
    dotClass: 'bg-hud-rejected',
    textClass: 'text-hud-rejected',
    hint: 'Transcodage impossible',
    Icon: AlertTriangle,
  },
};

// Dérivé de la table plutôt que réécrit : `Record<Union, …>` rend une clé manquante
// impossible à compiler, donc un statut ajouté côté backend ne peut pas être oublié ici.
export const MEDIA_STATUSES = Object.keys(STATUS_META) as MediaStatus[];

/** Durée lisible. `null` tant que le média n'a pas été sondé (SH-16b). */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '—';
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
