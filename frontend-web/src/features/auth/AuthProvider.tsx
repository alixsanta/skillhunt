import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { apiClient } from '@/api/client';
import { installAuthInterceptors, refreshOnce } from '@/api/auth-interceptors';
import { sessionStore } from './session-store';
import { AuthContext, type AuthContextValue, type RegisterInput } from './useAuth';

interface TokenPair {
  accessToken: string;
  // Présent dans le body pour le mobile (Lot 2) ; le web l'ignore — il vit dans le cookie httpOnly.
  refreshToken: string;
}

// Les intercepteurs doivent être en place avant le tout premier appel (la restauration
// de session ci-dessous en est un). La fonction est idempotente.
installAuthInterceptors();

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(sessionStore.subscribe, sessionStore.getUser);
  const [status, setStatus] = useState<'restoring' | 'ready'>('restoring');

  // Restauration de session : l'access token n'a pas survécu au rechargement (mémoire),
  // mais le cookie de refresh, lui, est toujours là. On tente donc un refresh silencieux.
  useEffect(() => {
    // Passe par la promesse partagée : sous StrictMode, le double montage réutilise
    // le refresh en vol au lieu de lancer une 2e rotation qui révoquerait la 1re (SH-20).
    refreshOnce()
      .catch(() => sessionStore.clear())
      .finally(() => setStatus('ready'));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiClient.post<TokenPair>('/api/v1/auth/login', { email, password });
    sessionStore.setSession(response.data.accessToken);
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      // `register` ne renvoie aucun token : on enchaîne le login pour que l'utilisateur
      // arrive directement connecté (décision de design SH-20).
      await apiClient.post('/api/v1/auth/register', input);
      await login(input.email, input.password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      // Body vide : le refresh token est dans le cookie. Révoque le jti en Redis.
      await apiClient.post('/api/v1/auth/logout', {});
    } finally {
      // La session locale est purgée même si l'appel réseau échoue.
      sessionStore.clear();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
