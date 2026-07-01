import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

// Types d'événements métier publiés sur le bus (consommés par matching-service, SH-14).
export enum DomainEventType {
  GEAR_VALIDATED = 'gear.validated',
  GEAR_REJECTED = 'gear.rejected',
  FREELANCE_UPDATED = 'freelance.updated', // réservé : émis par SH-34 (MAJ position freelance)
}

const STREAM_KEY = 'skillhunt:events';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Publie un événement sur le stream Redis (XADD).
   * Best-effort (C2.2.3) : une panne Redis est loguée mais ne fait jamais échouer
   * l'opération métier appelante (la vérité est en PostgreSQL, le bus est une optimisation).
   * Payload = données NON sensibles uniquement (ids, type) — aucune PII.
   */
  async publish(type: DomainEventType, payload: Record<string, string>): Promise<void> {
    const fields: string[] = ['type', type];
    for (const [key, value] of Object.entries(payload)) {
      fields.push(key, value);
    }
    try {
      await this.redis.xadd(STREAM_KEY, '*', ...fields);
    } catch (err) {
      this.logger.error(`Échec de publication de l'événement ${type} : ${(err as Error).message}`);
    }
  }
}
