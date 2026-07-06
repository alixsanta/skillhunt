import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';
import { UserRole } from '../../common/enums';

// C2.2.2/C2.2.3 — La règle « position obligatoire pour un FREELANCE » est portée par le DTO :
// on la teste directement via class-validator, comme le ferait le ValidationPipe global.
async function invalidProperties(payload: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(RegisterDto, payload);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

const BASE = {
  email: 'pilote@skillhunt.io',
  username: 'Pilote',
  password: 'Password123!',
};

describe('RegisterDto — position conditionnelle par rôle (SH-34)', () => {
  it('FREELANCE avec position valide : accepté', async () => {
    const errors = await invalidProperties({
      ...BASE,
      role: UserRole.FREELANCE,
      location: { latitude: 43.6045, longitude: 1.4442 },
    });
    expect(errors).toEqual([]);
  });

  it('FREELANCE sans position : rejeté sur le champ location', async () => {
    const errors = await invalidProperties({ ...BASE, role: UserRole.FREELANCE });
    expect(errors).toContain('location');
  });

  it('RECRUITER sans position : accepté (contrainte non applicable)', async () => {
    const errors = await invalidProperties({ ...BASE, role: UserRole.RECRUITER });
    expect(errors).toEqual([]);
  });

  it('RECRUITER avec position valide : acceptée (optionnelle mais permise)', async () => {
    const errors = await invalidProperties({
      ...BASE,
      role: UserRole.RECRUITER,
      location: { latitude: 48.8566, longitude: 2.3522 },
    });
    expect(errors).toEqual([]);
  });

  it('latitude hors bornes (91) : rejetée quel que soit le rôle', async () => {
    const errors = await invalidProperties({
      ...BASE,
      role: UserRole.RECRUITER,
      location: { latitude: 91, longitude: 1.4442 },
    });
    expect(errors).toContain('location');
  });

  it('longitude hors bornes (200) : rejetée', async () => {
    const errors = await invalidProperties({
      ...BASE,
      role: UserRole.FREELANCE,
      location: { latitude: 43.6045, longitude: 200 },
    });
    expect(errors).toContain('location');
  });

  it('position non numérique : rejetée', async () => {
    const errors = await invalidProperties({
      ...BASE,
      role: UserRole.FREELANCE,
      location: { latitude: 'nord', longitude: 'ouest' },
    });
    expect(errors).toContain('location');
  });

  it('coordonnées en chaînes numériques : coercées en nombres (jamais de string persistée)', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...BASE,
      role: UserRole.FREELANCE,
      location: { latitude: '43.6045', longitude: '1.4442' },
    });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
    // La coercition @Type(() => Number) garantit des number natifs pour la conversion GeoJSON (C2.2.3)
    expect(typeof dto.location!.latitude).toBe('number');
    expect(typeof dto.location!.longitude).toBe('number');
    expect(dto.location!.latitude).toBeCloseTo(43.6045);
  });
});
