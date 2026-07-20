import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { PublicQueryGearDto } from './public-query-gear.dto';

/**
 * Non-contournement du filtre de statut (SH-39, C2.2.3).
 *
 * La vue publique impose `status = VALIDATED` côté service. Ce spec verrouille la première
 * ligne de défense : le DTO de requête n'accepte PAS `status`, et le ValidationPipe global
 * (mêmes options que main.ts) rejette en 400 toute tentative de l'injecter — jamais un 200
 * contenant du matériel non validé.
 */
describe('PublicQueryGearDto — anti-contournement du statut (SH-39)', () => {
  // Miroir exact des options du ValidationPipe global (main.ts)
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const meta = { type: 'query' as const, metatype: PublicQueryGearDto };

  it('rejette (400) toute tentative de forcer le statut (?status=PENDING)', async () => {
    await expect(pipe.transform({ status: 'PENDING' }, meta)).rejects.toThrow(BadRequestException);
    await expect(pipe.transform({ status: 'REJECTED' }, meta)).rejects.toThrow(BadRequestException);
  });

  it('rejette (400) une catégorie hors enum', async () => {
    await expect(pipe.transform({ category: 'TANK' }, meta)).rejects.toThrow(BadRequestException);
  });

  it('accepte catégorie + pagination, et transforme les query string en nombres', async () => {
    const dto = await pipe.transform({ category: 'DRONE', page: '2', limit: '10' }, meta);
    expect(dto).toMatchObject({ category: 'DRONE', page: 2, limit: 10 });
  });

  it('applique les valeurs par défaut de pagination (page 1, limit 20)', async () => {
    const dto = await pipe.transform({}, meta);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
  });
});
