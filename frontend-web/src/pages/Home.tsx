import { Link, Navigate } from 'react-router-dom';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { getHomeRoute } from '@/features/navigation/home-route';

// Page d'accueil (SH-19), enrichie de l'état de session (SH-20), en hero HUD (SH-46).
export default function Home() {
  const { user } = useAuth();

  // Un utilisateur connecté n'a rien à faire sur la vitrine (SH-51) : il est mené à
  // l'écran de travail de son rôle. Le hero reste la page d'accueil du visiteur anonyme.
  if (user) {
    return <Navigate to={getHomeRoute(user.role)} replace />;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="flex items-center gap-3">
        <BrandMark className="text-hud-positive h-10 w-10" />
        {/* Le wordmark reste le <h1> de la page : chaque page garde un titre accessible (WCAG 2.4.6) */}
        <h1 className="text-4xl font-bold tracking-widest text-white">
          SKILL<span className="text-hud-positive">HUNT</span>
        </h1>
      </div>
      <p className="text-hud-muted max-w-md">
        La preuve de compétence par l'image et la donnée technique.
      </p>

      <div className="flex gap-3">
        <Button asChild>
          <Link to="/login">Se connecter</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/register">Créer un compte</Link>
        </Button>
      </div>
    </div>
  );
}
