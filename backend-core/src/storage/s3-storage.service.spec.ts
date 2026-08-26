import { NotFoundException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { S3StorageService } from './s3-storage.service';

/**
 * Tests unitaires **hermétiques** de l'adaptateur S3 (SH-31).
 *
 * Aucune connexion réseau : `client.send` est espionné pour les commandes mutantes
 * (`put`/`delete`), et la génération de Signed URL par le presigner est purement locale
 * (signature calculée hors-ligne). L'intégration réelle ↔ LocalStack est manuelle (cf. ticket).
 */
describe('🗄️ S3StorageService (adaptateur S3 — SH-31)', () => {
  const BUCKET = 'skillhunt-test';

  // Client réel mais avec des creds factices : suffisant pour signer une URL hors-ligne.
  const buildClient = (): S3Client =>
    new S3Client({
      region: 'eu-west-3',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });

  let client: S3Client;
  let service: S3StorageService;
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    client = buildClient();
    // On neutralise l'appel réseau réel ; on inspecte la commande envoyée.
    sendSpy = jest.spyOn(client, 'send').mockResolvedValue({} as never);
    service = new S3StorageService(client, BUCKET);
  });

  // --- Dépôt chiffré au repos (Scénario 1) ---
  it('dépose l\'objet avec chiffrement au repos AES-256 (SSE)', async () => {
    const body = Buffer.from('%PDF-1.7');

    await service.put('certifications/x.pdf', body, 'application/pdf');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const command = sendSpy.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: BUCKET,
      Key: 'certifications/x.pdf',
      Body: body,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
    });
  });

  // --- Signed URL temporaire (Scénario 1) ---
  it('génère une Signed URL portant la clé, le bucket et le TTL demandé', async () => {
    const url = await service.getSignedUrl('certifications/x.pdf', 900);

    expect(url).toContain(BUCKET);
    expect(url).toContain('certifications/x.pdf');
    // Le presigner V4 encode l'expiration dans le query string.
    expect(url).toContain('X-Amz-Expires=900');
    expect(url).toContain('X-Amz-Signature=');
  });

  // --- Suppression / purge (Scénario 2) ---
  it('supprime l\'objet via DeleteObjectCommand', async () => {
    await service.delete('certifications/x.pdf');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const command = sendSpy.mock.calls[0][0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({ Bucket: BUCKET, Key: 'certifications/x.pdf' });
  });

  it('head traduit la réponse HeadObject en {sizeBytes, contentType}', async () => {
    const sendSpy = jest
      .spyOn(client, 'send')
      .mockResolvedValue({ ContentLength: 1234, ContentType: 'video/mp4' } as never);

    await expect(service.head('private/media/f1/m1/master.mp4')).resolves.toEqual({
      sizeBytes: 1234,
      contentType: 'video/mp4',
    });
    expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('head traduit une 404 S3 en NotFoundException', async () => {
    jest
      .spyOn(client, 'send')
      .mockRejectedValue(Object.assign(new Error('NotFound'), { name: 'NotFound' }) as never);

    await expect(service.head('absente')).rejects.toThrow(NotFoundException);
  });

  it('deletePrefix liste puis supprime par lots, et suit la pagination', async () => {
    const sendSpy = jest
      .spyOn(client, 'send')
      .mockResolvedValueOnce({
        Contents: [{ Key: 'p/a' }],
        IsTruncated: true,
        NextContinuationToken: 'suite',
      } as never)
      .mockResolvedValueOnce({} as never) // DeleteObjects du 1er lot
      .mockResolvedValueOnce({ Contents: [{ Key: 'p/b' }], IsTruncated: false } as never)
      .mockResolvedValueOnce({} as never); // DeleteObjects du 2e lot

    await service.deletePrefix('p/');

    // Une clé oubliée par la pagination, c'est un objet orphelin facturé à vie.
    expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
    expect(sendSpy.mock.calls[1][0]).toBeInstanceOf(DeleteObjectsCommand);
    expect(sendSpy.mock.calls[2][0]).toBeInstanceOf(ListObjectsV2Command);
    expect(sendSpy.mock.calls[3][0]).toBeInstanceOf(DeleteObjectsCommand);
  });

  it('deletePrefix n\'envoie aucune suppression si le préfixe est vide', async () => {
    const sendSpy = jest
      .spyOn(client, 'send')
      .mockResolvedValueOnce({ Contents: [], IsTruncated: false } as never);

    await service.deletePrefix('vide/');

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('getSignedUploadUrl produit une URL PUT signée portant le type MIME', async () => {
    const url = await service.getSignedUploadUrl('private/media/f1/m1/master.mp4', 900, 'video/mp4');

    expect(url).toContain('X-Amz-Signature');
    expect(url).toContain('X-Amz-Expires=900');
  });
});
