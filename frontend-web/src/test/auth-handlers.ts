import { http, HttpResponse } from 'msw';
import { DEFAULT_API_URL } from '@/api/client';

/**
 * Handler MSW de `/auth/refresh` qui simule le VRAI backend : la rotation révoque l'ancien
 * refresh token (jti), donc un DEUXIÈME appel avec le même cookie reçoit 401 (SH-41).
 *
 * Origine (bug 2 de SH-20) : les tests répondaient 200 à TOUS les refresh — un backend qui
 * rotationne n'était jamais simulé, et la double rotation concurrente du montage StrictMode
 * (qui déconnectait l'utilisateur à chaque F5) est passée inaperçue. Avec ce handler, toute
 * rotation concurrente qui réapparaît fait rougir les tests.
 */
export function rotatingRefreshHandler(accessToken: string) {
  let calls = 0;

  const handler = http.post(`${DEFAULT_API_URL}/api/v1/auth/refresh`, () => {
    calls += 1;
    if (calls > 1) {
      // L'ancien jti a été révoqué par la première rotation : rejouer le même cookie échoue.
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json({ accessToken, refreshToken: 'jeton-rotationne' });
  });

  return { handler, calls: () => calls };
}
