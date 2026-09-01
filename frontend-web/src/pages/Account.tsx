import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { TwoFactorSettings } from '@/features/auth/TwoFactorSettings';
import { useMyMedia, countPendingMedia } from '@/features/media/useMyMedia';

// Première page protégée du front (SH-20). Elle sert de preuve de bout en bout du
// parcours d'authentification, en attendant les écrans métier (Armurerie, SH-21a).
export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Compteur du portfolio (SH-18a) : même clé de requête que la grille (`useMyMedia`),
  // donc aucun appel réseau supplémentaire depuis cette carte.
  // `GET /media/me` est réservé au rôle FREELANCE côté backend (403 sinon) — la navigation
  // ne doit jamais afficher un lien qui renverrait 403 (nav-items.ts), donc la carte Portfolio
  // est masquée pour les autres rôles et `enabled` empêche même d'émettre la requête.
  const isFreelance = user?.role === 'FREELANCE';
  const { data: portfolio } = useMyMedia(isFreelance);
  const medias = portfolio?.items ?? [];
  // Réutilise le prédicat partagé (C2.2.3 : pas de duplication du critère métier).
  const enTraitement = countPendingMedia(medias);
  const resumePortfolio =
    medias.length === 0
      ? 'Aucune vidéo publiée'
      : `${medias.length} vidéo${medias.length > 1 ? 's' : ''}` +
        (enTraitement > 0 ? ` · ${enTraitement} en traitement` : '');

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
          <p className="text-white">{user?.email}</p>
          <p className="text-hud-muted text-sm tracking-widest uppercase">{user?.role}</p>
        </div>

        <div className="border-hud-border flex w-full flex-wrap justify-center gap-3 border-t pt-6">
          <Button asChild>
            <Link to="/mon-armurerie">Mon Armurerie</Link>
          </Button>
          {/* Chat contextuel (SH-24) : point d'entrée des deux rôles vers leurs conversations */}
          <Button asChild variant="outline">
            <Link to="/messages">Messages</Link>
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            Se déconnecter
          </Button>
        </div>

        {/* Portfolio (SH-18a) : publier doit rester à un clic depuis le compte, sans détour
            par la grille. Réservé aux FREELANCE (RBAC backend) : un RECRUITER ne doit jamais
            voir un lien qui renverrait 403, comme le veut nav-items.ts. */}
        {isFreelance && (
          <div className="border-hud-border bg-hud-card flex w-full items-center gap-3 rounded-lg border p-4">
            {/* Le titre seul devient le nom accessible du lien (« Portfolio ») sans aria-label.
                Le résumé sort du lien pour rester audible : un aria-label aurait remplacé le
                contenu au lieu de le résumer, masquant aux lecteurs d'écran l'info du traitement
                en cours. Même rendu visuel, information préservée pour l'accessibilité. */}
            <div className="min-w-0 flex-1">
              <Link className="block font-bold text-white" to="/portfolio">
                Portfolio
              </Link>
              {/* Le compteur change sans action utilisateur (sondage de useMyMedia), donc il faut
                  l'annoncer aux lecteurs d'écran. Même raison que la région live sur Portfolio.tsx. */}
              <span aria-live="polite" className="text-hud-muted block text-sm">
                {resumePortfolio}
              </span>
            </div>

            <Link
              aria-label="Publier une vidéo"
              className="bg-hud-positive text-hud-bg flex h-9 w-9 items-center justify-center rounded-md"
              to="/portfolio/ajouter"
            >
              <Plus aria-hidden="true" className="h-5 w-5" />
            </Link>
          </div>
        )}

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
