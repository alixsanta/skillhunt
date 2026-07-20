// Miroir de UserRole côté backend (backend-core/src/common/enums.ts).
export type UserRole = 'FREELANCE' | 'RECRUITER' | 'ADMIN';

// Identité de l'utilisateur connecté, telle que portée par le payload du JWT.
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
}
