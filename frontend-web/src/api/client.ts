import axios from 'axios';

// Instance Axios unique du frontend (SH-19). Les intercepteurs (refresh JWT)
// seront branchés ici lors du parcours d'authentification (SH-20).
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  withCredentials: true,
});
