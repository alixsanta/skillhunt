import { MediaMetrics } from './metrics';

// C2.2.2 — Une métrique jamais vérifiée est une métrique qui ment le jour de l'incident.
describe('MediaMetrics', () => {
  it('expose les compteurs de jobs au format Prometheus', async () => {
    const metrics = new MediaMetrics();

    metrics.jobsTotal.inc({ result: 'completed' });
    const body = await metrics.render();

    expect(body).toContain('media_jobs_total');
    expect(body).toContain('media_jobs_total{result="completed"} 1');
  });

  it('expose un histogramme de durée de job', async () => {
    const metrics = new MediaMetrics();

    const stop = metrics.jobDuration.startTimer();
    stop();
    const body = await metrics.render();

    expect(body).toContain('media_job_duration_seconds');
  });

  it('utilise un registre DÉDIÉ : deux instances coexistent sans conflit', () => {
    // Le registre global de prom-client est un singleton de module : deux instances
    // déclencheraient « métrique déjà enregistrée » et casseraient le harnais de tests.
    expect(() => {
      new MediaMetrics();
      new MediaMetrics();
    }).not.toThrow();
  });

  it('embarque les métriques par défaut du process (saturation)', async () => {
    const metrics = new MediaMetrics();

    const body = await metrics.render();

    expect(body).toContain('process_cpu_user_seconds_total');
  });
});
