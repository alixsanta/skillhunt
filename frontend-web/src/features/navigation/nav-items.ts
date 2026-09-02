import { MessageSquare, PlayCircle, Radar, Warehouse, type LucideIcon } from 'lucide-react';
import type { UserRole } from '@/features/auth/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Navigation par rôle (SH-46).
 *
 * La navigation REFLÈTE le RBAC du backend : on n'affiche jamais un lien dont on sait
 * qu'il renverrait 403. Un FREELANCE n'a donc pas « Recherche », un RECRUITER n'a pas
 * « Mon Armurerie ».
 */
export const NAV_ITEMS: Record<UserRole, readonly NavItem[]> = {
  FREELANCE: [
    { to: '/mon-armurerie', label: 'Mon Armurerie', icon: Warehouse },
    { to: '/portfolio', label: 'Portfolio', icon: PlayCircle },
    { to: '/messages', label: 'Messages', icon: MessageSquare },
  ],
  RECRUITER: [
    { to: '/recherche', label: 'Recherche', icon: Radar },
    { to: '/messages', label: 'Messages', icon: MessageSquare },
  ],
  // L'admin valide le matériel via l'API (aucun écran dédié dans le Lot 1).
  ADMIN: [{ to: '/messages', label: 'Messages', icon: MessageSquare }],
};
