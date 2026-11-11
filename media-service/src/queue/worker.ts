import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { MediaServiceConfig } from '../config';
import type { MediaMetrics } from '../metrics';
import { logger } from '../logger';
import { createMediaStorage, type MediaStorage } from '../storage/s3';
import { runPipeline, type PipelineDeps, type TranscodeOutcome } from '../transcode/pipeline';
import { toTranscodeError } from '../transcode/errors';

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

/**
 * Résultat rendu à BullMQ.
 *
 * SH-15 rendait une enveloppe vide, ce qui rendait l'état `READY` INATTEIGNABLE : le
 * validateur du monolithe exige une durée, des dimensions et au moins une piste. Le type
 * est désormais celui que produit réellement le pipeline — une seule définition, donc
 * aucune dérive possible entre le worker et son propre contrat.
 */
export type TranscodeJobResult = TranscodeOutcome;

/**
 * Traitement d'un job — le VRAI pipeline depuis SH-16b (C2.1.2).
 *
 * Les dépendances sont INJECTÉES plutôt que construites ici : c'est ce qui permet de
 * tester l'orchestration sur un stockage simulé (`pipeline.spec.ts`) sans jamais toucher
 * S3, et de tester ce câblage-ci sans ffmpeg.
 */
export async function processTranscodeJob(
  job: Job<TranscodeJobData>,
  deps: PipelineDeps,
): Promise<TranscodeJobResult> {
  logger.info({ jobId: job.id, mediaId: job.data.mediaId }, 'Transcodage démarré');

  let resultat: TranscodeJobResult;
  try {
    resultat = await runPipeline(
      {
        ...deps,
        // La progression BullMQ rend le job observable EN COURS de route. Un échec
        // d'écriture de progression ne doit surtout pas faire échouer le transcodage :
        // ce serait perdre des minutes de calcul pour un détail de supervision.
        onProgress: (percent) => {
          void job.updateProgress(percent).catch((err: Error) => {
            logger.warn({ jobId: job.id, raison: err.message }, 'Progression non enregistrée');
          });
        },
      },
      job.data,
    );
  } catch (err) {
    // POINT DE PASSAGE UNIQUE. Le message de l'erreur relancée devient le `failedReason`
    // BullMQ, puis l'`errorReason` que le portfolio affiche tel quel. Seul un message
    // UTILISATEUR sort d'ici ; la cause technique complète reste dans ce journal. Relevé
    // en recette : l'erreur brute de ffprobe exposait sa ligne de commande et le chemin
    // interne du conteneur (cf. `errors.ts`).
    const erreur = toTranscodeError(err);
    logger.error(
      { jobId: job.id, mediaId: job.data.mediaId, raison: erreur.message, detail: erreur.detail },
      'Transcodage en échec',
    );
    throw erreur;
  }

  logger.info(
    {
      jobId: job.id,
      mediaId: job.data.mediaId,
      pistes: resultat.renditions.length,
      type: resultat.type,
      dureeSecondes: Math.round(resultat.durationSeconds),
    },
    'Transcodage terminé',
  );

  return resultat;
}

/**
 * Construit le worker BullMQ et l'instrumente.
 * Le worker démarre sa consommation dès sa construction (comportement de BullMQ).
 */
export function createTranscodeWorker(
  config: MediaServiceConfig,
  metrics: MediaMetrics,
  /**
   * Substitution du stockage, pour les tests d'intégration : elle permet de faire passer
   * un VRAI transcodage par la VRAIE file BullMQ sans dépendre d'un S3. En production,
   * rien n'est passé et le client S3 est construit depuis la configuration.
   */
  overrides: { storage?: MediaStorage } = {},
): Worker<TranscodeJobData, TranscodeJobResult> {
  // Construit UNE FOIS par worker et non par job : le client S3 porte un pool de
  // connexions, le recréer à chaque job en ouvrirait un nouveau à chaque fois.
  const deps: PipelineDeps = {
    storage: overrides.storage ?? createMediaStorage(config.s3),
    tmpDir: config.tmpDir,
  };

  // `maxRetriesPerRequest: null` est EXIGÉ par BullMQ sur la connexion d'un Worker :
  // avec la valeur par défaut d'ioredis, les commandes bloquantes finissent par être
  // abandonnées et le worker cesse silencieusement de consommer.
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  // BullMQ n'écoute `error` sur cette connexion QUE pendant la vie du worker : il attache
  // son handler à l'initialisation et le RETIRE dans le `finally` de `close()`
  // (redis-connection.js). Notre propre écouteur couvre les deux fenêtres où il n'y en
  // aurait aucun — avant l'init, et après la fermeture, or c'est précisément là que le
  // `quit()` ci-dessous s'exécute. Sans lui, un SIGTERM reçu pendant une panne Redis tue
  // le process sur un « unhandled 'error' event » au lieu de l'arrêter proprement.
  connection.on('error', (err: Error) => {
    logger.error({ raison: err.message }, 'Connexion Redis du worker en erreur');
  });

  const worker = new Worker<TranscodeJobData, TranscodeJobResult>(
    config.queueName,
    async (job) => {
      const stopTimer = metrics.jobDuration.startTimer();
      try {
        const result = await processTranscodeJob(job, deps);
        metrics.jobsTotal.inc({ result: 'completed' });
        metrics.renditionsTotal.inc(result.renditions.length);
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
