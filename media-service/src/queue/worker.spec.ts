import type { Job } from 'bullmq';
import { processTranscodeJob, type TranscodeJobData } from './worker';

// C2.2.2 — Le traitement est une fonction pure testable SANS Redis ni ffmpeg.
// C'est ce découpage qui permettra à SH-16 de tester le vrai transcodage isolément.
describe('processTranscodeJob (SH-15 : no-op)', () => {
  const job = {
    id: '42',
    data: {
      mediaId: '11111111-1111-1111-1111-111111111111',
      sourceKey: 'private/media/f1/m1/master.mp4',
      outputPrefix: 'private/media/f1/m1/hls/',
      posterKey: 'private/media/f1/m1/poster.jpg',
    } satisfies TranscodeJobData,
  } as Job<TranscodeJobData>;

  it('rend une enveloppe de résultat vide, que SH-16 remplira', async () => {
    const result = await processTranscodeJob(job);

    expect(result).toEqual({ renditions: [] });
  });
});
