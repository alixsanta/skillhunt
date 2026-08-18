import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

/**
 * Résout le GABARIT de route et le dépose sur la requête (SH-29).
 *
 * `MetricsMiddleware` ne peut pas le faire seul : appliqué en `forRoutes('*')`, il est
 * enregistré comme une route joker, et `req.route.path` porte alors ce motif — mesuré en
 * conditions réelles, toutes les requêtes s'étiquetaient `/{*path}`. Le trafic
 * s'effondrait sur une seule série : le panneau « Trafic par route » n'affichait qu'une
 * ligne, et le p95 de S2 mélangeait toutes les routes. Défaut relevé en relecture.
 *
 * Un intercepteur, lui, connaît le contrôleur ET le handler visés, donc le gabarit exact
 * (`/api/v1/gear/freelance/:id`). La cardinalité reste bornée par le nombre de routes
 * déclarées — jamais par le nombre d'URL reçues.
 *
 * Il ne s'exécute QUE sur les routes résolues : une 404 ne dépose rien, et le middleware
 * retombe sur son étiquette générique. C'est le comportement voulu — une URL inexistante
 * ne doit pas créer de série.
 */
@Injectable()
export class MetricsRouteInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const requete = context.switchToHttp().getRequest<Request>();
    requete.metricsRoute = resoudreGabarit(context);

    return next.handle();
  }
}

/** Concatène le préfixe du contrôleur et le chemin du handler, normalisés. */
function resoudreGabarit(context: ExecutionContext): string {
  const prefixe = lireChemin(context.getClass());
  const suffixe = lireChemin(context.getHandler());
  const gabarit = `/${[prefixe, suffixe].filter(Boolean).join('/')}`;

  // Les décorateurs acceptent des chemins avec ou sans barres obliques : on normalise
  // pour que `/api/v1/gear` et `api/v1/gear/` produisent la MÊME série Prometheus.
  return gabarit.replace(/\/{2,}/g, '/').replace(/(.+)\/$/, '$1');
}

function lireChemin(cible: unknown): string {
  const valeur: unknown = Reflect.getMetadata(PATH_METADATA, cible as object);
  if (typeof valeur !== 'string') {
    return '';
  }
  return valeur.replace(/^\/+|\/+$/g, '');
}
