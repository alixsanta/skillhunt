/**
 * Erreur de transcodage à DEUX visages (SH-16b, relevé en recette de bout en bout).
 *
 * Le message d'une erreur qui fait échouer un job devient le `failedReason` BullMQ, que
 * le monolithe enregistre dans `errorReason` et que le portfolio affiche TEL QUEL sous le
 * badge « ÉCHEC ». Laisser remonter l'erreur brute de `ffprobe` y exposait la ligne de
 * commande complète, le chemin interne du conteneur (`/tmp/media/…`) et une adresse
 * mémoire : une fuite d'informations internes (C2.2.3), et un message incompréhensible.
 *
 * D'où la séparation :
 *  - `message` — court, en français, destiné à l'UTILISATEUR, sans aucun détail interne ;
 *  - `detail`  — la cause technique complète, destinée aux JOURNAUX du worker uniquement.
 */
export class TranscodeError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = 'TranscodeError';
  }
}

/** Message de repli quand la cause n'a pas de formulation utilisateur dédiée. */
export const MESSAGE_ECHEC_GENERIQUE = 'Le transcodage de la vidéo a échoué.';

/**
 * Garantit qu'AUCUNE erreur brute ne franchit la frontière du worker.
 *
 * Une `TranscodeError` passe telle quelle ; toute autre erreur (réseau, SDK, bug) est
 * enveloppée dans le message générique, sa cause réelle conservée dans `detail`. C'est le
 * point de passage unique qui rend la garantie vérifiable, plutôt que de compter sur
 * chaque appelant pour penser à nettoyer ses messages.
 */
export function toTranscodeError(err: unknown): TranscodeError {
  if (err instanceof TranscodeError) {
    return err;
  }
  const cause = err instanceof Error ? err.message : String(err);
  return new TranscodeError(MESSAGE_ECHEC_GENERIQUE, cause);
}
