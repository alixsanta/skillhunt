import type { components } from '@/api/schema';

// Types du contrat API — générés depuis le Swagger backend (`npm run gen:api`, SH-22).
export type SearchMatchInput = components['schemas']['SearchMatchDto'];
export type MatchResult = components['schemas']['MatchResultDto'];
