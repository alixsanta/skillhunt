import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { Connection } from 'mongoose';
import type Redis from 'ioredis';
import { HealthController } from './health.controller';

type Probes = { postgres?: boolean; redis?: boolean; mongo?: boolean };

function makeController({ postgres = true, redis = true, mongo = true }: Probes = {}) {
  const ko = (nom: string) => () => Promise.reject(new Error(`${nom} indisponible`));

  const dataSource = {
    query: postgres ? () => Promise.resolve([{ '?column?': 1 }]) : ko('postgres'),
  } as unknown as DataSource;

  const redisClient = { ping: redis ? () => Promise.resolve('PONG') : ko('redis') } as unknown as Redis;

  const connection = {
    db: { admin: () => ({ ping: mongo ? () => Promise.resolve({ ok: 1 }) : ko('mongo') }) },
  } as unknown as Connection;

  return new HealthController(dataSource, connection, redisClient);
}

describe('HealthController (SH-29 — sondes S1)', () => {
  describe('vivacité', () => {
    it('répond ok sans interroger la moindre dépendance', () => {
      // Toutes les dépendances sont HS : la vivacité doit malgré tout répondre. Sinon un
      // incident Postgres ferait redémarrer en boucle un monolithe sain, transformant une
      // panne partielle en panne totale.
      const controller = makeController({ postgres: false, redis: false, mongo: false });

      const res = controller.liveness();

      expect(res.status).toBe('ok');
      expect(res.service).toBe('backend-core');
      expect(typeof res.uptimeSeconds).toBe('number');
    });
  });

  describe('disponibilité', () => {
    it('répond ok quand les trois dépendances répondent', async () => {
      const res = await makeController().readiness();

      expect(res.status).toBe('ok');
      expect(res.dependencies).toEqual({ postgres: 'up', redis: 'up', mongodb: 'up' });
    });

    // C'est ce 503 qui rend l'indisponibilité MESURABLE par Prometheus, donc alertable.
    const pannes: Array<[string, Probes, Record<string, string>]> = [
      ['PostgreSQL', { postgres: false }, { postgres: 'down', redis: 'up', mongodb: 'up' }],
      ['Redis', { redis: false }, { postgres: 'up', redis: 'down', mongodb: 'up' }],
      ['MongoDB', { mongo: false }, { postgres: 'up', redis: 'up', mongodb: 'down' }],
    ];

    it.each(pannes)('répond 503 quand %s est HS, et désigne le coupable', async (_n, probes, attendu) => {
      const controller = makeController(probes);

      await expect(controller.readiness()).rejects.toThrow(ServiceUnavailableException);

      // Le corps porte le diagnostic : une 503 nue obligerait à fouiller les logs.
      try {
        await controller.readiness();
      } catch (e) {
        const corps = (e as ServiceUnavailableException).getResponse() as Record<string, unknown>;
        expect(corps.status).toBe('degraded');
        expect(corps.dependencies).toEqual(attendu);
      }
    });

    it('ne laisse jamais fuir une exception de sonde en 500', async () => {
      // Une sonde qui propage rendrait 500 : la supervision lirait « erreur applicative »
      // là où il s'agit d'une dépendance absente — mauvais diagnostic, mauvaise remédiation.
      const controller = makeController({ postgres: false, redis: false, mongo: false });

      await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
