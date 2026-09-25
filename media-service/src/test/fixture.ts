import { execFile, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Fixtures vidéo GÉNÉRÉES, jamais versionnées (SH-16b, décision actée en brainstorming).
 *
 * Commiter un binaire vidéo alourdit le dépôt à chaque modification et ne dit rien de son
 * contenu en revue. `ffmpeg` sait fabriquer une mire déterministe en deux secondes : la
 * fixture devient reproductible, et surtout LISIBLE dans le code qui la produit.
 */

/**
 * ffmpeg et ffprobe sont-ils réellement disponibles ?
 *
 * On INTERROGE le binaire au lieu de lire une variable d'environnement : une variable
 * supposerait sa présence par défaut, et les tests ÉCHOUERAIENT sur un poste sans ffmpeg
 * au lieu de se sauter proprement. Le conteneur l'a toujours (Dockerfile), la CI l'installe
 * (media-ci.yml), un poste de développement pas nécessairement.
 */
export function hasFfmpeg(): boolean {
  for (const binaire of ['ffmpeg', 'ffprobe']) {
    const essai = spawnSync(binaire, ['-version'], { stdio: 'ignore' });
    if (essai.error !== undefined || essai.status !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Garde explicite, calquée sur `process.env.REDIS_URL ? describe : describe.skip`
 * (`backend-core/src/auth/token-store.integration.spec.ts`).
 *
 * Les tests exigeant un binaire se GARDENT — mais la CI, elle, installe ffmpeg : c'est
 * ce qui empêche cette garde de devenir une façon de ne jamais rien prouver.
 */
export const describeIfFfmpeg: jest.Describe = hasFfmpeg() ? describe : describe.skip;

/**
 * Fabrique une vidéo de test de 2 s, 640x360, 25 fps.
 *
 * `spherical: true` ajoute les métadonnées de projection équirectangulaire pour exercer
 * la détection 360° de `probe.ts` (décision D5 : aucune projection serveur, le rendu
 * WebGL reste côté front).
 */
export async function makeFixture(
  dir: string,
  options: { spherical?: boolean } = {},
): Promise<string> {
  // ⚠️ Conteneur MATROSKA pour la variante 360°, et c'est un constat, pas un choix :
  // le muxer mp4 de ffmpeg JETTE les tags de projection passés en `-metadata` (vérifié
  // sur ffmpeg 9.0.2 — `format.tags` ne contient plus que les marques `isom`). Un vrai
  // mp4 360° porte cette information dans les boîtes `st3d`/`sv3d`, que ffmpeg restitue
  // en `side_data_list`, mais qu'il ne sait pas fabriquer depuis une source de synthèse.
  // Matroska conserve les tags arbitraires, ce qui donne une fixture 360° RÉELLE.
  // La forme `side_data_list` des vrais mp4, elle, est couverte par les tests unitaires
  // de `detectSpherical` (probe.spec.ts).
  const chemin = join(dir, options.spherical ? 'fixture-360.mkv' : 'fixture.mp4');

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=640x360:rate=25:duration=2',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
  ];

  if (options.spherical) {
    // Tags posés à la fois au niveau du CONTENEUR et du FLUX : Matroska restitue le
    // premier dans `format.tags` et le second dans `streams[].tags`, tous deux en
    // MAJUSCULES. La détection normalise la casse, précisément pour cette raison.
    args.push(
      '-metadata',
      'projection=equirectangular',
      '-metadata:s:v:0',
      'spherical-video=1',
    );
  }

  args.push(chemin);

  await execFileAsync('ffmpeg', args);
  return chemin;
}
