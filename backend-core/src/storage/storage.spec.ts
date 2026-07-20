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

    expect(storage.get(key)).toEqual(body);
    expect(storage.getContentType(key)).toBe(contentType);
  });

  it('écrase l\'objet existant lors d\'un second put sur la même clé (idempotence de clé)', async () => {
    await storage.put(key, body, contentType);
    const nouveau = Buffer.from('%PDF-1.7 nouvelle version');

    await storage.put(key, nouveau, contentType);

    expect(storage.get(key)).toEqual(nouveau);
    expect(storage.size()).toBe(1);
  });

  // --- Suppression / purge (Scénario 2) ---
  it('supprime l\'objet : il n\'est plus accessible via getSignedUrl', async () => {
    await storage.put(key, body, contentType);

    await storage.delete(key);

    expect(storage.get(key)).toBeUndefined();
    await expect(storage.getSignedUrl(key, 900)).rejects.toThrow(NotFoundException);
  });

  it('rend la suppression idempotente (delete sur une clé absente ne lève pas)', async () => {
    await expect(storage.delete('inconnue')).resolves.toBeUndefined();
  });

  // --- Accès à une clé inexistante ---
  it('refuse la Signed URL d\'une clé inexistante (404)', async () => {
    await expect(storage.getSignedUrl('jamais-deposee', 900)).rejects.toThrow(NotFoundException);
  });
});
