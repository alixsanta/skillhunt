// Miroir de UserRole côté backend (backend-core/src/common/enums.ts).
export type UserRole = 'FREELANCE' | 'RECRUITER' | 'ADMIN';

// Identité de l'utilisateur connecté, telle que portée par le payload du JWT.
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
  /**
   * Nom d'affichage (SH-51). OPTIONNEL À DESSEIN : les access tokens émis avant cette
   * évolution ne le portent pas, et les rejeter fermerait toute session ouverte au
   * moment du déploiement. Donnée d'AFFICHAGE — aucune décision d'autorisation ne s'y adosse.
   */
  username?: string;
}
