import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

/**
 * Exposition des métriques au format Prometheus (SH-29, C4.1.2).
 *
 * ⚠️ **Route délibérément HORS du préfixe `api/v1`.** La gateway ne relaie au monolithe
 * que `/api/`, `/api/v1/auth/` et `/socket.io/` ; tout le reste part vers la SPA. Poser
 * cette route sous `api/v1` la rendrait publiquement joignable, alors qu'elle divulgue
 * la cartographie complète des routes, le volume de trafic et la répartition des codes
 * d'erreur — une aide au reconnaissance offerte gratuitement.
 *
 * Elle reste atteignable par Prometheus sur le réseau Docker privé
 * (`http://backend-core:3001/metrics`), qui ne passe pas par la gateway.
 *
 * `@ApiExcludeController` : absente de Swagger, publié à travers la gateway — inutile
 * d'annoncer une surface qu'on prend soin de ne pas exposer.
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  // Format d'exposition Prometheus : sans ce Content-Type, Nest sérialise en JSON et
  // le scraper rejette la réponse.
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async scrape(): Promise<string> {
    return this.metrics.render();
  }
}
