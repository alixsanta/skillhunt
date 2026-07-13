import { type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/AuthProvider';

// Fournit les providers globaux du frontend (SH-19). TanStack Query + session d'auth (SH-20).
export function AppProviders({ children }: { children: ReactNode }) {
  // useState garantit un QueryClient stable sur toute la vie du composant.
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
