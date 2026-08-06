import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Mesure chaque requête HTTP et alimente les sondes S2/S3 (SH-29, C4.1.2).
 *
 * La mesure est prise sur l'évènement `finish` de la réponse : c'est le seul moment où
 * le statut est connu ET où la durée reflète le traitement complet.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();

    res.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observe(req.method, resolveRoute(req), res.statusCode, durationSeconds);
    });

    next();
  }
}

/**
 * Gabarit de route associé à la requête, à défaut une valeur générique.
 *
 * Express ne renseigne `req.route` qu'une fois le routeur passé ; sur une 404 il n'y a
 * aucune route. Retourner l'URL brute dans ce cas serait une faille d'exploitation :
 * n'importe quel client pourrait créer autant de séries Prometheus qu'il envoie d'URLs
 * distinctes, jusqu'à saturer la mémoire du serveur de métriques. On retombe donc sur
 * une étiquette fixe (« explosion de cardinalité », piège classique de l'instrumentation).
 */
function resolveRoute(req: Request): string {
  const path: unknown = req.route?.path;
  if (typeof path === 'string' && path.length > 0) {
    return `${req.baseUrl ?? ''}${path}`;
  }
  return '(inconnue)';
}
