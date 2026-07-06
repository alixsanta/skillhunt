# SH-34 — Position freelance obligatoire à l'onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la position géographique obligatoire à l'inscription d'un FREELANCE (option A de la spec) : validation DTO conditionnelle par rôle + écriture GeoJSON dans `register` + contrainte `CHECK` PostgreSQL.

**Architecture:** Une étape unique — la position arrive dans `POST /api/v1/auth/register` via un `LocationDto { latitude, longitude }` (obligatoire si `role=FREELANCE`, validée si fournie sinon), convertie en GeoJSON `Point [lon, lat]` par `AuthService.register`, verrouillée en base par `CHECK (role <> 'FREELANCE' OR location IS NOT NULL)`.

**Tech Stack:** NestJS 11, class-validator/class-transformer (ValidationPipe global `whitelist+forbidNonWhitelisted+transform`), TypeORM (migrations SQL brutes versionnées — pattern existant), Jest.

**Spec:** `docs/superpowers/specs/2026-07-06-SH-34-position-freelance-onboarding-design.md` (décisions D1–D6).
**Branche:** `feature/SH-34-position-freelance-onboarding` (déjà créée depuis `develop`).

## Global Constraints

- **Langue** : commentaires et messages utilisateur **en français** ; identifiants en anglais (CLAUDE.md §7).
- **Référencer la compétence RNCP** en commentaire des blocs concernés (`C2.2.3` validation/sécurité, `C2.2.2` tests, `C2.4.1` Swagger).
- **Ordre GeoJSON = `[longitude, latitude]`** (inverse de l'ordre usuel lat/lon) — à commenter partout où la conversion a lieu.
- **Aucune requête brute applicative** ; le SQL ne vit que dans les migrations versionnées (pattern existant).
- **Recruteur/Admin** : `location` optionnelle mais **validée si fournie** (D3) — jamais de valeur non validée persistée.
- **Aucune reprise de données** (D4) : le CHECK s'applique directement ; base dev locale avec freelances de test sans position → `docker compose down -v` + re-migrate (documenté dans la migration).
- **Commits** : Conventional Commits, scope `(SH-34/<service>)`, terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: LocationDto + validation conditionnelle dans RegisterDto

**Files:**
- Modify: `backend-core/src/auth/dto/register.dto.ts`
- Test (create): `backend-core/src/auth/dto/register.dto.spec.ts`

**Interfaces:**
- Produces: `export class LocationDto { latitude: number; longitude: number }` et `RegisterDto.location?: LocationDto` — consommés par Task 2 (`dto.location.latitude/.longitude`).

- [ ] **Step 1: Écrire les tests de validation du DTO (échec attendu)**

`backend-core/src/auth/dto/register.dto.spec.ts` :

```typescript
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
});
```

- [ ] **Step 2: Lancer les tests (échec)**

Run: `cd backend-core && npx jest register.dto.spec --silent`
Expected: FAIL — « FREELANCE sans position » et les cas hors bornes échouent (le champ `location` n'existe pas encore dans `RegisterDto`, donc aucune erreur n'est levée ; avec `plainToInstance`, la propriété inconnue est simplement ignorée).

- [ ] **Step 3: Implémenter LocationDto + le champ conditionnel**

Dans `backend-core/src/auth/dto/register.dto.ts` — compléter les imports :

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsString, IsNotEmpty, MinLength, IsIn,
  IsDefined, IsLatitude, IsLongitude, ValidateIf, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
```

Ajouter la classe (avant `RegisterDto`) :

```typescript
/**
 * Position géographique saisie à l'inscription (SH-34).
 * Champs explicites latitude/longitude (pas de tableau) : neutralise le piège
 * d'ordre GeoJSON ([lon, lat]) à la frontière API (C2.2.3).
 */
export class LocationDto {
  @ApiProperty({ example: 43.6045, description: 'Latitude en degrés décimaux (WGS84, entre -90 et 90)' })
  @IsLatitude({ message: 'La latitude doit être comprise entre -90 et 90' })
  latitude!: number;

  @ApiProperty({ example: 1.4442, description: 'Longitude en degrés décimaux (WGS84, entre -180 et 180)' })
  @IsLongitude({ message: 'La longitude doit être comprise entre -180 et 180' })
  longitude!: number;
}
```

Ajouter le champ à la fin de `RegisterDto` :

```typescript
  @ApiPropertyOptional({
    type: LocationDto,
    description:
      'Position géographique. OBLIGATOIRE pour un FREELANCE (sinon invisible du matching par rayon, SH-13) ; optionnelle pour un RECRUITER.',
  })
  // C2.2.3 — Validation conditionnelle par rôle (SH-34) :
  // - FREELANCE : position obligatoire (un freelance sans position est invisible du matching) ;
  // - autres rôles : optionnelle, mais validée dès qu'elle est fournie (jamais de donnée non validée).
  @ValidateIf((o: RegisterDto) => o.role === UserRole.FREELANCE || o.location !== undefined)
  @IsDefined({ message: 'La position est obligatoire pour un compte Freelance' })
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
```

> Note : `@ValidateIf` gouverne TOUS les validateurs du champ. RECRUITER sans `location`
> → condition fausse → tout est ignoré. FREELANCE sans `location` → condition vraie →
> `@IsDefined` échoue (400). Position fournie (tout rôle) → `@ValidateNested` contrôle les bornes.

- [ ] **Step 4: Lancer les tests (succès)**

Run: `cd backend-core && npx jest register.dto.spec --silent`
Expected: PASS (7 tests).

- [ ] **Step 5: Non-régression + commit**

Run: `cd backend-core && npx jest auth --silent && npm run build`
Expected: PASS (les tests service existants passent des DTO sans `location` : le service ne valide pas, seul le pipe le fait) + build OK.

```bash
git add backend-core/src/auth/dto/register.dto.ts backend-core/src/auth/dto/register.dto.spec.ts
git commit -m "feat(SH-34/auth): LocationDto + position obligatoire pour FREELANCE dans RegisterDto (C2.2.3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: register écrit la position en GeoJSON Point [lon, lat]

**Files:**
- Modify: `backend-core/src/auth/auth.service.ts` (méthode `register`, ~ligne 48)
- Modify: `backend-core/src/auth/auth.service.spec.ts` (nouveaux tests register)

**Interfaces:**
- Consumes: `RegisterDto.location?: LocationDto` (Task 1).
- Produces: `users.location` persistée en GeoJSON `{ type: 'Point', coordinates: [longitude, latitude] }` — même format que ce que lit le matching PostGIS (SH-13).

- [ ] **Step 1: Écrire les tests (échec attendu)**

Dans `backend-core/src/auth/auth.service.spec.ts`, ajouter dans le `describe('➡️ Méthode register()')` :

```typescript
    it('devrait persister la position d\'un freelance en GeoJSON Point [lon, lat] (SH-34)', async () => {
      const dto = {
        email: 'geo.pilote@skillhunt.io',
        username: 'GeoPilote',
        password: 'Password123!',
        role: UserRole.FREELANCE,
        location: { latitude: 43.6045, longitude: 1.4442 },
      };

      await service.register(dto);

      const stored = repo.all().find((u) => u.email === dto.email);
      // Ordre GeoJSON : [longitude, latitude] — l'inversion est le piège à verrouiller (C2.2.2)
      expect(stored!.location).toEqual({ type: 'Point', coordinates: [1.4442, 43.6045] });
    });

    it('devrait laisser la position à null pour un recruteur sans position (SH-34)', async () => {
      const dto = {
        email: 'recruteur.sans.geo@skillhunt.io',
        username: 'RecruteurSansGeo',
        password: 'Password123!',
        role: UserRole.RECRUITER,
      };

      await service.register(dto);

      const stored = repo.all().find((u) => u.email === dto.email);
      expect(stored!.location).toBeNull();
    });
```

- [ ] **Step 2: Lancer les tests (échec)**

Run: `cd backend-core && npx jest auth.service.spec --silent`
Expected: FAIL — `stored.location` vaut `undefined` (register ne mappe pas encore le champ).

- [ ] **Step 3: Implémenter la conversion dans register**

Dans `backend-core/src/auth/auth.service.ts`, remplacer le bloc `create` de `register` :

```typescript
    // L'identifiant UUID est généré par la base (gen_random_uuid), pas côté application
    const user = this.usersRepo.create({
      email: dto.email,
      username: dto.username,
      role: dto.role,
      passwordHash,
      // SH-34 — position saisie à l'inscription (obligatoire pour un FREELANCE, cf. RegisterDto).
      // ⚠️ Ordre GeoJSON = [longitude, latitude], inverse de l'ordre usuel lat/lon (C2.2.3).
      location: dto.location
        ? { type: 'Point' as const, coordinates: [dto.location.longitude, dto.location.latitude] }
        : null,
    });
```

- [ ] **Step 4: Lancer les tests (succès)**

Run: `cd backend-core && npx jest auth.service.spec --silent`
Expected: PASS (les 2 nouveaux tests + tous les existants).

- [ ] **Step 5: Build + commit**

Run: `cd backend-core && npm run build`
Expected: OK (le type `Point` de geojson est satisfait par l'objet littéral `as const`).

```bash
git add backend-core/src/auth/auth.service.ts backend-core/src/auth/auth.service.spec.ts
git commit -m "feat(SH-34/auth): register persiste la position freelance en GeoJSON Point [lon,lat] (C2.2.3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Migration CHECK conditionnel + documentation + vérification finale

**Files:**
- Create: `backend-core/src/database/migrations/1719250000000-AddFreelanceLocationCheck.ts`
- Modify: `docs/tickets/SH-34-position-freelance-onboarding.md` (tracer la décision D4 : dilemme backfill/NOT VALID clos)
- Modify: `docs/BACKLOG.md` (SH-34 → statut selon avancement)

**Interfaces:**
- Consumes: rien (SQL pur, pattern des migrations existantes).
- Produces: contrainte `CHK_users_freelance_location` sur `users`.

- [ ] **Step 1: Écrire la migration**

`backend-core/src/database/migrations/1719250000000-AddFreelanceLocationCheck.ts` :

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SH-34 — Garde-fou d'intégrité (défense en profondeur, C2.2.3) :
 * un FREELANCE doit toujours avoir une position (sinon il est invisible du
 * matching par rayon, SH-13). La 1re ligne de défense est le DTO (RegisterDto) ;
 * cette contrainte couvre toute écriture qui contournerait l'API.
 *
 * Reprise de données : AUCUNE (décision D4 de la spec 2026-07-06) — pas de prod,
 * les bases dev/CI sont reconstruites par migrations. Si une base dev locale
 * contient des freelances de test sans position, la migration échouera :
 * `docker compose down -v` puis re-migrer.
 */
export class AddFreelanceLocationCheck1719250000000 implements MigrationInterface {
  name = 'AddFreelanceLocationCheck1719250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_freelance_location" ` +
        `CHECK (role <> 'FREELANCE' OR location IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_freelance_location"`,
    );
  }
}
```

- [ ] **Step 2: Vérifier la migration sur la base dev (manuel, recommandé)**

Prérequis : Docker Desktop démarré.

```bash
cd C:/Users/ALX/Projects/skillhunt && docker compose up -d postgres
cd backend-core && npm run migration:run
```

Expected: la migration `AddFreelanceLocationCheck1719250000000` s'applique sans erreur.
Si elle échoue pour cause de freelances de test sans position : `docker compose down -v`, `docker compose up -d postgres`, re-lancer `npm run migration:run`.

Puis vérifier le garde-fou (Scénario 4 du ticket) :

```bash
docker exec skillhunt-postgres psql -U skillhunt -d skillhunt -c \
  "INSERT INTO users (email, username, \"passwordHash\", role) VALUES ('fantome@test.io', 'Fantome', 'x', 'FREELANCE');"
```

Expected: `ERROR: new row for relation "users" violates check constraint "CHK_users_freelance_location"`.

> Note : le nom réel du service/DB/utilisateur Postgres est dans `docker-compose.yml` — adapter la commande si besoin (port hôte 5433 d'après backend-core/CLAUDE.md).

- [ ] **Step 3: Tracer la décision dans le ticket**

Dans `docs/tickets/SH-34-position-freelance-onboarding.md`, remplacer le point « ⚠️ Reprise des données existantes (Scénario 5) » de la section 4 par :

```markdown
    * ✅ **Reprise des données existantes (Scénario 5) — décision (D4, spec 2026-07-06) :**
      **aucune reprise**. Pas de prod (projet académique), bases dev/CI reconstruites par
      migrations → contrainte appliquée directement en VALID. Base dev locale contenant des
      freelances de test sans position → `docker compose down -v` + re-migrer (documenté
      dans la migration). Le dilemme backfill vs `NOT VALID` est clos.
```

Et cocher dans la DoD les cases couvertes à ce stade (DTO, migration, tests, Swagger via `@ApiProperty`).

- [ ] **Step 4: Vérification finale complète**

Run: `cd backend-core && npm run lint && npm run test -- --silent && npm run build`
Expected: tout vert (lint 0 erreur, tous les tests passent dont les 9 nouveaux, build OK).

- [ ] **Step 5: Backlog + commit**

Dans `docs/BACKLOG.md` : ligne SH-34 → `🟠 En cours` → laisser 🟠 (passera 🟢 après merge de la PR, pattern SH-14).

```bash
git add backend-core/src/database/migrations/1719250000000-AddFreelanceLocationCheck.ts docs/tickets/SH-34-position-freelance-onboarding.md docs/BACKLOG.md
git commit -m "feat(SH-34/db): contrainte CHECK position freelance + décision D4 tracée (C2.2.3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Vérification finale (avant PR)

- [ ] `cd backend-core && npm run lint && npm run test && npm run build` — tout vert.
- [x] Migration vérifiée au moins une fois sur un vrai Postgres (Task 3 Step 2) — INSERT freelance sans position rejeté par le CHECK. Doublement prouvée par la revue finale : chemin d'écriture réel `save()` → `geography(Point,4326)` exercé contre `skillhunt-postgres` (port 5433), relecture `ST_AsText`/`ST_SRID` conforme (`POINT(1.4442 43.6045)`, SRID 4326).
- [ ] Swagger : `LocationDto` visible dans le schéma de `POST /api/v1/auth/register` (`npm run start:dev` + http://localhost:3001/api/docs — contrôle visuel rapide).
- [ ] Ouvrir la PR **vers `develop`** (jamais `main`), corps : décisions D1–D6, scénarios Gherkin couverts, compétences C2.2.3/C2.2.2/C2.4.1.
- [ ] Après merge : SH-34 → 🟢 au backlog, SCRUM-52 → Terminé (transition `41`).

## Notes de séquencement

- Task 1 → Task 2 (le service consomme le type du DTO). Task 3 est indépendante du code mais committée en dernier pour un historique lisible.
- Aucun changement côté matching-service : il lit `users.location` via PostGIS (SH-13), format inchangé.
