import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TranscodeError } from './errors';

const execFileAsync = promisify(execFile);

/** Message UTILISATEUR d'une vidéo que ffprobe ne sait pas lire. Aucun détail interne. */
const MESSAGE_ILLISIBLE = "Fichier illisible : ce n'est pas une vidéo exploitable.";

/** Sortie utile du sondage. Tout le reste de `ffprobe` est ignoré volontairement. */
export interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
  /** Projection équirectangulaire détectée (décision D5 : le rendu reste côté front). */
  spherical: boolean;
}

/** Sous-ensemble typé de la sortie JSON de ffprobe. Le reste n'est pas décrit. */
export interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: Record<string, string>;
  side_data_list?: { side_data_type?: string; projection?: string }[];
}

export interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; tags?: Record<string, string> };
}

/** Marqueurs de projection, en minuscules — comparés sur les clés ET les valeurs. */
const MARQUEURS_360 = ['spherical', 'equirectangular'];

function contientMarqueur360(tags: Record<string, string> | undefined): boolean {
  if (!tags) {
    return false;
  }
  return Object.entries(tags).some(([cle, valeur]) => {
    const texte = `${cle} ${valeur}`.toLowerCase();
    return MARQUEURS_360.some((marqueur) => texte.includes(marqueur));
  });
}

/**
 * Détecte une projection 360° dans une sortie ffprobe. Fonction PURE et exportée.
 *
 * Séparée de `probeVideo` parce que les vidéos 360° réelles se présentent sous DEUX
 * formes que le poste de développement ne peut pas toutes deux fabriquer :
 *
 *  1. **`side_data_list` avec `Spherical Mapping`** — ce que ffprobe restitue d'un vrai
 *     mp4/mov 360° portant les boîtes `st3d`/`sv3d` (standard Google Spatial Media).
 *     C'est la forme du terrain, et ffmpeg ne sait pas la SYNTHÉTISER : elle se teste
 *     donc ici, sur une charge réaliste, plutôt que pas du tout.
 *  2. **tags de conteneur ou de flux** — `projection=equirectangular`,
 *     `spherical-video=1`. Forme couverte de bout en bout par la fixture Matroska.
 *
 * La comparaison normalise la casse : Matroska restitue ses tags en MAJUSCULES.
 */
export function detectSpherical(sortie: FfprobeOutput): boolean {
  const video = sortie.streams?.find((flux) => flux.codec_type === 'video');

  if (contientMarqueur360(video?.tags) || contientMarqueur360(sortie.format?.tags)) {
    return true;
  }

  return (video?.side_data_list ?? []).some((donnee) => {
    const texte = `${donnee.side_data_type ?? ''} ${donnee.projection ?? ''}`.toLowerCase();
    return MARQUEURS_360.some((marqueur) => texte.includes(marqueur));
  });
}

/**
 * Sonde une vidéo locale.
 *
 * On sonde le FICHIER TÉLÉCHARGÉ et non une URL : le 4K supporte mal les aléas réseau
 * en cours de `seek` (conception EP04 §7).
 *
 * `ffprobe` sort en code non nul sur un fichier illisible. C'est un échec de transcodage
 * légitime, que BullMQ retentera avant de basculer le média en `FAILED` — mais l'erreur
 * brute n'est PAS relayée : elle porte la ligne de commande et le chemin interne du
 * conteneur, et finirait affichée dans le portfolio (cf. `errors.ts`).
 */
export async function probeVideo(filePath: string): Promise<ProbeResult> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('ffprobe', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]));
  } catch (err) {
    throw new TranscodeError(MESSAGE_ILLISIBLE, (err as Error).message);
  }

  let sortie: FfprobeOutput;
  try {
    sortie = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new TranscodeError(MESSAGE_ILLISIBLE, 'Sortie ffprobe non analysable en JSON.');
  }

  const video = sortie.streams?.find((flux) => flux.codec_type === 'video');
  if (!video || !video.width || !video.height) {
    throw new TranscodeError(
      'Fichier sans piste vidéo exploitable.',
      'Aucun flux vidéo, ou dimensions absentes du sondage ffprobe.',
    );
  }

  // La durée du CONTENEUR fait foi quand elle existe : celle du flux manque sur certains
  // encodages, et une durée nulle ou absente ferait rejeter le résultat par le monolithe
  // (`estNombrePositif`). Mieux vaut échouer ici, avec un message, que là-bas.
  const duree = Number(sortie.format?.duration ?? video.duration ?? Number.NaN);
  if (!Number.isFinite(duree) || duree <= 0) {
    throw new TranscodeError(
      'Durée de la vidéo introuvable.',
      `Durée absente ou nulle au sondage ffprobe (valeur lue : ${String(duree)}).`,
    );
  }

  return {
    durationSeconds: duree,
    width: video.width,
    height: video.height,
    spherical: detectSpherical(sortie),
  };
}
