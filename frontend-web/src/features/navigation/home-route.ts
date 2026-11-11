import type { UserRole } from '@/features/auth/types';
import { NAV_ITEMS } from './nav-items';

/**
 * Écran d'arrivée d'un rôle (SH-51) : la PREMIÈRE entrée de sa navigation.
 *
 * Dérivé de `NAV_ITEMS` plutôt qu'écrit en table séparée — un rôle ne peut donc jamais
 * atterrir sur un écran que son RBAC lui refuse, et la règle reste vraie si la navigation
 * évolue. Un recruteur arrive sur la recherche, un freelance sur son Armurerie : chacun
 * sur son écran de travail plutôt que sur la fiche administrative de son compte.
 */
export function getHomeRoute(role: UserRole): string {
  return NAV_ITEMS[role][0].to;
}
