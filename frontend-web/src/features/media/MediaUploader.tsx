import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCreateMedia } from './useCreateMedia';
import { useCompleteMedia } from './useCompleteMedia';
import { uploadToStorage } from './uploadToStorage';
import type { CreateMediaInput } from './types';

type Etape = 'saisie' | 'declaration' | 'depot' | 'confirmation';

const inputClass =
  'border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white ' +
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';

/**
 * Dépôt d'une vidéo en trois temps, qui reflètent exactement les trois appels réels :
 * déclaration, envoi DIRECT vers le stockage, puis confirmation.
 *
 * L'envoi ne transite pas par l'API — c'est ce qui permet d'afficher une progression en
 * octets réels, et ce qui évite au monolithe d'encaisser des centaines de mégaoctets.
 *
 * En cas d'échec à l'envoi, on ne confirme SURTOUT pas : le média resterait `DRAFT` et le
 * balayage serveur le purgera au-delà de 24 h. Confirmer un dépôt raté ferait entrer dans
 * le portfolio un média sans fichier.
 */
export function MediaUploader() {
  const navigate = useNavigate();
  const createMedia = useCreateMedia();
  const completeMedia = useCompleteMedia();

  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [etape, setEtape] = useState<Etape>('saisie');
  const [percent, setPercent] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErreur(null);

    // Validation client : évite un aller-retour voué à l'échec. Le backend reste juge.
    if (title.trim() === '') {
      setTitleError('Le titre est obligatoire.');
      return;
    }
    if (file === null) {
      setErreur('Choisis un fichier vidéo.');
      return;
    }
    setTitleError(null);

    // Étape suivie dans une variable LOCALE et non via `etape` : la valeur d'état lue dans
    // ce gestionnaire vient de la fermeture du rendu courant, donc `setEtape` ne la met pas
    // à jour ici. S'appuyer dessus dans le `catch` afficherait toujours le mauvais message.
    let etapeCourante: Etape = 'declaration';

    try {
      etapeCourante = 'declaration';
      setEtape('declaration');
      const { media, upload } = await createMedia.mutateAsync({
        title: title.trim(),
        // Le champ <input type="file"> restreint déjà le choix via `accept` (mp4/mov) ; le
        // backend revalide de toute façon le type réel de l'objet à la confirmation.
        contentType: file.type as CreateMediaInput['contentType'],
        sizeBytes: file.size,
      });

      etapeCourante = 'depot';
      setEtape('depot');
      setPercent(0);
      await uploadToStorage({
        url: upload.url,
        file,
        contentType: upload.headers['Content-Type'],
        onProgress: setPercent,
      });

      etapeCourante = 'confirmation';
      setEtape('confirmation');
      await completeMedia.mutateAsync({ id: media.id });
      navigate('/portfolio');
    } catch {
      setErreur(
        etapeCourante === 'depot'
          ? "L'envoi a échoué. Réessaie : rien n'a été publié."
          : "La publication a échoué. Réessaie dans un instant.",
      );
      setEtape('saisie');
    }
  }

  const enCours = etape !== 'saisie';

  return (
    <form className="flex max-w-lg flex-col gap-4" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm text-white" htmlFor="media-title">
        Titre
      </label>
      <input
        className={inputClass}
        id="media-title"
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />
      {titleError !== null && <span className="text-hud-rejected text-sm">{titleError}</span>}

      <label className="flex flex-col gap-1 text-sm text-white" htmlFor="media-file">
        Fichier
      </label>
      <input
        accept="video/mp4,video/quicktime"
        className={inputClass}
        id="media-file"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        type="file"
      />

      {enCours && (
        <div
          aria-label="Progression du dépôt"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={etape === 'depot' ? percent : 100}
          aria-valuetext={
            etape === 'depot' ? `Envoi — ${percent} %` : 'Déclaration et confirmation'
          }
          className="bg-hud-pill h-2 w-full overflow-hidden rounded"
          role="progressbar"
        >
          <span
            className="bg-hud-positive block h-full"
            style={{ width: `${etape === 'depot' ? percent : 100}%` }}
          />
        </div>
      )}

      {erreur !== null && (
        <span className="text-hud-rejected text-sm" role="alert">
          {erreur}
        </span>
      )}

      <Button disabled={enCours} type="submit">
        {enCours ? 'Publication en cours…' : 'Publier la vidéo'}
      </Button>
    </form>
  );
}
