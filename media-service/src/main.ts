import type { Server } from 'node:http';
import type { Worker } from 'bullmq';
import { loadConfig, type MediaServiceConfig } from './config';
import { MediaMetrics } from './metrics';
import { createHttpServer } from './http/server';
import {
  createTranscodeWorker,
  type TranscodeJobData,
  type TranscodeJobResult,
} from './queue/worker';
import { logger } from './logger';

/** Poignées du service démarré, pour pouvoir l'arrêter (et le tester). */
export interface RunningService {
  server: Server;
  worker: Worker<TranscodeJobData, TranscodeJobResult>;
  config: MediaServiceConfig;
}

/**
 * Démarre le media-service : worker BullMQ + serveur technique (SH-15).
 *
 * Exporté (plutôt qu'exécuté à l'import) pour être testable : c'est ce qui permet au
 * test de bootstrap de démarrer le service pour de vrai, leçon directe de SH-41
 * (SH-15, C2.2.2).
 */
export async function bootstrap(env: NodeJS.ProcessEnv = process.env): Promise<RunningService> {
  const config = loadConfig(env);
  const metrics = new MediaMetrics();
  const worker = createTranscodeWorker(config, metrics);
  const server = createHttpServer(metrics);

  try {
    await new Promise<void>((resolve, reject) => {
      // `listen` ne signale ses échecs (EADDRINUSE…) QUE par l'événement `error` : sans ce
      // `once`, la promesse ne se réglerait jamais et l'événement partirait sans écouteur,
      // tuant le process sur une pile brute avant même le `.catch` du point d'entrée.
      const onListenError = (err: Error): void => reject(err);
      server.once('error', onListenError);
      server.listen(config.port, () => {
        server.off('error', onListenError);
        resolve();
      });
    });
  } catch (err) {
    // Le worker est DÉJÀ connecté à Redis à ce stade : le fermer évite de laisser une
    // connexion ouverte derrière un démarrage avorté.
    await worker.close();
    throw err;
  }

  // Une fois en écoute, une erreur de socket ne doit plus faire tomber le process sans trace.
  server.on('error', (err: Error) => {
    logger.error({ raison: err.message }, 'Erreur du serveur technique');
  });

  logger.info(
    { port: config.port, file: config.queueName, concurrence: config.concurrency },
    'media-service démarré',
  );

  return { server, worker, config };
}

/**
 * Arrêt propre : le worker d'abord, le serveur ensuite.
 *
 * `worker.close()` attend la fin du job en cours. Sans cela, un `docker compose down`
 * tuerait un transcodage en plein milieu (SH-16) et laisserait le job « bloqué » côté
 * BullMQ jusqu'à expiration de son verrou.
 */
export async function shutdown(running: RunningService): Promise<void> {
  await running.worker.close();
  await new Promise<void>((resolve) => running.server.close(() => resolve()));
}

// Exécution réelle uniquement quand le module est le point d'entrée : à l'import
// (donc en test), rien ne démarre tout seul.
if (require.main === module) {
  bootstrap()
    .then((running) => {
      for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.on(signal, () => {
          logger.info({ signal }, 'Arrêt demandé : fermeture du worker puis du serveur');
          void shutdown(running)
            .then(() => process.exit(0))
            .catch((err: Error) => {
              // Sans ce `catch`, un arrêt qui échoue (Redis injoignable au moment du
              // SIGTERM) devient un rejet non géré : le process meurt en code non-zéro
              // sans jamais atteindre `exit(0)`, alors que les logs annoncent un arrêt
              // propre en cours. On trace la raison et on sort en échec explicite.
              logger.error({ raison: err.message }, "Échec de l'arrêt propre");
              process.exit(1);
            });
        });
      }
    })
    .catch((err: Error) => {
      logger.error({ raison: err.message }, 'Échec du démarrage du media-service');
      process.exit(1);
    });
}
