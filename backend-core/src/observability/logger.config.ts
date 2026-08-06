import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { REQUEST_ID_HEADER } from './request-id.middleware';

/**
 * Chemins EXPURGÉS des logs (SH-29, CLAUDE.md §8).
 *
 * Un log structuré est ingéré par Loki, conservé, et consultable par quiconque accède à
 * Grafana. Y laisser fuiter un mot de passe ou un jeton reviendrait à créer une seconde
 * base de secrets, moins protégée que la première. La liste couvre les trois familles
 * du projet :
 *   - authentification : mot de passe, jetons, en-têtes porteurs, cookies ;
 *   - 2FA : secret TOTP chiffré et codes de secours ;
 *   - RGPD/métier : numéro de série d'un équipement, qui identifie un matériel et donc
 *     indirectement son propriétaire (minimisation, §8.7 — même exigence qu'en SH-39/SH-44
 *     où il est retiré des réponses API).
 *
 * `censor` remplace la valeur mais CONSERVE la clé : on garde la preuve que le champ
 * était présent, ce qui reste utile au diagnostic, sans sa valeur.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'currentPassword',
  'newPassword',
  'refreshToken',
  '*.refreshToken',
  'accessToken',
  '*.accessToken',
  'token',
  '*.token',
  'twoFactorSecret',
  '*.twoFactorSecret',
  'backupCodes',
  '*.backupCodes',
  'serialNumber',
  '*.serialNumber',
];

/**
 * Configuration du logger structuré JSON (SH-29, C4.1.2).
 *
 * Le JSON n'est pas un choix esthétique : Promtail/Alloy expédie les lignes à Loki, et
 * seul un format structuré permet des requêtes LogQL sur `level`, `requestId` ou
 * `statusCode`. Du texte libre ne se filtre qu'à la sous-chaîne — donc mal.
 */
export function buildLoggerParams(): Params {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),

      // Champs communs à toutes les lignes : indispensables dès qu'un seul Loki
      // agrège plusieurs services.
      base: { service: 'backend-core' },

      // Identifiant de corrélation, posé par RequestIdMiddleware et propagé jusqu'au
      // matching-service. C'est la clé de jointure entre les deux journaux.
      genReqId: (req: IncomingMessage) => {
        const existing = (req as IncomingMessage & { requestId?: string }).requestId;
        return existing ?? (req.headers[REQUEST_ID_HEADER] as string | undefined) ?? '';
      },
      customProps: (req: IncomingMessage) => ({
        requestId: (req as IncomingMessage & { requestId?: string }).requestId,
      }),

      redact: { paths: REDACTED_PATHS, censor: '[Redacted]' },

      // Sérialiseurs resserrés : par défaut pino-http journalise l'intégralité des
      // en-têtes de requête. Beaucoup sont inutiles au diagnostic et certains portent
      // des données personnelles — on ne garde que ce qui sert.
      serializers: {
        req: (req: IncomingMessage & { method?: string; url?: string }) => ({
          method: req.method,
          url: req.url,
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },

      // Les sondes battent toutes les quelques secondes : au niveau `info` elles
      // noieraient les lignes utiles et gonfleraient le stockage Loki pour rien.
      // Elles restent visibles en `debug` et, surtout, restent MESURÉES par Prometheus —
      // c'est la métrique qui porte la disponibilité, pas la ligne de log.
      autoLogging: {
        ignore: (req: IncomingMessage) => {
          const url = req.url ?? '';
          return url === '/metrics' || url.startsWith('/api/v1/health');
        },
      },
    },
  };
}
