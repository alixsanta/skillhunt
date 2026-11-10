import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describeIfFfmpeg, makeFixture } from '../test/fixture';
import { runPipeline, type TranscodeOutcome } from './pipeline';
import type { MediaStorage } from '../storage/s3';

/**
 * Test de FRONTIÈRE — SH-16b.
 *
 * Le worker et `backend-core` portent chacun leur définition du résultat de transcodage,
 * et le monorepo n'a pas de paquet partagé où la factoriser. Rien ne les confrontait :
 * une dérive de l'un des deux ne se serait manifestée qu'en recette, sur un média bloqué
 * en `PROCESSING` sans message exploitable.
 *
 * Les tests du monolithe (`media.listener.spec.ts`) valident ses règles sur des résultats
 * ÉCRITS À LA MAIN. Ce fichier fait l'inverse, et c'est là qu'était le trou : il prend la
 * sortie RÉELLE de `runPipeline`, produite par un vrai ffmpeg, et vérifie qu'elle
 * satisfait chaque règle du validateur.
 *
 * ⚠️ **Les règles ci-dessous sont une RÉPLIQUE** de `parseTranscodeResult` /
 * `estRenditionValide` (`backend-core/src/media/media.service.ts`). Une réplique peut
 * dériver : c'est une limite assumée, faute de module partagé. Les deux fichiers portent
 * un renvoi mutuel, et **toute modification de l'un impose de relire l'autre**.
 */

const MIMES_AUTORISES = ['video/mp4', 'video/quicktime'];
const NOM_MAX = 32;

function estEntierPositif(valeur: unknown): boolean {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur > 0;
}

/** Applique à `resultat` les règles exactes du validateur du monolithe. */
function verifieContrat(resultat: TranscodeOutcome, prefixeAttendu: string): void {
  expect(typeof resultat.durationSeconds).toBe('number');
  expect(Number.isFinite(resultat.durationSeconds)).toBe(true);
  expect(resultat.durationSeconds).toBeGreaterThan(0);

  expect(estEntierPositif(resultat.width)).toBe(true);
  expect(estEntierPositif(resultat.height)).toBe(true);

  expect(['VIDEO', 'VIDEO_360']).toContain(resultat.type);
  expect(MIMES_AUTORISES).toContain(resultat.mimeType);

  expect(Array.isArray(resultat.renditions)).toBe(true);
  // NON VIDE : le validateur l'exige explicitement depuis SH-16b, parce que `every`
  // rend `true` sur un tableau vide et laissait donc passer un média injouable.
  expect(resultat.renditions.length).toBeGreaterThan(0);

  for (const piste of resultat.renditions) {
    expect(typeof piste.name).toBe('string');
    expect(piste.name.length).toBeGreaterThan(0);
    expect(piste.name.length).toBeLessThanOrEqual(NOM_MAX);

    expect(estEntierPositif(piste.width)).toBe(true);
    expect(estEntierPositif(piste.height)).toBe(true);
    expect(estEntierPositif(piste.bandwidth)).toBe(true);

    expect(typeof piste.playlistKey).toBe('string');
    expect(piste.playlistKey.startsWith(prefixeAttendu)).toBe(true);
  }
}

/** Stockage simulé : sert la fixture, ignore les dépôts. */
function fakeStorage(fixturePath: string): MediaStorage {
  return {
    async download(_key, destPath) {
      await mkdir(dirname(destPath), { recursive: true });
      await copyFile(fixturePath, destPath);
    },
    async uploadTree() {},
    async uploadFile() {},
  };
}

describeIfFfmpeg('Contrat de transcodage — sortie réelle du worker (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-contrat-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // Le préfixe du MÉDIA, pas celui de sortie : c'est sur lui que porte le confinement
  // côté monolithe (`buildMediaPrefix`), et `outputPrefix` en est un sous-chemin.
  const PREFIXE_MEDIA = 'private/media/f-1/m-1/';
  const JOB = {
    mediaId: '11111111-1111-1111-1111-111111111111',
    sourceKey: `${PREFIXE_MEDIA}master.mp4`,
    outputPrefix: `${PREFIXE_MEDIA}hls/`,
    posterKey: `${PREFIXE_MEDIA}poster.jpg`,
  };

  it('satisfait chaque règle du validateur du monolithe, sur une vidéo plate', async () => {
    const fixture = await makeFixture(dir);

    const resultat = await runPipeline(
      { storage: fakeStorage(fixture), tmpDir: join(dir, 'work') },
      JOB,
    );

    verifieContrat(resultat, PREFIXE_MEDIA);
  }, 180_000);

  it('satisfait le contrat sur une vidéo 360°, avec le type VIDEO_360', async () => {
    const fixture = await makeFixture(dir, { spherical: true });

    const resultat = await runPipeline(
      { storage: fakeStorage(fixture), tmpDir: join(dir, 'work') },
      // La fixture 360° est en Matroska (cf. fixture.ts), mais le `sourceKey` reste en
      // `.mp4` : c'est lui qui détermine le mimeType rendu, et le monolithe n'accepte
      // que mp4 ou quicktime. Un `.mkv` ne peut pas arriver en production — la route de
      // déclaration le refuse (`@IsIn` sur `contentType`).
      JOB,
    );

    verifieContrat(resultat, PREFIXE_MEDIA);
    expect(resultat.type).toBe('VIDEO_360');
  }, 180_000);
});
