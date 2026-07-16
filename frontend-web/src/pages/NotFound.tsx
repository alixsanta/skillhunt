import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

// Page 404 (SH-19) : filet de sécurité pour toute route inconnue.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Cette page n’existe pas.</p>
      <Button asChild>
        <Link to="/">Retour à l’accueil</Link>
      </Button>
    </main>
  );
}
