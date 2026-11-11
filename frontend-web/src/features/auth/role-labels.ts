import type { UserRole } from './types';

/**
 * Libellés d'affichage des rôles (SH-51).
 *
 * La valeur technique du JWT (`RECRUITER`) ne doit jamais atteindre l'écran : l'interface
 * est en français (CLAUDE.md §7). `Record<UserRole, string>` rend la table exhaustive par
 * construction — un rôle ajouté côté backend casse la compilation ici plutôt que de
 * s'afficher en anglais.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  FREELANCE: 'Freelance',
  RECRUITER: 'Recruteur',
  ADMIN: 'Administrateur',
};
