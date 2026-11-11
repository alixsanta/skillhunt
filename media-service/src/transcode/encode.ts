import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { RenditionSpec } from './ladder';
import { MESSAGE_ECHEC_GENERIQUE, TranscodeError } from './errors';

/** Durée cible d'un segment HLS, en secondes. 4 s est l'usage courant en VOD. */
const HLS_SEGMENT_SECONDS = 4;

/** Nombre de lignes de `stderr` conservées dans le DÉTAIL de l'erreur. */
const LIGNES_ERREUR_CONSERVEES = 3;

/**
 * Lance ffmpeg et rejette si le processus sort en erreur.
 *
 * `spawn` et non `execFile` : l'encodage écrit sa progression EN CONTINU, et un buffer
 * de sortie unique la rendrait inexploitable. `onLine` reçoit chaque ligne de `stdout`.
 */
function runFfmpeg(args: string[], onLine?: (ligne: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const processus = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let reste = '';
    processus.stdout.on('data', (morceau: Buffer) => {
      if (!onLine) {
        return;
      }
      // Découpage en lignes AVEC report du reliquat : un `chunk` peut couper une ligne
      // en deux, et la traiter telle quelle ferait perdre silencieusement des mesures.
      reste += morceau.toString();
      const lignes = reste.split('\n');
      reste = lignes.pop() ?? '';
      for (const ligne of lignes) {
        onLine(ligne.trim());
      }
    });

    // La sortie d'erreur est CONSERVÉE : sans elle, un échec d'encodage se résume à
    // « exit 1 », inexploitable en supervision comme en recette. Elle part dans le
    // `detail` de l'erreur — donc dans les JOURNAUX — et jamais dans son message, qui
    // finit affiché à l'utilisateur (cf. `errors.ts`).
    let erreurs = '';
    processus.stderr.on('data', (morceau: Buffer) => {
      erreurs += morceau.toString();
    });

    processus.on('error', (err) => {
      reject(
        new TranscodeError(MESSAGE_ECHEC_GENERIQUE, `ffmpeg n'a pas pu démarrer : ${err.message}`),
      );
    });
    processus.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const extrait = erreurs.trim().split('\n').slice(-LIGNES_ERREUR_CONSERVEES).join(' | ');
      reject(
        new TranscodeError(MESSAGE_ECHEC_GENERIQUE, `ffmpeg a échoué (code ${code}) : ${extrait}`),
      );
    });
  });
}

/**
 * Encode UNE piste en HLS.
 *
 * Arborescence produite, alignée sur la conception EP04 §5.4 :
 *
 *     <outDir>/<name>.m3u8
 *     <outDir>/<name>/seg-00000.ts …
 *
 * `-hls_base_url <name>/` est ce qui garde les lignes de segment RELATIVES dans la
 * playlist. Sans lui, ffmpeg y écrit le chemin qu'on lui a donné — donc un chemin absolu
 * du conteneur, que SH-17 ne saurait pas réécrire en URL signée et qui fuiterait
 * l'arborescence interne du worker.
 *
 * @returns le chemin local de la playlist écrite.
 */
export async function encodeRendition(
  sourcePath: string,
  outDir: string,
  rendition: RenditionSpec,
  onProgress?: (seconds: number) => void,
): Promise<string> {
  await mkdir(join(outDir, rendition.name), { recursive: true });

  const playlistPath = join(outDir, `${rendition.name}.m3u8`);

  await runFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      sourcePath,
      // `-progress pipe:1` : progression lisible par machine sur stdout, plutôt que de
      // gratter la barre d'avancement destinée à l'humain sur stderr.
      '-progress',
      'pipe:1',
      '-vf',
      `scale=${rendition.width}:${rendition.height}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      String(rendition.bandwidth),
      // Images-clés FORCÉES à instants fixes, multiples de la durée de segment. Sans
      // elles, le muxer HLS ne peut couper qu'aux images-clés que l'encodeur choisit
      // seul — une toutes les 250 images par défaut, soit 10 s à 25 i/s — et `-hls_time`
      // reste lettre morte. Surtout, ces instants ne dépendent PAS de la définition :
      // le segment N couvre donc le même intervalle dans toutes les pistes, condition
      // de la bascule de qualité côté lecteur. Défaut relevé en recette de bout en bout.
      '-force_key_frames',
      `expr:gte(t,n_forced*${HLS_SEGMENT_SECONDS})`,
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-f',
      'hls',
      '-hls_time',
      String(HLS_SEGMENT_SECONDS),
      '-hls_playlist_type',
      'vod',
      '-hls_base_url',
      `${rendition.name}/`,
      '-hls_segment_filename',
      join(outDir, rendition.name, 'seg-%05d.ts'),
      playlistPath,
    ],
    (ligne) => {
      if (!onProgress) {
        return;
      }
      // Format de `-progress` : une paire `cle=valeur` par ligne. `out_time_us` donne
      // la position encodée en microsecondes.
      const correspondance = /^out_time_us=(\d+)$/.exec(ligne);
      if (correspondance) {
        onProgress(Number(correspondance[1]) / 1_000_000);
      }
    },
  );

  return playlistPath;
}

/**
 * Extrait le poster.
 *
 * `-ss 1` (conception §7) SAUF si la vidéo est plus courte : ffmpeg sortirait alors en
 * SUCCÈS avec un fichier vide, et le portfolio afficherait une vignette cassée sans
 * qu'aucune erreur ne soit remontée. Sous une seconde, on prend la première image.
 */
export async function extractPoster(
  sourcePath: string,
  outPath: string,
  durationSeconds: number,
): Promise<void> {
  const instant = durationSeconds > 1 ? '1' : '0';

  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    instant,
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    outPath,
  ]);
}
