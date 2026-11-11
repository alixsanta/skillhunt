import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { backendMessage } from './backend-message';
import { useDeleteMedia } from './useDeleteMedia';

/**
 * Suppression d'une vidéo du portfolio, en DEUX temps (SH-54).
 *
 * La suppression est irréversible — la ligne et tous les fichiers disparaissent — donc le
 * premier clic ne fait que demander confirmation. La confirmation se fait dans la carte
 * elle-même plutôt que dans une fenêtre modale : le projet n'a pas de composant de
 * dialogue, et en ajouter un pour un seul usage serait une dépendance de trop.
 *
 * Le focus suit l'utilisateur au clavier : il arrive sur « Annuler » (le choix sûr) à
 * l'ouverture, et revient sur le bouton d'origine si l'on annule. Sans cela, il serait
 * perdu à chaque démontage et la navigation repartirait du haut de la page.
 */
export function MediaDeleteControl({ mediaId, title }: { mediaId: string; title: string }) {
  const deleteMedia = useDeleteMedia();
  const [confirming, setConfirming] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Ne rendre le focus au déclencheur qu'APRÈS une annulation : au premier rendu, le
  // prendre d'autorité volerait le focus à ce que l'utilisateur faisait sur la page.
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [confirming]);

  function cancel() {
    restoreFocus.current = true;
    setErreur(null);
    setConfirming(false);
  }

  async function confirm() {
    setErreur(null);
    try {
      await deleteMedia.mutateAsync({ id: mediaId });
      // Succès : le portfolio est invalidé, cette carte va disparaître avec son média.
    } catch (error) {
      // 409 (transcodage en cours) et 503 (file indisponible) portent un message backend
      // qui explique POURQUOI ce n'est pas possible maintenant : on l'affiche tel quel.
      setErreur(
        backendMessage(error, [409, 503]) ?? 'La suppression a échoué. Réessaie dans un instant.',
      );
    }
  }

  if (!confirming) {
    return (
      <Button
        ref={triggerRef}
        aria-label={`Supprimer « ${title} »`}
        className="self-start"
        onClick={() => setConfirming(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        Supprimer
      </Button>
    );
  }

  return (
    <div className="border-hud-border flex flex-col gap-2 border-t pt-3">
      <p className="text-sm text-white">Supprimer définitivement cette vidéo ?</p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={deleteMedia.isPending}
          onClick={confirm}
          size="sm"
          type="button"
          variant="destructive"
        >
          Confirmer la suppression
        </Button>
        <Button
          ref={cancelRef}
          disabled={deleteMedia.isPending}
          onClick={cancel}
          size="sm"
          type="button"
          variant="outline"
        >
          Annuler
        </Button>
      </div>
      {erreur !== null && (
        <span className="text-hud-rejected text-sm" role="alert">
          {erreur}
        </span>
      )}
    </div>
  );
}
