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

// Catégories de matériel de l'Armurerie — alimente les filtres et le matching (SH-12).
export enum GearCategory {
  DRONE = 'DRONE',
  CAMERA_360 = 'CAMERA_360',
  ROBOTICS = 'ROBOTICS',
  SENSOR = 'SENSOR',
  OTHER = 'OTHER',
}
