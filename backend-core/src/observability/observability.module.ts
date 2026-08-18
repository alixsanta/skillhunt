import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsRouteInterceptor } from './metrics-route.interceptor';
import { buildLoggerParams } from './logger.config';

/**
 * Instrumentation du monolithe (SH-29, chantier A — C4.1.2).
 *
 * Réunit les trois briques que la supervision consomme :
 *   - logs structurés JSON corrélés et expurgés (`LoggerModule` + `RequestIdMiddleware`) ;
 *   - métriques Prometheus (`MetricsService` + `MetricsMiddleware` + `/metrics`) ;
 *   - sondes de vivacité et de disponibilité (`/api/v1/health`, `/api/v1/health/ready`).
 *
 * Sans ce module, la stack d'observabilité du chantier B n'aurait rien à ingérer.
 */
@Module({
  imports: [LoggerModule.forRoot(buildLoggerParams())],
  controllers: [HealthController, MetricsController],
  providers: [
    MetricsService,
    // Résout le gabarit de route pour l'étiquette Prometheus. GLOBAL : sans lui, le
    // middleware retombe sur `req.route`, qui porte le motif joker de `forRoutes('*')`
    // — toutes les requêtes s'étiquetaient `/{*path}` (défaut relevé en relecture).
    { provide: APP_INTERCEPTOR, useClass: MetricsRouteInterceptor },
  ],
  exports: [MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // L'identifiant de corrélation N'EST PAS posé ici : il doit précéder le middleware de
    // `nestjs-pino`, enregistré dès l'import du module. Il passe donc par `app.use()` dans
    // `configureApp` (cf. `request-id.middleware.ts`).
    consumer
      .apply(MetricsMiddleware)
      // Sondes exclues de la MESURE, et pas seulement de la journalisation.
      //
      // Sans cette exclusion, `http_requests_total` comptait les scrapes de Prometheus
      // (4/min) et le HEALTHCHECK du conteneur (4/min) : sur une plateforme à faible
      // trafic, ce bruit gonfle le dénominateur de S3 — un vrai pic d'erreurs peut alors
      // rester sous les 2 % — et tire le p95 de S2 vers le bas, les sondes répondant en
      // ~1 ms. Le `matching-service` excluait déjà ces routes (`excluded_handlers`) :
      // les deux services ne mesuraient donc pas la même population, et leurs tableaux
      // de bord n'étaient pas comparables. Relevé en relecture de la PR #47.
      //
      // Chemins ÉNUMÉRÉS un par un, sans joker. NestJS 11 s'appuie sur `path-to-regexp`
      // v8, qui a supprimé les groupes anonymes : `api/v1/health/(.*)` y lève
      // « Unexpected ( at index 14 » et empêcherait l'application de démarrer. Ni `tsc`
      // ni ESLint ne peuvent l'attraper — c'est une chaîne évaluée à l'exécution, soit
      // exactement la classe de défaut qui a motivé le smoke test de SH-41. Les deux
      // seules routes de santé étant connues, les nommer supprime le problème plutôt
      // que de le contourner par une syntaxe de joker à vérifier.
      .exclude(
        { path: '/metrics', method: RequestMethod.ALL },
        { path: '/api/v1/health', method: RequestMethod.ALL },
        { path: '/api/v1/health/ready', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
