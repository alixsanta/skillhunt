import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { apiClient, DEFAULT_API_URL } from './client';
import { installAuthInterceptors } from './auth-interceptors';
import { sessionStore } from '@/features/auth/session-store';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const OLD_TOKEN = fakeJwt({ userId: 'u-1', email: 'a@skillhunt.io', role: 'FREELANCE' });
// `v: 2` distingue le payload de NEW_TOKEN : sans ce champ, les deux jetons encodent le
// même payload et btoa(JSON.stringify(...)) produit une chaîne strictement identique à
// OLD_TOKEN, ce qui invaliderait les tests de rotation (401 jamais déclenché en pratique).
const NEW_TOKEN = fakeJwt({ userId: 'u-1', email: 'a@skillhunt.io', role: 'FREELANCE', v: 2 });

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

beforeAll(() => installAuthInterceptors());
afterEach(() => sessionStore.clear());

describe("intercepteurs d'authentification (SH-20)", () => {
  it('injecte le bearer quand la session est active', async () => {
    sessionStore.setSession(OLD_TOKEN);
    let seen: string | null = null;

    server.use(
      http.get(url('/api/v1/gear/me'), ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({ items: [] });
      }),
    );

    await apiClient.get('/api/v1/gear/me');

    expect(seen).toBe(`Bearer ${OLD_TOKEN}`);
  });

  it("n'injecte aucun bearer sans session", async () => {
    let seen: string | null = 'sentinelle';

    server.use(
      http.get(url('/api/v1/public'), ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiClient.get('/api/v1/public');

    expect(seen).toBeNull();
  });

  it('sur 401 : rafraîchit le token puis REJOUE la requête initiale', async () => {
    sessionStore.setSession(OLD_TOKEN);
    let attempt = 0;

    server.use(
      http.post(url('/api/v1/auth/refresh'), () =>
        HttpResponse.json({ accessToken: NEW_TOKEN, refreshToken: 'ignoré-par-le-web' }),
      ),
      http.get(url('/api/v1/gear/me'), ({ request }) => {
        attempt += 1;
        // Le 1er appel porte l'ancien token → 401 ; le rejeu doit porter le nouveau.
        if (request.headers.get('authorization') === `Bearer ${NEW_TOKEN}`) {
          return HttpResponse.json({ items: ['drone'] });
        }
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const response = await apiClient.get<{ items: string[] }>('/api/v1/gear/me');

    expect(response.data).toEqual({ items: ['drone'] });
    expect(attempt).toBe(2); // appel initial + rejeu
    expect(sessionStore.getAccessToken()).toBe(NEW_TOKEN);
  });

  it('sur 401 CONCURRENTS : un SEUL appel à /auth/refresh (single-flight)', async () => {
    sessionStore.setSession(OLD_TOKEN);
    let refreshCalls = 0;

    server.use(
      http.post(url('/api/v1/auth/refresh'), () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: NEW_TOKEN, refreshToken: 'r' });
      }),
      http.get(url('/api/v1/gear/me'), ({ request }) =>
        request.headers.get('authorization') === `Bearer ${NEW_TOKEN}`
          ? HttpResponse.json({ ok: true })
          : new HttpResponse(null, { status: 401 }),
      ),
    );

    await Promise.all([
      apiClient.get('/api/v1/gear/me'),
      apiClient.get('/api/v1/gear/me'),
      apiClient.get('/api/v1/gear/me'),
    ]);

    // Sans single-flight : 3 rotations, dont 2 révoquent le jeton des autres → déconnexion.
    expect(refreshCalls).toBe(1);
  });

  it("si le refresh échoue : la session est purgée et l'erreur remonte", async () => {
    sessionStore.setSession(OLD_TOKEN);

    server.use(
      http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })),
      http.get(url('/api/v1/gear/me'), () => new HttpResponse(null, { status: 401 })),
    );

    await expect(apiClient.get('/api/v1/gear/me')).rejects.toBeDefined();
    expect(sessionStore.getAccessToken()).toBeNull();
    expect(sessionStore.getUser()).toBeNull();
  });

  it('un 401 sur /auth/refresh lui-même ne déclenche pas de boucle', async () => {
    let refreshCalls = 0;

    server.use(
      http.post(url('/api/v1/auth/refresh'), () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(apiClient.post('/api/v1/auth/refresh', {})).rejects.toBeDefined();

    expect(refreshCalls).toBe(1); // pas de rappel récursif
  });

  it("un 401 sur /auth/login SANS session active ne déclenche aucun refresh (erreur d'origine préservée)", async () => {
    let refreshCalls = 0;

    server.use(
      http.post(url('/api/v1/auth/refresh'), () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: NEW_TOKEN });
      }),
      http.post(url('/api/v1/auth/login'), () =>
        HttpResponse.json({ message: 'Identifiants incorrects' }, { status: 401 }),
      ),
    );

    await expect(
      apiClient.post('/api/v1/auth/login', { email: 'a@skillhunt.io', password: 'mauvais' }),
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(refreshCalls).toBe(0); // aucune rotation : pas de session à rafraîchir
  });

  it('ne rejoue jamais deux fois : un 401 sur le rejeu remonte sans reboucler', async () => {
    sessionStore.setSession(OLD_TOKEN);
    let attempts = 0;
    let refreshCalls = 0;

    server.use(
      http.post(url('/api/v1/auth/refresh'), () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: NEW_TOKEN });
      }),
      // Rejeté même avec le NOUVEAU token (jeton révoqué côté serveur).
      http.get(url('/api/v1/gear/me'), () => {
        attempts += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(apiClient.get('/api/v1/gear/me')).rejects.toBeDefined();
    expect(attempts).toBe(2); // appel initial + UN rejeu, pas davantage
    expect(refreshCalls).toBe(1);
  });
});
