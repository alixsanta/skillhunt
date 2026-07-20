#!/bin/sh
# SH-2 — Entrypoint du backend-core conteneurisé.
# Le schéma est versionné par les migrations TypeORM (jamais de synchronize) : en
# environnement conteneurisé, on les applique au démarrage quand RUN_MIGRATIONS=true
# (dev/staging ; en prod, préférer une étape de déploiement dédiée).
set -e

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Application des migrations TypeORM (data-source compilé)…"
  node node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run
fi

exec node dist/main.js
