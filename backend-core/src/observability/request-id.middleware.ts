import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** En-tête portant l'identifiant de corrélation, de bout en bout (SH-29). */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Identifiant de corrélation d'une requête (SH-29, C4.1.2).
 *
 * Sans lui, les logs du monolithe et ceux du `matching-service` sont deux listes
 * indépendantes : on voit qu'une recherche a échoué, jamais POURQUOI. Avec lui, une
 * requête LogQL sur un seul `requestId` reconstitue le trajet complet à travers les deux
 * services — c'est ce qui rend une anomalie *reproductible*, donc consignable au format
 * attendu par C4.2.1.
 *
 * ⚠️ **Middleware Express, appliqué par `configureApp` — pas un `NestMiddleware`.**
 * `nestjs-pino` enregistre son propre middleware au moment de l'import du module ; un
 * middleware Nest déclaré dans `ObservabilityModule` s'exécuterait donc APRÈS lui, et
 * `genReqId` lirait un `requestId` pas encore posé. Le passer par `app.use()` dans
 * `configureApp` — au même endroit que `cookieParser` — garantit l'ordre, et le fait
 * couvrir par le smoke test de démarrage de SH-41.
 *
 * L'identifiant est REPRIS s'il est déjà présent (la gateway ou un appelant amont peut
 * l'avoir posé), sinon généré. Il est toujours renvoyé au client : c'est la référence
 * qu'un utilisateur peut citer dans un signalement.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  // Un en-tête HTTP peut être répété : Express expose alors un tableau.
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

  // Validation stricte avant réémission (C2.2.3) : la valeur est renvoyée dans un en-tête
  // de réponse et journalisée. Accepter une chaîne arbitraire venue du réseau reviendrait
  // à laisser un tiers injecter du contenu dans nos logs (retours chariot, séquences ANSI)
  // ou dans la réponse HTTP.
  const requestId = isSafeRequestId(candidate) ? candidate : randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

/** Autorise un identifiant court, imprimable et sans séparateur — UUID compris. */
function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(value);
}
