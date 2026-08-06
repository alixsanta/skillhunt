import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Registre des métriques applicatives exposées à Prometheus (SH-29, C4.1.2).
 *
 * Fournit les trois indicateurs du tableau des sondes (ticket §4.3) :
 *   - S2 latence : `http_request_duration_seconds` (histogramme → p95 par route)
 *   - S3 taux d'erreur : `http_requests_total` ventilé par statut → ratio 5xx
 *   - saturation du process : métriques par défaut (tas, event loop lag, descripteurs)
 *
 * Registre DÉDIÉ plutôt que le registre global de prom-client : le global est un
 * singleton de module, ce qui fait échouer les tests dès qu'une deuxième instance
 * de l'application est créée (« métrique déjà enregistrée »). Le harnais de SH-41
 * instancie justement l'app plusieurs fois.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /**
   * Durée des requêtes HTTP. Les bornes sont choisies autour de la cible d'architecture
   * (< 50 ms, CLAUDE.md §3) et du seuil d'alerte S2 (p95 > 500 ms) : sans borne proche
   * de ces valeurs, le p95 calculé par Prometheus serait interpolé dans un intervalle
   * trop large pour déclencher l'alerte au bon moment.
   */
  private readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Durée des requêtes HTTP en secondes',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  private readonly httpTotal = new Counter({
    name: 'http_requests_total',
    help: 'Nombre total de requêtes HTTP traitées',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'skillhunt_' });
  }

  /**
   * Enregistre une requête terminée.
   *
   * `route` est le GABARIT de route (`/api/v1/gear/:id`), jamais l'URL réelle : utiliser
   * l'URL brute ferait exploser la cardinalité des séries Prometheus (une série par
   * identifiant) et ferait fuiter des identifiants de ressources dans les métriques.
   */
  observe(method: string, route: string, status: number, durationSeconds: number): void {
    const labels = { method, route, status: String(status) };
    this.httpDuration.observe(labels, durationSeconds);
    this.httpTotal.inc(labels);
  }

  /** Rendu au format d'exposition Prometheus. */
  async render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
