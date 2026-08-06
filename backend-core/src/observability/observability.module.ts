import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsMiddleware } from './metrics.middleware';
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
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // L'identifiant de corrélation N'EST PAS posé ici : il doit précéder le middleware de
    // `nestjs-pino`, enregistré dès l'import du module. Il passe donc par `app.use()` dans
    // `configureApp` (cf. `request-id.middleware.ts`).
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
