import type { components } from '@/api/schema';

// Types du contrat API — générés depuis le Swagger backend (`npm run gen:api`, SH-21a).
// On dérive au lieu de redéclarer : un changement de DTO backend casse la compilation ici.
export type Gear = components['schemas']['GearResponseDto'];
export type AddGearInput = components['schemas']['AddGearDto'];
// Vue publique (SH-39/SH-21b) : sous-ensemble de Gear, sans serialNumber ni freelanceId.
// Gear lui est structurellement assignable — les composants d'affichage se typent sur
// PublicGear pour servir les deux vues.
export type PublicGear = components['schemas']['PublicGearDto'];
export type PaginatedPublicGear = components['schemas']['PaginatedPublicGearDto'];
export type PaginatedGear = components['schemas']['PaginatedGearDto'];
export type GearCategory = Gear['category'];
export type GearStatus = Gear['status'];
