import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/session-store';

// Fournit les providers globaux du frontend (SH-19). TanStack Query + session d'auth (SH-20).
export function AppProviders({ children }: { children: ReactNode }) {
  // useState garantit un QueryClient stable sur toute la vie du composant.
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    // Purge du cache TanStack Query à tout changement d'IDENTITÉ (SH-21a).
    //
    // Sans cela, le cache (ex. ['gear', 'me']) survit à la déconnexion : un freelance A
    // se déconnecte, un freelance B se connecte dans le même onglet (SPA, pas de rechargement
    // de page) et TanStack Query sert instantanément les données EN CACHE de A à B avant même
    // le refetch en arrière-plan — violation directe du RBAC (CLAUDE.md racine §8.5 : « un
    // FREELANCE ne voit jamais les données d'un autre »).
    //
    // On ne purge que si l'identité (userId) a réellement changé : une rotation silencieuse du
    // token pour LE MÊME utilisateur (refresh) déclenche aussi une notification du store, mais
    // ne doit pas vider le cache (sinon on re-fetch tout à chaque refresh de token).
    let lastUserId = sessionStore.getUser()?.userId ?? null;

    return sessionStore.subscribe(() => {
      const userId = sessionStore.getUser()?.userId ?? null;
      if (userId !== lastUserId) {
        queryClient.clear();
        lastUserId = userId;
      }
    });
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
