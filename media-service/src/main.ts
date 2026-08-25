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

  await new Promise<void>((resolve) => server.listen(config.port, resolve));

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
          void shutdown(running).then(() => process.exit(0));
        });
      }
    })
    .catch((err: Error) => {
      logger.error({ raison: err.message }, 'Échec du démarrage du media-service');
      process.exit(1);
    });
}
