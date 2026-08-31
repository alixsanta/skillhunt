import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { MediaRendition } from './media.entity';
import { MediaType } from '../common/enums';

/** Nom de la file, partagé mot pour mot avec `media-service` (design EP04 §7). */
export const MEDIA_QUEUE_NAME = 'media-transcode';

/** Charge utile du job. Contrat d'entrée figé depuis SH-15. */
export interface TranscodeJobData {
  mediaId: string;
  sourceKey: string;
  outputPrefix: string;
  posterKey: string;
}

/** Résultat rendu par le worker (design EP04 §7). Rempli par SH-16b. */
export interface TranscodeJobResult {
  durationSeconds: number;
  width: number;
  height: number;
  type: MediaType;
  mimeType: string;
  renditions: MediaRendition[];
}

/**
 * Producteur BullMQ du monolithe (SH-16a).
 *
 * Connexions DÉDIÉES plutôt que le `REDIS_CLIENT` partagé : `QueueEvents` est un client
 * bloquant, et BullMQ exige `maxRetriesPerRequest: null` sur ce type de connexion —
 * réglage incompatible avec le client applicatif partagé.
 */
@Injectable()
export class MediaQueue implements OnModuleDestroy {
  private readonly logger = new Logger(MediaQueue.name);
  private readonly connection: IORedis;
  private readonly eventsConnection: IORedis;
  private readonly queue: Queue<TranscodeJobData, TranscodeJobResult>;
  readonly events: QueueEvents;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.eventsConnection = new IORedis(url, { maxRetriesPerRequest: null });

    // Toute connexion Redis DOIT porter un écouteur `error` : sans lui, un incident
    // réseau tue le process sur un « unhandled 'error' event » au lieu de le laisser se
    // diagnostiquer. Défaut relevé en revue de SH-15.
    for (const [nom, client] of [
      ['file', this.connection],
      ['événements', this.eventsConnection],
    ] as const) {
      client.on('error', (err: Error) => {
        this.logger.error(`Connexion Redis (${nom}) en erreur : ${err.message}`);
      });
    }

    this.queue = new Queue<TranscodeJobData, TranscodeJobResult>(MEDIA_QUEUE_NAME, {
      connection: this.connection,
    });
    this.events = new QueueEvents(MEDIA_QUEUE_NAME, { connection: this.eventsConnection });
  }

  /**
   * Enfile un transcodage.
   *
   * **503 explicite** si Redis est indisponible, et non une dégradation silencieuse : ce
   * job EST l'opération métier, contrairement au bus d'événements de SH-14 qui reste
   * best-effort. Même distinction que celle tranchée en SH-36 pour le TokenStore.
   */
  async enqueueTranscode(data: TranscodeJobData): Promise<void> {
    try {
      await this.queue.add('transcode', data, {
        // `jobId = mediaId` : une double confirmation ne crée pas un second transcodage,
        // et l'écouteur retrouve le média sans table de correspondance.
        jobId: data.mediaId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        // Les échecs restent inspectables (dead-letter) ; les succès sont bornés.
        removeOnFail: false,
        removeOnComplete: 100,
      });
    } catch (err) {
      this.logger.error(`Échec d'enfilement du transcodage : ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Le service de transcodage est momentanément indisponible. Réessayez dans quelques instants.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.events.close();
    await this.queue.close();
    // BullMQ ne ferme JAMAIS une connexion fournie par l'appelant : à nous de le faire.
    await Promise.all([this.connection.quit(), this.eventsConnection.quit()]).catch(() => {
      this.connection.disconnect();
      this.eventsConnection.disconnect();
    });
  }
}
