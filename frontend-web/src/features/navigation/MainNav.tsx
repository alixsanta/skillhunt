import { NavLink } from 'react-router-dom';
import type { UserRole } from '@/features/auth/types';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';

/**
 * Navigation principale (SH-46) — liens dépendants du rôle porté par le JWT.
 * L'état actif est signalé par la couleur ET le poids de police (jamais la couleur seule, R6).
 */
export function MainNav({ role }: { role: UserRole }) {
  return (
    <nav aria-label="Navigation principale" className="flex items-center gap-1 sm:gap-2">
      {NAV_ITEMS[role].map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              isActive
                ? 'bg-hud-pill text-hud-positive font-bold'
                : 'text-hud-muted hover:bg-hud-pill/60 font-medium hover:text-white',
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
          {/* Sous 640px seule l'icône reste : le libellé accessible est préservé. */}
          <span className="sr-only sm:hidden">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
