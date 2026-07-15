import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold">Mon compte</h1>
      <p>{user?.email}</p>
      <p className="text-muted-foreground text-sm tracking-widest uppercase">{user?.role}</p>
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/mon-armurerie">Mon Armurerie</Link>
        </Button>
        <Button variant="outline" onClick={handleLogout}>
          Se déconnecter
        </Button>
      </div>
    </main>
  );
}
