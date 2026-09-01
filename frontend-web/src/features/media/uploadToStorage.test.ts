import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { uploadToStorage } from './uploadToStorage';

const STORAGE_URL = 'http://localhost:4566/skillhunt-media/private/media/f1/m1/master.mp4';

describe('uploadToStorage', () => {
  it("n'envoie AUCUN en-tête Authorization vers le stockage", async () => {
    let authorization: string | null = 'jamais lu';
    server.use(
      http.put(STORAGE_URL, ({ request }) => {
        authorization = request.headers.get('authorization');
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await uploadToStorage({
      url: STORAGE_URL,
      file: new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
      contentType: 'video/mp4',
      onProgress: () => {},
    });

    // Un bearer envoyé ici invaliderait la signature SigV4 ET fuiterait le jeton de
    // l'utilisateur vers un tiers. C'est la régression la plus grave que ce lot puisse
    // introduire, et la plus facile à commettre en réutilisant `apiClient` par réflexe.
    expect(authorization).toBeNull();
  });

  it('envoie le Content-Type signé, sans lequel S3 refuse le dépôt', async () => {
    let contentType: string | null = null;
    server.use(
      http.put(STORAGE_URL, ({ request }) => {
        contentType = request.headers.get('content-type');
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await uploadToStorage({
      url: STORAGE_URL,
      file: new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
      contentType: 'video/mp4',
      onProgress: () => {},
    });

    expect(contentType).toContain('video/mp4');
  });

  it("propage l'échec du dépôt à l'appelant", async () => {
    server.use(http.put(STORAGE_URL, () => new HttpResponse(null, { status: 403 })));

    await expect(
      uploadToStorage({
        url: STORAGE_URL,
        file: new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
        contentType: 'video/mp4',
        onProgress: () => {},
      }),
    ).rejects.toThrow();
  });
});
