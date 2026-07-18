import { LogOut, ShieldCheck, UserCog } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useNavigate } from 'react-router-dom';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { useAuth } from '@/features/auth/useAuth';

const ITEM_CLASS =
  'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm text-white outline-none ' +
  'data-[highlighted]:bg-hud-pill data-[highlighted]:text-hud-positive';

/**
 * Menu compte (SH-46) — Radix fournit la navigation clavier, le piège de focus et les
 * rôles ARIA (`menu` / `menuitem`) : on ne réimplémente pas ce qui est déjà accessible.
 */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  // L'email fait office de nom d'affichage : le JWT ne porte pas le username.
  const displayName = user.email.split('@')[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Mon compte"
        className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
      >
        <InitialsAvatar name={displayName} size="sm" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="border-hud-border bg-hud-card z-50 min-w-56 rounded-lg border p-1 shadow-xl"
        >
          <div className="border-hud-border border-b px-3 py-2">
            <p className="truncate text-sm font-bold text-white">{displayName}</p>
            <p className="text-hud-muted truncate text-xs">{user.email}</p>
          </div>

          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void navigate('/mon-compte')}>
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Mon compte
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={ITEM_CLASS}
            // Ancre « deux-facteurs » plutôt que l'abréviation usuelle : cette dernière,
            // précédée du dièse, ressemble à une couleur hexadécimale pour le garde
            // anti-hex de gear-meta.test.ts, qui scanne désormais ce dossier (SH-46,
            // tâche 3) — faux positif évité sans toucher au test.
            onSelect={() => void navigate('/mon-compte#deux-facteurs')}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Double authentification
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="bg-hud-border my-1 h-px" />

          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void logout()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Se déconnecter
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
