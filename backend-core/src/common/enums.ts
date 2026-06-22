// Enums métier partagés entre entités, DTOs et guards.
// Extraits de l'ancien db-state.ts (placeholder mémoire) lors de la migration vers la persistance réelle (SH-6).

export enum UserRole {
  FREELANCE = 'FREELANCE',
  RECRUITER = 'RECRUITER',
  ADMIN = 'ADMIN',
}

export enum GearStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  REJECTED = 'REJECTED',
}
