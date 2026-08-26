import { createServer, type Server } from 'node:http';
import type { MediaMetrics } from '../metrics';

/**
 * Serveur HTTP technique du media-service (SH-15).
 *
 * Volontairement SANS framework : ce service n'expose aucune route métier — le travail
 * arrive par la file BullMQ, pas par HTTP (design EP04 §4). Deux routes seulement :
 *   - `/health`  : vivacité, interrogée par le HEALTHCHECK du conteneur (sonde S1, SH-29)
 *   - `/metrics` : exposition Prometheus (C4.1.2)
 *
 * Aucun port hôte n'est publié : la collecte se fait sur le réseau Docker privé (archi §2).
 */
export function createHttpServer(metrics: MediaMetrics): Server {
  return createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }

    if (req.url === '/health') {
      // Sonde TRIVIALE, qui n'interroge AUCUNE dépendance. Y brancher Redis ferait
      // redémarrer en boucle un worker pourtant sain lors d'un incident Redis —
      // transformant une panne partielle en panne totale (cf. health.controller.ts).
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'media-service',
          uptimeSeconds: Math.round(process.uptime()),
        }),
      );
      return;
    }

    if (req.url === '/metrics') {
      metrics.render().then(
        (body) => {
          res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
          res.end(body);
        },
        () => {
          res.writeHead(500).end();
        },
      );
      return;
    }

    res.writeHead(404).end();
  });
}
