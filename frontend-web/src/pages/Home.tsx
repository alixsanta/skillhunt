import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

// Page d'accueil (SH-19), enrichie de l'état de session (SH-20).
export default function Home() {
  const { user } = useAuth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">SkillHunt</h1>
      <p className="text-muted-foreground">Plateforme de recrutement technique de niche</p>

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
    </main>
  );
}
