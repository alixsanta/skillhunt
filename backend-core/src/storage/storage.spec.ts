import { NotFoundException } from '@nestjs/common';
import { FakeStorageService } from './fake-storage.service';

/**
 * Tests unitaires de l'implémentation mémoire du port `StorageService` (SH-31).
 * Aucun appel réseau ni AWS : la CI reste hermétique (cf. ticket, Scénario 3).
 */
describe('🗄️ FakeStorageService (stockage en mémoire — SH-31)', () => {
  let storage: FakeStorageService;

  beforeEach(() => {
    storage = new FakeStorageService();
  });

  const key = 'certifications/abc.pdf';
  const body = Buffer.from('%PDF-1.7 contenu factice');
  const contentType = 'application/pdf';

  // --- Dépôt + récupération (Scénario 1) ---
  it('dépose un objet puis renvoie une Signed URL déterministe avec le TTL', async () => {
    await storage.put(key, body, contentType);

    const url = await storage.getSignedUrl(key, 900);

    // URL factice déterministe : même clé + même TTL ⇒ même URL
    expect(url).toBe(await storage.getSignedUrl(key, 900));
    expect(url).toContain(encodeURIComponent(key));
    expect(url).toContain('ttl=900');
  });

  it('conserve le contenu et le type MIME déposés', async () => {
    await storage.put(key, body, contentType);

    expect(storage.peek(key)).toEqual(body);
    expect(storage.getContentType(key)).toBe(contentType);
  });

  it('écrase l\'objet existant lors d\'un second put sur la même clé (idempotence de clé)', async () => {
    await storage.put(key, body, contentType);
    const nouveau = Buffer.from('%PDF-1.7 nouvelle version');

    await storage.put(key, nouveau, contentType);

    expect(storage.peek(key)).toEqual(nouveau);
    expect(storage.size()).toBe(1);
  });

  // --- Suppression / purge (Scénario 2) ---
  it('supprime l\'objet : il n\'est plus accessible via getSignedUrl', async () => {
    await storage.put(key, body, contentType);

    await storage.delete(key);

    expect(storage.peek(key)).toBeUndefined();
    await expect(storage.getSignedUrl(key, 900)).rejects.toThrow(NotFoundException);
  });

  it('rend la suppression idempotente (delete sur une clé absente ne lève pas)', async () => {
    await expect(storage.delete('inconnue')).resolves.toBeUndefined();
  });

  // --- Accès à une clé inexistante ---
  it('refuse la Signed URL d\'une clé inexistante (404)', async () => {
    await expect(storage.getSignedUrl('jamais-deposee', 900)).rejects.toThrow(NotFoundException);
  });

  it('getSignedUploadUrl signe un dépôt À VENIR : la clé n\'a pas besoin d\'exister', async () => {
    const url = await storage.getSignedUploadUrl('private/media/f1/m1/master.mp4', 900, 'video/mp4');

    expect(url).toContain('master.mp4');
    // Contrairement à getSignedUrl (lecture), aucune exception : on signe un objet absent.
    await expect(storage.getSignedUrl('private/media/f1/m1/master.mp4', 900)).rejects.toThrow();
  });

  it('head rend la taille et le type RÉELS de l\'objet déposé', async () => {
    await storage.put('private/media/f1/m1/master.mp4', Buffer.alloc(4242), 'video/mp4');

    await expect(storage.head('private/media/f1/m1/master.mp4')).resolves.toEqual({
      sizeBytes: 4242,
      contentType: 'video/mp4',
    });
  });

  it('head rejette NotFound sur une clé absente', async () => {
    await expect(storage.head('jamais-deposee')).rejects.toThrow(NotFoundException);
  });

  it('get restitue le contenu exact de l\'objet', async () => {
    await storage.put('playlist.m3u8', Buffer.from('#EXTM3U'), 'application/vnd.apple.mpegurl');

    await expect(storage.get('playlist.m3u8')).resolves.toEqual(Buffer.from('#EXTM3U'));
  });

  it('get rejette NotFound sur une clé absente', async () => {
    await expect(storage.get('jamais-deposee')).rejects.toThrow(NotFoundException);
  });

  it('deletePrefix purge TOUS les objets du préfixe et eux seuls', async () => {
    await storage.put('private/media/f1/m1/master.mp4', Buffer.from('a'), 'video/mp4');
    await storage.put('private/media/f1/m1/hls/720p.m3u8', Buffer.from('b'), 'application/vnd.apple.mpegurl');
    await storage.put('private/media/f1/m2/master.mp4', Buffer.from('c'), 'video/mp4');

    await storage.deletePrefix('private/media/f1/m1/');

    await expect(storage.head('private/media/f1/m1/master.mp4')).rejects.toThrow(NotFoundException);
    await expect(storage.head('private/media/f1/m1/hls/720p.m3u8')).rejects.toThrow(NotFoundException);
    // Le média voisin n'est pas touché : un préfixe mal borné effacerait le casier entier.
    await expect(storage.head('private/media/f1/m2/master.mp4')).resolves.toBeDefined();
  });

  it('deletePrefix est idempotent sur un préfixe vide', async () => {
    await expect(storage.deletePrefix('prefixe/inexistant/')).resolves.toBeUndefined();
  });
});
