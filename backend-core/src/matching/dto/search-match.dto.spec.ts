import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { SearchMatchDto } from './search-match.dto';

/**
 * Bornes du DTO de recherche (SH-22, C2.2.3) — miroir des contraintes Pydantic du
 * matching-service (anti-DoS : une liste de skills non bornée serait amplifiée par
 * candidat lors du scoring). Mêmes options que le ValidationPipe global (main.ts).
 */
describe('SearchMatchDto — bornes de validation (SH-22)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const meta = { type: 'body' as const, metatype: SearchMatchDto };

  const valid = {
    skills: ['pilotage drone', 'thermographie'],
    lat: 43.6045,
    lon: 1.4442,
    radiusKm: 50,
  };

  it('accepte une demande conforme', async () => {
    await expect(pipe.transform(valid, meta)).resolves.toMatchObject(valid);
  });

  it.each([
    ['skills vide', { ...valid, skills: [] }],
    ['plus de 50 skills', { ...valid, skills: Array.from({ length: 51 }, (_, i) => `s${i}`) }],
    ['skill vide', { ...valid, skills: [''] }],
    ['skill trop long', { ...valid, skills: ['x'.repeat(65)] }],
    ['latitude hors bornes', { ...valid, lat: 91 }],
    ['longitude hors bornes', { ...valid, lon: -181 }],
    ['rayon nul', { ...valid, radiusKm: 0 }],
    ['rayon > 500', { ...valid, radiusKm: 501 }],
    ['propriété inconnue', { ...valid, injected: 'x' }],
  ])('rejette (400) : %s', async (_label, body) => {
    await expect(pipe.transform(body, meta)).rejects.toThrow(BadRequestException);
  });
});
