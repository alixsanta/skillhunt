import type { components } from '@/api/schema';

// Types du contrat API — générés depuis le Swagger backend (`npm run gen:api`, SH-21a).
// On dérive au lieu de redéclarer : un changement de DTO backend casse la compilation ici.
export type Gear = components['schemas']['GearResponseDto'];
export type PaginatedGear = components['schemas']['PaginatedGearDto'];
export type GearCategory = Gear['category'];
export type GearStatus = Gear['status'];
