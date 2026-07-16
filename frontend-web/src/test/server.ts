import { setupServer } from 'msw/node';

// Serveur de simulation réseau des tests (SH-20). Aucun handler par défaut :
// chaque test déclare les réponses qu'il attend via `server.use(...)`, ce qui rend
// visible tout appel HTTP non prévu (`onUnhandledRequest: 'error'`).
export const server = setupServer();
