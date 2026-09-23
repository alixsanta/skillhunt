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
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
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
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      onProgress: () => {},
    });

    expect(contentType).toContain('video/mp4');
  });

  it('transmet tout `upload.headers`, pas seulement Content-Type (SH-16a : x-amz-checksum-crc32)', async () => {
    // Le jour où le backend signe un second en-tête, ne transmettre que Content-Type fait
    // échouer le dépôt en 403 côté stockage — un symptôme qui ressemble à un problème de
    // credentials plutôt qu'à ce bug côté client. C'est déjà arrivé une fois en recette SH-16a.
    let checksum: string | null = null;
    server.use(
      http.put(STORAGE_URL, ({ request }) => {
        checksum = request.headers.get('x-amz-checksum-crc32');
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await uploadToStorage({
      url: STORAGE_URL,
      file: new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'x-amz-checksum-crc32': 'AAAAAA==' },
      onProgress: () => {},
    });

    expect(checksum).toBe('AAAAAA==');
  });

  it('utilise le verbe fourni par `upload.method` plutôt qu’un PUT figé', async () => {
    let received = '';
    server.use(
      http.post(STORAGE_URL, ({ request }) => {
        received = request.method;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await uploadToStorage({
      url: STORAGE_URL,
      file: new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4' },
      onProgress: () => {},
    });

    expect(received).toBe('POST');
  });

  it("propage l'échec du dépôt à l'appelant", async () => {
    server.use(http.put(STORAGE_URL, () => new HttpResponse(null, { status: 403 })));

    await expect(
      uploadToStorage({
        url: STORAGE_URL,
        file: new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        onProgress: () => {},
      }),
    ).rejects.toThrow();
  });
});
