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
 * Gabarit de route de la requête, résolu en trois temps (SH-29).
 *
 * 1. `req.metricsRoute`, déposé par `MetricsRouteInterceptor` — le cas nominal.
 * 2. `req.route.path`, pour les requêtes REJETÉES AVANT l'intercepteur. NestJS exécute
 *    les guards AVANT les intercepteurs : une 401/403 n'atteint donc jamais l'étape 1,
 *    et sans ce repli tout le trafic refusé perdrait sa route — précisément celui qu'on
 *    surveille pour la sécurité (S7).
 * 3. `(inconnue)` sinon.
 *
 * Le motif joker est explicitement écarté : sur une route inexistante, la seule couche
 * Express qui correspond est celle du middleware lui-même, enregistré en `forRoutes('*')`,
 * et `req.route.path` vaut alors `/{*path}`. C'est ce que mesurait la version initiale
 * pour TOUTES les 404 — défaut relevé en relecture de la PR #47.
 *
 * Jamais l'URL brute : n'importe quel client pourrait créer autant de séries Prometheus
 * qu'il envoie d'URL distinctes, jusqu'à saturer la mémoire (explosion de cardinalité).
 */
function resolveRoute(req: Request): string {
  if (req.metricsRoute) {
    return req.metricsRoute;
  }

  const chemin: unknown = req.route?.path;
  if (typeof chemin === 'string' && chemin.length > 0 && !chemin.includes('*')) {
    return `${req.baseUrl ?? ''}${chemin}`;
  }

  return '(inconnue)';
}
