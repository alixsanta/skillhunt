import type { components } from '@/api/schema';

// Types du contrat API — générés depuis le Swagger backend (`npm run gen:api`).
// On dérive au lieu de redéclarer : un changement de DTO backend casse la compilation ici.
export type PublicMedia = components['schemas']['PublicMediaDto'];
export type PaginatedMedia = components['schemas']['PaginatedMediaDto'];
export type CreateMediaResponse = components['schemas']['CreateMediaResponseDto'];
export type UploadInstructions = components['schemas']['UploadInstructionsDto'];
export type CreateMediaInput = components['schemas']['CreateMediaDto'];
export type MediaStatus = PublicMedia['status'];
export type MediaType = PublicMedia['type'];
