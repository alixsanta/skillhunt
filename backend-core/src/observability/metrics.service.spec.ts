import { MetricsService } from './metrics.service';

describe('MetricsService (SH-29 — sondes S2/S3)', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    // Registre dédié par instance : le registre global de prom-client est un singleton
    // de module et lèverait « métrique déjà enregistrée » à la deuxième instanciation.
    // Le harnais de SH-41 crée justement l'application plusieurs fois.
    metrics = new MetricsService();
  });

  it('expose la latence et le compteur de requêtes (S2 et S3)', async () => {
    metrics.observe('GET', '/api/v1/gear', 200, 0.042);

    const rendu = await metrics.render();

    expect(rendu).toContain('http_request_duration_seconds');
    expect(rendu).toContain('http_requests_total');
    expect(rendu).toContain('method="GET"');
    expect(rendu).toContain('route="/api/v1/gear"');
    expect(rendu).toContain('status="200"');
  });

  it('permet de calculer un taux de 5xx (indicateur S3)', async () => {
    metrics.observe('POST', '/api/v1/auth/login', 200, 0.01);
    metrics.observe('POST', '/api/v1/auth/login', 500, 0.01);

    const rendu = await metrics.render();

    expect(rendu).toContain('status="500"');
    expect(rendu).toContain('status="200"');
  });

  it('comporte des bornes autour du seuil d’alerte p95 (500 ms)', async () => {
    metrics.observe('GET', '/api/v1/gear', 200, 0.6);

    const rendu = await metrics.render();

    // Sans borne proche du seuil, le p95 calculé par Prometheus serait interpolé dans un
    // intervalle trop large pour déclencher l'alerte S2 au bon moment.
    expect(rendu).toContain('le="0.5"');
    expect(rendu).toContain('le="0.25"');
  });

  it('collecte les métriques de saturation du process, préfixées', async () => {
    const rendu = await metrics.render();
    expect(rendu).toContain('skillhunt_process_');
  });

  it('annonce le type de contenu attendu par Prometheus', () => {
    expect(metrics.contentType).toContain('text/plain');
  });

  it('isole les registres entre instances (rejouabilité du harnais)', () => {
    expect(() => new MetricsService()).not.toThrow();
  });
});
