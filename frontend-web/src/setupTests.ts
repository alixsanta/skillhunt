// Étend les matchers Vitest avec ceux de jest-dom (toBeInTheDocument, etc.)
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './test/server';

// Tout appel HTTP non simulé fait échouer le test : on ne laisse passer aucune
// requête réseau involontaire (SH-20).
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
