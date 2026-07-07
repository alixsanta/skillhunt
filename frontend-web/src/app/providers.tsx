import { type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Fournit les providers globaux du frontend (SH-19). Pour l'instant : TanStack Query.
export function AppProviders({ children }: { children: ReactNode }) {
  // useState garantit un QueryClient stable sur toute la vie du composant.
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
