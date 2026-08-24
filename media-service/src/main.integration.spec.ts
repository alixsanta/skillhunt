import { AddressInfo } from 'node:net';
import { bootstrap, shutdown, type RunningService } from './main';

// C2.2.2 — Test de bootstrap (leçon SH-41) : on démarre le service COMPLET — worker
// compris — et on vérifie qu'il sert réellement du trafic, puis qu'il s'arrête proprement.
const url = process.env.REDIS_URL;
const describeIf = url ? describe : describe.skip;

describeIf('bootstrap du media-service', () => {
  let running: RunningService;

  afterAll(async () => {
    // Filet de sécurité si le test échoue avant son propre `shutdown` : sans lui, le
    // worker resterait connecté et Jest ne rendrait jamais la main. Tolérant au double
    // appel, `shutdown` étant idempotent.
    if (running) {
      await shutdown(running).catch(() => undefined);
    }
  });

  it('démarre, sert /health, puis s\'arrête proprement', async () => {
    running = await bootstrap({
      REDIS_URL: url as string,
      PORT: '0', // port éphémère : aucun conflit si le service tourne déjà en conteneur
      MEDIA_QUEUE_NAME: 'media-transcode-bootstrap-test',
    });

    const { port } = running.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(200);
    expect((await response.json()).service).toBe('media-service');

    await shutdown(running);

    // Après l'arrêt, plus rien n'écoute : la connexion doit être refusée.
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  }, 20_000);
});
