import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectConnection } from '@nestjs/mongoose';
import type { DataSource } from 'typeorm';
import type { Connection } from 'mongoose';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { LivenessDto, ReadinessDto } from './dto/health.dto';

/** Résultat d'une sonde de dépendance. */
type ProbeState = 'up' | 'down';

@ApiTags('🩺 Santé & supervision')
@Controller('api/v1/health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectConnection() private readonly mongo: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Sonde de vivacité (S1, SH-29).
   *
   * Volontairement TRIVIALE : elle répond « le processus tourne et sert du trafic ».
   * Y ajouter une vérification de base de données serait une erreur classique — un
   * incident Postgres ferait alors redémarrer en boucle un monolithe pourtant sain,
   * transformant une panne partielle en panne totale. C'est `/ready` qui porte les
   * dépendances.
   */
  @Get()
  @ApiOperation({
    summary: 'Vivacité du service',
    description:
      "Répond 200 tant que le processus est vivant. N'interroge AUCUNE dépendance : " +
      'utilisée par le HEALTHCHECK du conteneur et par la sonde de disponibilité S1.',
  })
  @ApiResponse({ status: 200, description: 'Le service est vivant.', type: LivenessDto })
  liveness(): LivenessDto {
    return { status: 'ok', service: 'backend-core', uptimeSeconds: Math.round(process.uptime()) };
  }

  /**
   * Sonde de disponibilité réelle (S1, SH-29).
   *
   * Interroge PostgreSQL, Redis et MongoDB. Répond **503** dès qu'une dépendance est
   * hors service : c'est ce qui rend l'indisponibilité *mesurable* par Prometheus, donc
   * alertable. Un service qui répond 200 alors que sa base est tombée est invisible pour
   * la supervision.
   */
  @Get('ready')
  @ApiOperation({
    summary: 'Disponibilité du service et de ses dépendances',
    description:
      'Interroge PostgreSQL, Redis et MongoDB. Répond 503 si au moins une est indisponible.',
  })
  @ApiResponse({ status: 200, description: 'Toutes les dépendances répondent.', type: ReadinessDto })
  @ApiResponse({ status: 503, description: 'Au moins une dépendance est indisponible.' })
  async readiness(): Promise<ReadinessDto> {
    // Sondes en PARALLÈLE : en séquentiel, trois dépendances lentes cumuleraient leurs
    // délais et la sonde expirerait avant de rendre son diagnostic.
    const [postgres, redis, mongodb] = await Promise.all([
      this.probe(() => this.dataSource.query('SELECT 1')),
      this.probe(() => this.redis.ping()),
      this.probe(() => this.mongo.db!.admin().ping()),
    ]);

    const dependencies = { postgres, redis, mongodb };
    const degraded = Object.values(dependencies).some((state) => state === 'down');

    if (degraded) {
      // Le corps de la réponse est CONSERVÉ dans l'exception : il indique laquelle des
      // trois dépendances est tombée. Une 503 nue obligerait à fouiller les logs.
      throw new ServiceUnavailableException({
        status: 'degraded',
        service: 'backend-core',
        dependencies,
      });
    }

    return { status: 'ok', service: 'backend-core', dependencies };
  }

  /**
   * Exécute une sonde en neutralisant toute erreur.
   *
   * Une sonde ne doit JAMAIS propager d'exception : elle rendrait 500 au lieu de 503, et
   * la supervision lirait « erreur applicative » là où il s'agit d'une dépendance absente.
   */
  private async probe(check: () => Promise<unknown>): Promise<ProbeState> {
    try {
      await check();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
