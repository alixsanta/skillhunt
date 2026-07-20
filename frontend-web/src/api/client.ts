import axios from 'axios';

// URL de repli quand VITE_API_URL n'est pas renseignée (dev local, SH-38).
export const DEFAULT_API_URL = 'http://localhost:3001';

// Instance Axios unique du frontend (SH-19). Les intercepteurs (refresh JWT)
// seront branchés ici lors du parcours d'authentification (SH-20).
export const apiClient = axios.create({
  // `||` (et non `??`) : Vite expose une variable non renseignée (`VITE_API_URL=`)
  // comme chaîne vide, qu'il faut aussi remplacer par le fallback (SH-19).
  baseURL: import.meta.env.VITE_API_URL || DEFAULT_API_URL,
  // withCredentials exige un CORS backend à origine explicite : voir
  // backend-core/src/common/cors.ts (origines explicites via CORS_ORIGIN, joker '*' refusé
  // au démarrage — SH-20).
  withCredentials: true,
});
