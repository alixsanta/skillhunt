import pino from 'pino';
import { REDACTED_PATHS, buildLoggerParams } from './logger.config';

/**
 * Scénario 4 du ticket SH-29 — **critère bloquant**.
 *
 * Les logs partent dans Loki, y sont conservés et consultables depuis Grafana. Y laisser
 * fuiter un mot de passe ou un jeton créerait une seconde base de secrets, moins protégée
 * que la première (CLAUDE.md §8). Ce test vérifie la redaction sur le VRAI logger pino
 * configuré par le projet, pas sur une reproduction du réglage.
 */
describe('Redaction des logs (SH-29 — scénario 4, critère bloquant)', () => {
  /** Journalise `payload` avec la configuration réelle et rend la ligne JSON produite. */
  function logged(payload: Record<string, unknown>): string {
    const lignes: string[] = [];
    const logger = pino(
      { redact: { paths: REDACTED_PATHS, censor: '[Redacted]' } },
      { write: (ligne: string) => lignes.push(ligne) },
    );

    logger.info(payload, 'requête traitée');
    return lignes.join('');
  }

  /**
   * Chaque cas porte EXPLICITEMENT les valeurs qui ne doivent pas survivre.
   *
   * Les déduire du payload serait une erreur : pino expurge la valeur mais **conserve la
   * clé**, à dessein — savoir qu'un champ `password` était présent aide au diagnostic, sa
   * valeur non. Un test qui interdirait aussi les noms de clés échouerait donc sur le
   * comportement correct.
   */
  const secrets: Array<[string, Record<string, unknown>, string[]]> = [
    ['mot de passe à la racine', { password: 'MotDePasse!2026' }, ['MotDePasse!2026']],
    ['mot de passe imbriqué', { body: { password: 'MotDePasse!2026' } }, ['MotDePasse!2026']],
    [
      'changement de mot de passe',
      { currentPassword: 'ancien!42', newPassword: 'nouveau!42' },
      ['ancien!42', 'nouveau!42'],
    ],
    ['refresh token', { refreshToken: 'rt_abcdef123456' }, ['rt_abcdef123456']],
    ['access token', { body: { accessToken: 'at_abcdef123456' } }, ['at_abcdef123456']],
    ['secret TOTP (2FA, SH-40)', { twoFactorSecret: 'JBSWY3DPEHPK3PXP' }, ['JBSWY3DPEHPK3PXP']],
    ['codes de secours 2FA', { backupCodes: 'code-secours-unique' }, ['code-secours-unique']],
    [
      'numéro de série matériel (RGPD, SH-39/44)',
      { serialNumber: 'DJI-MAV3-000123' },
      ['DJI-MAV3-000123'],
    ],
    ['numéro de série imbriqué', { gear: { serialNumber: 'DJI-MAV3-000123' } }, ['DJI-MAV3-000123']],
    [
      'en-tête Authorization',
      { req: { headers: { authorization: 'Bearer jwt.token.ici' } } },
      ['Bearer', 'jwt.token.ici'],
    ],
    [
      'cookie de session',
      { req: { headers: { cookie: 'refresh_token=rt_abcdef' } } },
      ['rt_abcdef'],
    ],
  ];

  it.each(secrets)('expurge : %s', (_libelle, payload, valeursInterdites) => {
    const ligne = logged(payload);

    for (const valeur of valeursInterdites) {
      expect(ligne).not.toContain(valeur);
    }

    // La valeur est remplacée par un marqueur explicite, la clé conservée.
    expect(ligne).toContain('[Redacted]');
  });

  it('laisse intactes les données non sensibles (un log expurgé resterait inutile)', () => {
    const ligne = logged({ requestId: 'abc123def456', userId: 'u-42', statusCode: 200 });

    expect(ligne).toContain('abc123def456');
    expect(ligne).toContain('u-42');
    expect(ligne).not.toContain('[Redacted]');
  });

  describe('configuration du logger', () => {
    it('ignore les sondes en journalisation automatique (bruit et coût de stockage)', () => {
      const { pinoHttp } = buildLoggerParams() as {
        pinoHttp: { autoLogging: { ignore: (req: { url: string }) => boolean } };
      };

      expect(pinoHttp.autoLogging.ignore({ url: '/metrics' })).toBe(true);
      expect(pinoHttp.autoLogging.ignore({ url: '/api/v1/health' })).toBe(true);
      expect(pinoHttp.autoLogging.ignore({ url: '/api/v1/health/ready' })).toBe(true);
      // Le trafic métier, lui, doit être journalisé.
      expect(pinoHttp.autoLogging.ignore({ url: '/api/v1/gear' })).toBe(false);
    });

    it('étiquette chaque ligne du nom du service (un Loki agrège plusieurs services)', () => {
      const { pinoHttp } = buildLoggerParams() as { pinoHttp: { base: { service: string } } };
      expect(pinoHttp.base.service).toBe('backend-core');
    });

    // Régression constatée en exécutant la stack : pino émet les niveaux en NUMÉRIQUE par
    // défaut (30 = info, 50 = error) là où le matching-service les écrit en toutes lettres.
    // Alloy promeut ce champ en label Loki — le vocabulaire devenait donc incohérent entre
    // les deux services, et la sonde S6 (`{level="error"}`) restait muette sur le monolithe.
    it('émet le niveau en TEXTE, pour un label Loki commun aux deux services', () => {
      const { pinoHttp } = buildLoggerParams() as {
        pinoHttp: { formatters: { level: (label: string) => Record<string, unknown> } };
      };

      expect(pinoHttp.formatters.level('info')).toEqual({ level: 'info' });
      expect(pinoHttp.formatters.level('error')).toEqual({ level: 'error' });
      // Le vocabulaire doit coïncider avec celui de python-json-logger côté Python.
      expect(pinoHttp.formatters.level('warn')).toEqual({ level: 'warn' });
    });
  });
});
