import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { useCreateMedia } from './useCreateMedia';
import { useCompleteMedia } from './useCompleteMedia';
import { uploadToStorage } from './uploadToStorage';
import type { CreateMediaInput } from './types';

type Etape = 'saisie' | 'declaration' | 'depot' | 'confirmation';

// Types de fichier acceptés au dépôt (C2.2.3). `satisfies` vérifie que la liste reste un
// sous-ensemble du contrat backend (`CreateMediaDto.contentType`) sans perdre le type
// littéral de chaque valeur — un type ajouté/retiré côté backend qui invaliderait cette
// liste casse la compilation ici plutôt que de laisser un cast faire taire l'erreur.
const TYPES_ACCEPTES = [
  'video/mp4',
  'video/quicktime',
] as const satisfies readonly CreateMediaInput['contentType'][];

// Garde de type (C2.2.3) : `accept="video/mp4,video/quicktime"` sur l'<input> n'est
// qu'une suggestion — le sélecteur propose « tous les fichiers » et le glisser-déposer
// l'ignore. Sans cette vérification, un fichier non supporté partirait vers l'API, que le
// backend rejette (`@IsIn`), pour un aller-retour voué à l'échec.
function estTypeAccepte(type: string): type is CreateMediaInput['contentType'] {
  return (TYPES_ACCEPTES as readonly string[]).includes(type);
}

/**
 * Message du backend pour un 400/409 (ValidationPipe ou quota, cf. MediaService) : déjà en
 * français et compréhensible, on l'affiche tel quel plutôt qu'un générique — surtout pour le
 * 409 quota, où « réessaie » est la pire réponse possible (chaque réessai crée un `DRAFT`
 * de plus, qui compte lui-même dans le quota). Le reste (5xx, réseau) reste générique : ces
 * réponses n'ont pas de message utilisateur fiable à afficher tel quel.
 */
function messageBackend(error: unknown): string | null {
  if (!isAxiosError<{ message?: string | string[] }>(error)) return null;
  const status = error.response?.status;
  if (status !== 400 && status !== 409) return null;
  const message = error.response?.data?.message;
  if (!message) return null;
  return [message].flat().join(' ');
}

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
    if (!estTypeAccepte(file.type)) {
      setErreur('Format non supporté : choisis une vidéo MP4 ou QuickTime.');
      return;
    }
    const contentType = file.type;
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
        contentType,
        sizeBytes: file.size,
      });

      etapeCourante = 'depot';
      setEtape('depot');
      setPercent(0);
      await uploadToStorage({
        url: upload.url,
        file,
        method: upload.method,
        headers: upload.headers,
        onProgress: setPercent,
      });

      etapeCourante = 'confirmation';
      setEtape('confirmation');
      await completeMedia.mutateAsync({ id: media.id });
      navigate('/portfolio');
    } catch (error) {
      setErreur(
        messageBackend(error) ??
          (etapeCourante === 'depot'
            ? "L'envoi a échoué. Réessaie : rien n'a été publié."
            : 'La publication a échoué. Réessaie dans un instant.'),
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
          // Seul le dépôt a une progression connue (en octets) : `declaration` et
          // `confirmation` restent indéterminées pour les technologies d'assistance —
          // annoncer 100 % pendant ces phases ferait croire que l'opération est terminée.
          aria-valuenow={etape === 'depot' ? percent : undefined}
          aria-valuetext={
            etape === 'depot'
              ? `Envoi — ${percent} %`
              : etape === 'declaration'
                ? 'Déclaration en cours…'
                : 'Confirmation en cours…'
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
