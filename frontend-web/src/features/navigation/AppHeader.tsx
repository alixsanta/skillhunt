import { Crosshair } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { AccountMenu } from './AccountMenu';
import { MainNav } from './MainNav';
import { NotificationBell } from './NotificationBell';

/**
 * En-tête applicatif (SH-46) : logo, navigation par rôle, notifications, menu compte.
 * Hors session, seul le logo subsiste — il n'y a pas de rôle sur lequel fonder la navigation.
 */
export function AppHeader() {
  const { user } = useAuth();

  return (
    <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4">
      <Link
        to="/"
        className="focus-visible:ring-ring flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:outline-none"
      >
        <Crosshair className="text-hud-positive h-7 w-7" aria-hidden="true" />
        <span className="text-lg font-bold tracking-widest text-white">
          SKILL<span className="text-hud-positive">HUNT</span>
        </span>
      </Link>

      {user && <MainNav role={user.role} />}

      <div className="flex items-center gap-1">
        {user && (
          <>
            <NotificationBell />
            <AccountMenu />
          </>
        )}
      </div>
    </div>
  );
}
