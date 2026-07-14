import { cn } from '@/lib/utils';
import { STATUS_META } from './gear-meta';
import type { GearStatus } from './types';

/**
 * Badge de statut : point coloré + libellé (spec §3).
 * Le point est décoratif (`aria-hidden`) — c'est le TEXTE qui porte l'information, pour que
 * le statut reste lisible sans percevoir la couleur (R6).
 */
export function GearStatusBadge({ status }: { status: GearStatus }) {
  const { label, dotClass, textClass } = STATUS_META[status];

  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 text-xs font-semibold tracking-widest',
        textClass,
      )}
    >
      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', dotClass)} />
      {label}
    </span>
  );
}
