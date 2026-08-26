import { createServer } from 'node:http';
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

  it('rejette proprement quand le port est déjà pris, au lieu de tuer le process', async () => {
    // Un occupant tient le port ; `listen` échouera donc en EADDRINUSE. Sans écouteur
    // sur l'événement `error`, la promesse de bootstrap ne se réglerait jamais et Node
    // abattrait le process sur une pile brute — sans passer par la journalisation.
    // L'occupant doit se lier EXACTEMENT comme le service, c'est-à-dire sans hôte (donc
    // sur `::`, toutes interfaces). Le lier à `127.0.0.1` ne provoquerait aucun conflit
    // sous Windows, où les deux liaisons cohabitent — le test passerait alors à côté.
    const squatter = createServer();
    await new Promise<void>((resolve) => squatter.listen(0, resolve));
    const { port } = squatter.address() as AddressInfo;

    // Si le démarrage réussissait malgré tout, il faudrait quand même refermer ce qu'il a
    // ouvert : un worker resté connecté empêche Jest de rendre la main.
    let demarre: RunningService | undefined;

    try {
      await expect(
        bootstrap({
          REDIS_URL: url as string,
          PORT: String(port),
          MEDIA_QUEUE_NAME: 'media-transcode-bootstrap-conflit',
        }).then((service) => {
          demarre = service;
          return service;
        }),
      ).rejects.toThrow(/EADDRINUSE/);
    } finally {
      if (demarre) {
        await shutdown(demarre).catch(() => undefined);
      }
      await new Promise<void>((resolve) => squatter.close(() => resolve()));
    }
  }, 20_000);
});
