/**
 * Augmentation du type `Request` d'Express (SH-29).
 *
 * `RequestIdMiddleware` attache l'identifiant de corrélation à la requête ; le déclarer
 * ici évite un `as any` à chaque lecture et fait vérifier son usage par le compilateur.
 */
declare global {
  namespace Express {
    interface Request {
      /** Identifiant de corrélation de la requête (cf. `requestIdMiddleware`). */
      requestId?: string;

      /**
       * Gabarit de route résolu par `MetricsRouteInterceptor` (SH-29).
       * Absent sur une route non résolue (404) : le middleware retombe alors sur
       * une étiquette générique plutôt que de créer une série par URL reçue.
       */
      metricsRoute?: string;
    }
  }
}

export {};
