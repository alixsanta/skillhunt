import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

/**
 * Garde de route (SH-20).
 *
 * ⚠️ Il s'agit d'une garde d'ERGONOMIE, pas d'une garde de sécurité : la vraie
 * protection est le JwtAuthGuard du backend, qui vérifie la signature RS256. Elle évite
 * juste d'afficher un écran vide à un visiteur non connecté.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();

  // Tant que le refresh silencieux du démarrage est en vol, on ne conclut RIEN :
  // rediriger maintenant éjecterait l'utilisateur vers /login à chaque rechargement.
  if (status === 'restoring') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement de votre session…</p>
      </main>
    );
  }

  if (!user) {
    // `state.from` permet de revenir sur la route demandée après connexion.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
