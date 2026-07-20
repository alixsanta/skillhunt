# SH-2 — Image de production du frontend-web (Vite + nginx).
# ⚠️ VITE_API_URL est CUITE dans le bundle au build (contrainte Vite) : une image par
# environnement cible, ou un build par environnement — c'est l'exception assumée au
# principe « une image, N configs » documentée dans le ticket.

# --- Étape 1 : build Vite ---
FROM node:20-alpine AS build
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Étape 2 : serveur statique nginx ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO /dev/null http://localhost:80/ || exit 1
