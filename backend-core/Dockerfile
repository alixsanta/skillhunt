# SH-2 — Image de production du backend-core (NestJS).
# Multi-stage : les outils de build (tsc, devDependencies) n'entrent jamais dans l'image finale.

# --- Étape 1 : build TypeScript ---
FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    # Ne garde que les dépendances de production pour l'étape finale
    && npm prune --omit=dev

# --- Étape 2 : image d'exécution minimale ---
FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY docker-entrypoint.sh ./
# Exécution non-root (durcissement, CLAUDE.md §8) — l'utilisateur `node` existe dans l'image
USER node
EXPOSE 3001
# Un conteneur « up » doit signifier « l'API répond », pas seulement « le process vit » (SH-41)
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://localhost:3001/api/docs-json || exit 1
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
