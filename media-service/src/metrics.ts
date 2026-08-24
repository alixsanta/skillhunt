import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Registre des métriques du worker média (SH-15, C4.1.2).
 *
 * Registre DÉDIÉ plutôt que le registre global de prom-client : le global est un
 * singleton de module, ce qui fait échouer les tests dès qu'une seconde instance est
 * créée (« métrique déjà enregistrée »). Même parti pris qu'en backend-core, cf.
 * `observability/metrics.service.ts`.
 */
export class MediaMetrics {
  readonly registry = new Registry();

  /** Jobs terminés, ventilés par issue — alimente le taux d'échec du pipeline. */
  readonly jobsTotal = new Counter({
    name: 'media_jobs_total',
    help: 'Nombre de jobs de transcodage terminés, par issue',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  /**
   * Durée de traitement d'un job. Bornes en SECONDES et volontairement larges : un
   * transcodage 4K se compte en minutes, pas en millisecondes. Les bornes de
   * `http_request_duration_seconds` (backend-core) seraient toutes saturées ici.
   */
  readonly jobDuration = new Histogram({
    name: 'media_job_duration_seconds',
    help: 'Durée de traitement d\'un job de transcodage, en secondes',
    buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800],
    registers: [this.registry],
  });

  constructor() {
    // Saturation du process : tas, event loop lag, descripteurs de fichiers.
    collectDefaultMetrics({ register: this.registry });
  }

  /** Rendu texte au format d'exposition Prometheus. */
  render(): Promise<string> {
    return this.registry.metrics();
  }
}
