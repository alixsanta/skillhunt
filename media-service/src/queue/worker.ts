import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { MediaServiceConfig } from '../config';
import type { MediaMetrics } from '../metrics';
import { logger } from '../logger';

/**
 * Charge utile d'un job de transcodage (design EP04 §7).
 * Contrat FIGÉ dès SH-15 : le producteur backend-core de SH-16 s'y conformera.
 */
export interface TranscodeJobData {
  mediaId: string;
  sourceKey: string;
  outputPrefix: string;
  posterKey: string;
}

/** Résultat rendu à BullMQ. SH-15 rend une enveloppe vide ; SH-16 la remplira. */
export interface TranscodeJobResult {
  renditions: unknown[];
}

/**
 * Traitement d'un job — **NO-OP volontaire en SH-15** (C2.1.2).
 *
 * Le pipeline `ffprobe`/`ffmpeg` arrive en SH-16. Ici, on prouve seulement que la file
 * est consommée de bout en bout : c'est ce qui rend ce scaffolding vérifiable, au lieu
 * d'un dossier vide qui « compilerait » sans rien démontrer.
 */
export async function processTranscodeJob(job: Job<TranscodeJobData>): Promise<TranscodeJobResult> {
  logger.info(
    { jobId: job.id, mediaId: job.data.mediaId },
    'Job de transcodage reçu (traitement effectif livré en SH-16)',
  );
  return { renditions: [] };
}

/**
 * Construit le worker BullMQ et l'instrumente.
 * Le worker démarre sa consommation dès sa construction (comportement de BullMQ).
 */
export function createTranscodeWorker(
  config: MediaServiceConfig,
  metrics: MediaMetrics,
): Worker<TranscodeJobData, TranscodeJobResult> {
  // `maxRetriesPerRequest: null` est EXIGÉ par BullMQ sur la connexion d'un Worker :
  // avec la valeur par défaut d'ioredis, les commandes bloquantes finissent par être
  // abandonnées et le worker cesse silencieusement de consommer.
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<TranscodeJobData, TranscodeJobResult>(
    config.queueName,
    async (job) => {
      const stopTimer = metrics.jobDuration.startTimer();
      try {
        const result = await processTranscodeJob(job);
        metrics.jobsTotal.inc({ result: 'completed' });
        return result;
      } catch (err) {
        metrics.jobsTotal.inc({ result: 'failed' });
        throw err;
      } finally {
        stopTimer();
      }
    },
    { connection, concurrency: config.concurrency },
  );

  // Un échec silencieux de job est invisible en supervision : on le journalise
  // explicitement, sans jamais recracher la pile côté logs applicatifs.
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, raison: err.message }, 'Job de transcodage en échec');
  });

  // BullMQ émet 'error' pour les défauts de connexion, les échecs de reconnexion et de
  // nettoyage — sans handler explicite, il tombe dans le comportement par défaut de
  // Node (console.error), une ligne NON-JSON qu'Alloy ignore silencieusement. Un incident
  // Redis (le worker perd sa connexion) resterait alors totalement invisible en
  // supervision, alors même que /health reste volontairement à 200 dans ce cas.
  worker.on('error', (err) => logger.error({ raison: err.message }, 'Erreur du worker BullMQ'));

  // BullMQ traite une instance IORedis fournie par l'appelant comme « partagée » et ne
  // la ferme donc JAMAIS elle-même dans `worker.close()` (seule la connexion bloquante
  // dupliquée en interne est fermée). Sans ce hook, `connection` reste ouverte
  // indéfiniment après l'arrêt du worker et empêche le process de se terminer.
  worker.on('closed', () => {
    connection.quit().catch(() => connection.disconnect());
  });

  return worker;
}
