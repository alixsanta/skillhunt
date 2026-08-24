import { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHttpServer } from './server';
import { MediaMetrics } from '../metrics';

// C2.2.2 — Le serveur est démarré POUR DE VRAI puis interrogé : c'est exactement le
// type de bug (« le serveur ne démarrait pas ») qui avait échappé aux tests en SH-41.
describe('serveur technique du media-service', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createHttpServer(new MediaMetrics());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /health répond 200 avec le nom du service et son uptime', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('media-service');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('GET /metrics répond 200 au format texte Prometheus', async () => {
    const response = await fetch(`${baseUrl}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toContain('media_jobs_total');
  });

  it('répond 404 sur une route inconnue', async () => {
    const response = await fetch(`${baseUrl}/inconnu`);

    expect(response.status).toBe(404);
  });

  it('répond 405 sur un verbe autre que GET', async () => {
    const response = await fetch(`${baseUrl}/health`, { method: 'POST' });

    expect(response.status).toBe(405);
  });
});
