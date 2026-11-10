import { mkdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { MediaStorage } from '../storage/s3';
import type { TranscodeJobData } from '../queue/worker';
import { selectLadder } from './ladder';
import { probeVideo } from './probe';
import { encodeRendition, extractPoster } from './encode';

/**
 * Résultat rendu à BullMQ, dans la forme EXACTE attendue par `backend-core`
 * (`parseTranscodeResult`, media.service.ts). Toute divergence fait rejeter le média
 * entier — un test de frontière la détecte côté monolithe (SH-16b, tâche 8).
 */
export interface TranscodeOutcome {
  durationSeconds: number;
  width: number;
  height: number;
  type: 'VIDEO' | 'VIDEO_360';
  mimeType: string;
  renditions: {
    name: string;
    width: number;
    height: number;
    bandwidth: number;
    playlistKey: string;
  }[];
}

export interface PipelineDeps {
  storage: MediaStorage;
  tmpDir: string;
  /** Progression globale du job, en pourcentage (0–100). */
  onProgress?: (percent: number) => void;
}

/**
 * Type MIME déduit de l'EXTENSION DU MASTER, et d'une table FERMÉE.
 *
 * Le monolithe n'accepte que `video/mp4` ou `video/quicktime`
 * (`ALLOWED_MEDIA_MIME_TYPES`) : toute autre valeur ferait rejeter le résultat entier.
 * La clé source est construite par backend-core depuis un `contentType` déjà validé,
 * donc l'extension est fiable — mais on refuse explicitement l'inconnu plutôt que de
 * deviner, pour que l'échec soit lisible ici et non trois étapes plus loin.
 */
const MIME_PAR_EXTENSION: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

function mimeTypeDuMaster(sourceKey: string): string {
  const mime = MIME_PAR_EXTENSION[extname(sourceKey).toLowerCase()];
  if (!mime) {
    throw new Error(`Extension de master non supportée : ${sourceKey}`);
  }
  return mime;
}

/** Part de progression réservée au téléchargement et au sondage. */
const PART_PREPARATION = 10;
/** Part réservée à l'encodage, répartie entre les pistes. */
const PART_ENCODAGE = 80;

/**
 * Déroulé complet d'un job de transcodage (conception EP04 §7).
 *
 * Téléchargement du master dans un temporaire PROPRE À CE JOB → `ffprobe` → échelle ABR
 * → encodage piste par piste → poster → dépôt des sorties → nettoyage.
 *
 * Deux partis pris structurants :
 *
 *  1. **Un répertoire par job**, nommé d'après le `mediaId`. Avec
 *     `MEDIA_WORKER_CONCURRENCY > 1`, plusieurs jobs tournent ensemble : un répertoire
 *     partagé les ferait se piétiner, et le nettoyage de l'un détruirait le travail de
 *     l'autre.
 *  2. **Le nettoyage est dans un `finally`.** Un job qui échoue laisse sinon derrière lui
 *     le master ET les sorties partielles ; le disque du worker se remplit en quelques
 *     jobs ratés, et l'incident se manifeste alors très loin de sa cause.
 */
export async function runPipeline(
  deps: PipelineDeps,
  job: TranscodeJobData,
): Promise<TranscodeOutcome> {
  // Le type MIME est résolu AVANT tout travail : inutile de télécharger 500 Mo pour
  // découvrir ensuite que l'extension n'est pas exploitable.
  const mimeType = mimeTypeDuMaster(job.sourceKey);

  const travail = join(deps.tmpDir, job.mediaId);
  const masterPath = join(travail, `master${extname(job.sourceKey)}`);
  const sortie = join(travail, 'out');

  try {
    await mkdir(sortie, { recursive: true });

    await deps.storage.download(job.sourceKey, masterPath);
    deps.onProgress?.(5);

    const sonde = await probeVideo(masterPath);
    const ladder = selectLadder(sonde.width, sonde.height);
    deps.onProgress?.(PART_PREPARATION);

    const partParPiste = PART_ENCODAGE / ladder.length;
    const renditions: TranscodeOutcome['renditions'] = [];
    // La progression ne doit JAMAIS reculer : ffmpeg peut rapporter une position qui
    // dépasse brièvement la durée sondée, et une barre qui revient en arrière passe pour
    // un bug du produit alors que c'est une erreur d'arithmétique ici.
    let dernierPourcentage = PART_PREPARATION;

    for (const [index, piste] of ladder.entries()) {
      const debut = PART_PREPARATION + index * partParPiste;

      await encodeRendition(masterPath, sortie, piste, (secondes) => {
        const fraction = Math.min(1, secondes / sonde.durationSeconds);
        const pourcentage = Math.round(debut + fraction * partParPiste);
        if (pourcentage > dernierPourcentage) {
          dernierPourcentage = pourcentage;
          deps.onProgress?.(pourcentage);
        }
      });

      renditions.push({
        ...piste,
        // Clé DÉRIVÉE de l'`outputPrefix` reçu dans le job, jamais recomposée depuis
        // autre chose : c'est ce qui garantit le confinement exigé par le validateur du
        // monolithe. Une clé hors préfixe serait signée par SH-17 et ouvrirait un accès
        // au stockage d'un AUTRE freelance (C2.2.3).
        playlistKey: `${job.outputPrefix}${piste.name}.m3u8`,
      });
    }

    const posterPath = join(travail, 'poster.jpg');
    await extractPoster(masterPath, posterPath, sonde.durationSeconds);

    // Le poster d'abord : il porte sa propre clé, hors de l'arborescence HLS.
    await deps.storage.uploadFile(posterPath, job.posterKey);
    await deps.storage.uploadTree(sortie, job.outputPrefix);
    deps.onProgress?.(100);

    return {
      durationSeconds: sonde.durationSeconds,
      width: sonde.width,
      height: sonde.height,
      type: sonde.spherical ? 'VIDEO_360' : 'VIDEO',
      mimeType,
      renditions,
    };
  } finally {
    await rm(travail, { recursive: true, force: true });
  }
}
