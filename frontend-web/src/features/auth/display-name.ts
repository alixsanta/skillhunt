import type { AuthUser } from './types';

/**
 * Nom d'affichage de l'utilisateur connecté (SH-51).
 *
 * Repli sur la partie locale de l'email quand le token ne porte pas encore `username` —
 * c'est ce que faisait déjà `AccountMenu`, désormais partagé plutôt que dupliqué.
 */
export function getDisplayName(user: AuthUser): string {
  const nom = user.username?.trim();
  return nom && nom.length > 0 ? nom : user.email.split('@')[0];
}
