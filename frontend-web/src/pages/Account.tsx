import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { TwoFactorSettings } from '@/features/auth/TwoFactorSettings';
import { ROLE_LABELS } from '@/features/auth/role-labels';
import { getDisplayName } from '@/features/auth/display-name';
import { NAV_ITEMS } from '@/features/navigation/nav-items';

// Première page protégée du front (SH-20). Elle sert de preuve de bout en bout du
// parcours d'authentification, en attendant les écrans métier (Armurerie, SH-21a).
export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Révocation serveur en échec (réseau coupé, backend indisponible) : sans intérêt pour
      // l'utilisateur, la session locale est de toute façon déjà purgée par AuthProvider.
      // On avale l'erreur ici : `onClick` n'attend pas cette promesse, donc si on la laissait
      // remonter elle deviendrait un rejet de promesse non géré (Account.tsx, SH-20 post-revue).
    } finally {
      // Redirige toujours vers /login, y compris quand la révocation côté serveur a échoué.
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="border-hud-border bg-hud-card flex w-full max-w-md flex-col items-center gap-6 rounded-xl border p-8">
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-bold text-white">Mon compte</h1>
          {/* Le nom passe en identité principale, l'email en information secondaire (SH-51). */}
          <p className="text-lg font-bold text-white">{user ? getDisplayName(user) : null}</p>
          <p className="text-hud-muted text-sm">{user?.email}</p>
          {/* Libellé français, jamais la valeur d'enum du JWT (SH-51). */}
          <p className="text-hud-muted text-sm tracking-widest uppercase">
            {user ? ROLE_LABELS[user.role] : null}
          </p>
        </div>

        {/* Les actions DÉRIVENT de la navigation par rôle (SH-51) : `nav-items.ts` reste la
            source unique de ce qu'un rôle a le droit de voir. Codées en dur, elles avaient
            divergé — un RECRUITER se voyait proposer l'Armurerie, donc un 403. */}
        <div className="border-hud-border flex w-full flex-wrap justify-center gap-3 border-t pt-6">
          {user &&
            NAV_ITEMS[user.role].map(({ to, label }, index) => (
              <Button key={to} asChild variant={index === 0 ? 'default' : 'outline'}>
                <Link to={to}>{label}</Link>
              </Button>
            ))}
          <Button variant="outline" onClick={handleLogout}>
            Se déconnecter
          </Button>
        </div>

        {/* Gestion de la 2FA (SH-40) — opt-in, tous rôles. Ancre pour le lien du menu compte
            (AccountMenu.tsx) : « deux-facteurs » plutôt que l'abréviation usuelle, qui ressemble
            à de l'hexadécimal une fois préfixée du dièse et fait échouer le garde anti-couleur
            en dur (gear-meta.test.ts). */}
        <div id="deux-facteurs" className="border-hud-border w-full border-t pt-6">
          <TwoFactorSettings />
        </div>
      </div>
    </div>
  );
}
