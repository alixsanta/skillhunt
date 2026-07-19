import { Crosshair } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

// Page d'accueil (SH-19), enrichie de l'état de session (SH-20), en hero HUD (SH-46).
export default function Home() {
  const { user } = useAuth();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="flex items-center gap-3">
        <Crosshair className="text-hud-positive h-10 w-10" aria-hidden="true" />
        <span className="text-4xl font-bold tracking-widest text-white">
          SKILL<span className="text-hud-positive">HUNT</span>
        </span>
      </div>
      <p className="text-hud-muted max-w-md">
        La preuve de compétence par l'image et la donnée technique.
      </p>

      {user ? (
        <Button asChild>
          <Link to="/mon-compte">Mon compte</Link>
        </Button>
      ) : (
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/login">Se connecter</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">Créer un compte</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
