import { createContext, useContext } from 'react';
import type { AuthUser } from './types';

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  role: 'FREELANCE' | 'RECRUITER';
}

export interface AuthContextValue {
  user: AuthUser | null;
  // 'restoring' : le refresh silencieux du démarrage est en vol.
  status: 'restoring' | 'ready';
  login: (email: string, password: string) => Promise<void>;
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
