import type { components } from '@/api/schema';

// Types du contrat API — générés depuis le Swagger backend (`npm run gen:api`, SH-21c).
export type GamificationProfile = components['schemas']['GamificationProfileDto'];
export type PublicGamificationProfile = components['schemas']['PublicGamificationProfileDto'];
export type Badge = components['schemas']['BadgeDto'];
export type PublicBadge = components['schemas']['PublicBadgeDto'];
