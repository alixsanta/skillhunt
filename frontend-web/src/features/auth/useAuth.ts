import { createContext, useContext } from 'react';
import type { AuthUser } from './types';

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  role: 'FREELANCE' | 'RECRUITER';
  // Obligatoire pour un FREELANCE (SH-34) : sans position, il est invisible du matching
  // par rayon (SH-13). Champs explicites latitude/longitude — jamais de tableau [lon, lat].
  location?: { latitude: number; longitude: number };
}

/**
 * Résultat du login (SH-40) : soit la session est ouverte, soit la 2FA exige un code —
 * le jeton d'étape (5 min) N'EST PAS un access token et ne touche jamais le session-store.
 */
export type LoginOutcome =
  { twoFactorRequired: false } | { twoFactorRequired: true; twoFactorToken: string };

export interface AuthContextValue {
  user: AuthUser | null;
  // 'restoring' : le refresh silencieux du démarrage est en vol.
  status: 'restoring' | 'ready';
  login: (email: string, password: string) => Promise<LoginOutcome>;
  // Étape 2 du login quand la 2FA est active : code TOTP ou code de secours.
  verifyTwoFactor: (twoFactorToken: string, code: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé à l'intérieur d'un <AuthProvider>.");
  }
  return context;
}
