# CLAUDE.md — media-service

> Conventions **locales** du microservice média. Le contexte projet fait foi : voir le
> `CLAUDE.md` racine. Ne rien y dupliquer.

## Rôle

**Worker pur** de transcodage vidéo (SH-15 → SH-17). Il ne possède **ni base de données,
ni route métier, ni JWT** : le travail arrive par la file BullMQ `media-transcode`, et la
vérité métier reste dans `backend-core` (design EP04, décision D7).

## Structure

    src/
    ├── config.ts        # lecture + validation de l'environnement (échec explicite)
    ├── logger.ts        # pino JSON → stdout (collecté par Alloy → Loki, SH-29)
    ├── metrics.ts       # registre prom-client DÉDIÉ (jamais le registre global)
    ├── http/server.ts   # /health + /metrics, sans framework
    ├── queue/worker.ts  # Worker BullMQ + contrat de job typé
    └── main.ts          # bootstrap() / shutdown() + garde require.main

## Conventions

- Commentaires **en français**, identifiants **en anglais**.
- Specs `*.spec.ts` **à côté** du code ; `*.integration.spec.ts` pour ce qui exige Redis,
  avec la garde `process.env.REDIS_URL ? describe : describe.skip` (calque de
  `backend-core/src/auth/token-store.integration.spec.ts`).
- **Aucun `flushdb`** dans les tests : le Redis de dev peut être partagé. Utiliser une
  file dédiée et `queue.obliterate({ force: true })`.
- Port interne **3002**, **aucun port hôte publié** (archi §2).
- **Pas de `container_name`** dans compose : le service doit pouvoir être scalé
  (`--scale media-service=2`).
- `noImplicitAny` **actif** (contrairement à `backend-core`) : pas d'injection de
  dépendances ici, donc aucun `any` structurellement nécessaire.

## Commandes

    npm ci
    npm run start:dev      # ts-node-dev, hot reload
    npm run lint
    npm run test
    npm run build

Tests d'intégration en local (le port 6379 est occupé sur le poste de dev) :

    docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
    REDIS_URL=redis://127.0.0.1:6381 npm test
    docker stop sh-redis-verif
