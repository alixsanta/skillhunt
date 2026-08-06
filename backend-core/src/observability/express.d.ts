/**
 * Augmentation du type `Request` d'Express (SH-29).
 *
 * `RequestIdMiddleware` attache l'identifiant de corrélation à la requête ; le déclarer
 * ici évite un `as any` à chaque lecture et fait vérifier son usage par le compilateur.
 */
declare global {
  namespace Express {
    interface Request {
      /** Identifiant de corrélation de la requête (cf. `RequestIdMiddleware`). */
      requestId?: string;
    }
  }
}

export {};
