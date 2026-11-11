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

function build(password: string): RegisterDto {
  return plainToInstance(RegisterDto, {
    email: 'pilote@skillhunt.io',
    username: 'PiloteJury',
    password,
    role: UserRole.RECRUITER,
  });
}

async function messagesFor(password: string): Promise<string[]> {
  const errors = await validate(build(password));
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('RegisterDto — robustesse du mot de passe (SH-51, C2.2.3)', () => {
  it('accepte un mot de passe conforme', async () => {
    expect(await messagesFor('PiloteDrone2026')).toHaveLength(0);
  });

  it('refuse en dessous de douze caractères', async () => {
    expect(await messagesFor('Pilote2026')).toContain(
      'Le mot de passe doit faire au moins 12 caractères',
    );
  });

  it('refuse un mot de passe sans majuscule', async () => {
    expect(await messagesFor('pilotedrone2026')).toContain(
      'Le mot de passe doit contenir au moins une majuscule',
    );
  });

  it('refuse un mot de passe sans minuscule', async () => {
    expect(await messagesFor('PILOTEDRONE2026')).toContain(
      'Le mot de passe doit contenir au moins une minuscule',
    );
  });

  it('refuse un mot de passe sans chiffre', async () => {
    expect(await messagesFor('PiloteDroneAAAA')).toContain(
      'Le mot de passe doit contenir au moins un chiffre',
    );
  });

  it('laisse passer le mot de passe des comptes de démonstration', async () => {
    // Non-régression : la nouvelle règle ne doit invalider aucun compte existant.
    expect(await messagesFor('MotDePasse2026!')).toHaveLength(0);
  });
});

// SH-51 : `username` est désormais porté par le payload du JWT, donc renvoyé dans l'en-tête
// Authorization de chaque requête authentifiée. Sans borne, un username de plusieurs Ko produit
// un token que la gateway rejette (431, buffers d'en-tête) sur toutes les requêtes du compte.
describe('RegisterDto — validation du username (SH-51, C2.2.3)', () => {
  async function usernameErrors(username: string): Promise<string[]> {
    const errors = await validate(plainToInstance(RegisterDto, { ...BASE, username, role: UserRole.RECRUITER }));
    return errors.filter((e) => e.property === 'username').flatMap((e) => Object.values(e.constraints ?? {}));
  }

  it('accepte un nom d\'utilisateur usuel', async () => {
    expect(await usernameErrors('Marcus_Thorne-01')).toHaveLength(0);
  });

  it('accepte exactement 50 caractères', async () => {
    expect(await usernameErrors('a'.repeat(50))).toHaveLength(0);
  });

  it('refuse au-delà de 50 caractères (charge utile portée par chaque en-tête Authorization)', async () => {
    expect(await usernameErrors('a'.repeat(51))).toContain(
      "Le nom d'utilisateur ne doit pas dépasser 50 caractères",
    );
  });

  // Un nom d'AFFICHAGE, pas un identifiant technique : l'espace d'un nom composé et les
  // lettres accentuées sont légitimes. Les refuser rejetterait des utilisateurs réels.
  it.each(['Marcus Thorne', "Élodie O'Neil", 'Jean-Pierre M.', 'Mila M'])(
    "accepte le nom d'affichage %s",
    async (username) => {
      expect(await usernameErrors(username)).toHaveLength(0);
    },
  );

  it('refuse un nom commençant par une espace', async () => {
    expect(await usernameErrors('  Marcus')).toContain(
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, espaces, apostrophes, " +
        "tirets, points et tirets bas, et doit commencer par une lettre ou un chiffre",
    );
  });

  it('refuse un nom contenant des caractères de contrôle', async () => {
    expect(await usernameErrors('Marcus\nThorne')).toContain(
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, espaces, apostrophes, " +
        "tirets, points et tirets bas, et doit commencer par une lettre ou un chiffre",
    );
  });

  it('refuse un nom contenant des caractères spéciaux hors jeu autorisé', async () => {
    expect(await usernameErrors('<script>alert(1)</script>')).toContain(
      "Le nom d'utilisateur ne peut contenir que des lettres, chiffres, espaces, apostrophes, " +
        "tirets, points et tirets bas, et doit commencer par une lettre ou un chiffre",
    );
  });

  it.each(['DemoPilote', 'DemoRecruteur', 'DemoAdmin'])(
    'laisse passer le username du compte de démonstration %s (scripts/seed-demo.sh)',
    async (username) => {
      // Non-régression : les comptes de démo (scripts/seed-demo.sh) doivent rester acceptés.
      expect(await usernameErrors(username)).toHaveLength(0);
    },
  );
});
