# SH-15 — Image du media-service (worker Node + FFmpeg).
# Multi-stage : les outils de build (tsc, devDependencies) n'entrent jamais dans l'image finale.

# --- Étape 1 : build TypeScript ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    # Ne garde que les dépendances de production pour l'étape finale
    && npm prune --omit=dev

# --- Étape 2 : image d'exécution minimale ---
FROM node:20-alpine
ENV NODE_ENV=production
# ffmpeg fournit `ffmpeg` ET `ffprobe` : c'est la raison d'être de ce service (SH-16).
# Installé dans l'étage d'EXÉCUTION uniquement — l'étage de build n'en fait rien.
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Répertoire de travail du transcodage, possédé par l'utilisateur non-root
RUN mkdir -p /tmp/media && chown -R node:node /tmp/media
# Exécution non-root (durcissement, CLAUDE.md §8) — l'utilisateur `node` existe dans l'image
USER node
EXPOSE 3002
# Cible EXPLICITEMENT 127.0.0.1 et non `localhost` : c'est la résolution de `localhost`
# en IPv6 ::1 qui avait rendu deux conteneurs « unhealthy » en production (AN-01, SH-49).
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3002/health || exit 1
CMD ["node", "dist/main.js"]
