import pino from 'pino';

/**
 * Journalisation applicative du media-service (SH-15, C4.1.2).
 *
 * Logs JSON sur stdout, jamais dans un fichier : c'est le pilote `json-file` de Docker
 * qui les collecte, puis Alloy les pousse vers Loki (stack de supervision SH-29). Une
 * rotation applicative ferait doublon avec celle déjà configurée dans les fichiers compose.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'media-service' },
});
