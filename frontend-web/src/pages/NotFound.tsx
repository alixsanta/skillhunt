import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

// Page 404 (SH-19) : filet de sécurité pour toute route inconnue.
// Route de premier niveau (hors coquilles PublicLayout/AppLayout, SH-46) : elle possède
// donc son propre <main> et son propre fond plein écran.
export default function NotFound() {
  return (
    <main className="bg-hud-bg flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="border-hud-border bg-hud-card flex w-full max-w-md flex-col items-center gap-4 rounded-xl border p-8 text-center">
        <h1 className="text-hud-positive text-4xl font-bold">404</h1>
        <p className="text-hud-muted">Cette page n’existe pas.</p>
        <Button asChild>
          <Link to="/">Retour à l’accueil</Link>
        </Button>
      </div>
    </main>
  );
}
