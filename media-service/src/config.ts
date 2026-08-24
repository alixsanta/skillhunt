/**
 * Configuration du media-service (SH-15).
 *
 * Aucun secret ni valeur devinée : tout vient de l'environnement, et une variable
 * obligatoire manquante fait échouer le démarrage plutôt que de laisser le service
 * tourner à moitié (même parti pris que `storage.module.ts` côté backend-core). C2.2.3.
 */
export interface MediaServiceConfig {
  /** Port d'écoute du serveur technique (/health, /metrics). Aucun port hôte n'est publié. */
  port: number;
  /** URL du Redis portant la file BullMQ. */
  redisUrl: string;
  /** Nom de la file de jobs, partagé avec le producteur backend-core (SH-16). */
  queueName: string;
  /** Jobs traités simultanément. Défaut 1 : le transcodage est CPU-bound. */
  concurrency: number;
  /** Répertoire de travail du transcodage (SH-16). */
  tmpDir: string;
}

const DEFAULT_PORT = 3002;
const DEFAULT_QUEUE_NAME = 'media-transcode';
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_TMP_DIR = '/tmp/media';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MediaServiceConfig {
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL manquant : le worker ne peut pas joindre la file de jobs.');
  }

  return {
    port: toPort(env.PORT, DEFAULT_PORT),
    redisUrl,
    queueName: env.MEDIA_QUEUE_NAME ?? DEFAULT_QUEUE_NAME,
    concurrency: toPositiveInt(env.MEDIA_WORKER_CONCURRENCY, DEFAULT_CONCURRENCY, 'MEDIA_WORKER_CONCURRENCY'),
    tmpDir: env.MEDIA_TMP_DIR ?? DEFAULT_TMP_DIR,
  };
}

function toPositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} : valeur entière positive attendue, reçu « ${raw} »`);
  }
  return value;
}

/**
 * Port d'écoute. `0` est une valeur LÉGITIME : elle demande au système d'attribuer un
 * port libre — c'est ainsi que les tests démarrent le service sans risquer un conflit
 * avec l'instance conteneurisée. La borne haute évite qu'une coquille (`PORT=999999`)
 * ne se manifeste qu'au `listen`, bien après le démarrage.
 */
function toPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`PORT : entier attendu entre 0 et 65535, reçu « ${raw} »`);
  }
  return value;
}
