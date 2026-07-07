import axios from 'axios';

// Instance Axios unique du frontend (SH-19). Les intercepteurs (refresh JWT)
// seront branchés ici lors du parcours d'authentification (SH-20).
export const apiClient = axios.create({
  // `||` (et non `??`) : Vite expose une variable non renseignée (`VITE_API_URL=`)
  // comme chaîne vide, qu'il faut aussi remplacer par le fallback (SH-19).
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  // TODO sécurité (SH-20) : withCredentials exige un CORS backend à origine explicite —
  // origin: '*' (backend-core/src/main.ts) sera rejeté par le navigateur sur requête
  // credentialed ; restreindre l'origine avant le premier appel authentifié.
  withCredentials: true,
});
