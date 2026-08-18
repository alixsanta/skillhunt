import type { Request, Response } from 'express';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './request-id.middleware';

function makeReq(headerValue?: unknown): Request {
  return { headers: headerValue === undefined ? {} : { [REQUEST_ID_HEADER]: headerValue } } as Request;
}

function makeRes(): Response & { headers: Record<string, unknown> } {
  const headers: Record<string, unknown> = {};
  return {
    headers,
    setHeader: (name: string, value: unknown) => {
      headers[name] = value;
    },
  } as unknown as Response & { headers: Record<string, unknown> };
}

describe('requestIdMiddleware (SH-29 — corrélation des logs)', () => {
  it('génère un identifiant quand la requête n’en porte pas', () => {
    const req = makeReq();
    const res = makeRes();

    requestIdMiddleware(req, res, jest.fn());

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers[REQUEST_ID_HEADER]).toBe(req.requestId);
  });

  it('reprend un identifiant amont valide (corrélation de bout en bout)', () => {
    const req = makeReq('gateway-abc123');
    const res = makeRes();

    requestIdMiddleware(req, res, jest.fn());

    expect(req.requestId).toBe('gateway-abc123');
    expect(res.headers[REQUEST_ID_HEADER]).toBe('gateway-abc123');
  });

  it('appelle toujours next()', () => {
    const next = jest.fn();
    requestIdMiddleware(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // C2.2.3 — la valeur est réémise en en-tête ET journalisée : une chaîne arbitraire
  // venue du réseau permettrait d'injecter du contenu dans les logs ou la réponse HTTP.
  describe('rejette les identifiants amont non conformes et en génère un sain', () => {
    const hostiles: Array<[string, unknown]> = [
      ['injection de saut de ligne (forge de fausses lignes de log)', 'abc\r\nX-Injected: 1'],
      ['séquence ANSI (falsification de l’affichage console)', 'abc[31mrouge'],
      ['trop court', 'abc'],
      ['trop long', 'a'.repeat(129)],
      ['caractères hors jeu autorisé', 'abc/def;ghi'],
      ['type non conforme', 42],
    ];

    it.each(hostiles)('%s', (_libelle, valeur) => {
      const req = makeReq(valeur);
      const res = makeRes();

      requestIdMiddleware(req, res, jest.fn());

      expect(req.requestId).not.toBe(valeur);
      expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('retient la première valeur quand l’en-tête est répété', () => {
    const req = makeReq(['premier-valide', 'second']);
    const res = makeRes();

    requestIdMiddleware(req, res, jest.fn());

    expect(req.requestId).toBe('premier-valide');
  });
});
