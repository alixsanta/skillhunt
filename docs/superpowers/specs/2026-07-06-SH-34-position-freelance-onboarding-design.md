# SH-34 — Position freelance obligatoire à l'onboarding — Design

> Spec validée en brainstorming le 2026-07-06. Ticket : `docs/tickets/SH-34-position-freelance-onboarding.md` (SCRUM-52).
> Périmètre : **backend-core uniquement** (3 SP). Prérequis livrés : SH-6 (PostGIS), SH-13 (matching géo).

## Problème

`users.location` est `nullable` et **aucun chemin API ne permet de la renseigner** : `RegisterDto`
n'a pas de champ position et `AuthService.register` ne l'écrit pas. Tout freelance créé aujourd'hui
a `location = NULL` → il est **invisible** dans toute recherche par rayon (SH-13). La donnée
d'entrée du matching est critique (CLAUDE.md §1) ; on referme la faille à la source.

## Décision structurante (D1) — onboarding en une étape

**Option retenue : A — la position est fournie dans `register`** (obligatoire si `role = FREELANCE`).

- Le compte freelance est créé **avec** sa position → l'invariant « un freelance a toujours une
  position » est garanti dès l'INSERT, donc la contrainte **CHECK en base est applicable**
  (défense en profondeur réelle, C2.2.3).
- Option B écartée (register léger + endpoint de complétion) : elle recrée transitoirement l'état
  qu'on veut éliminer (freelance sans position), rend le CHECK impossible et exige un guard
  transverse « profil incomplet » — YAGNI au Lot 1.

## Décisions secondaires

| # | Décision | Choix |
|---|---|---|
| D2 | Forme du champ API | Objet `{ latitude, longitude }` explicite (pas de tableau) — neutralise le piège d'ordre GeoJSON (`[lon, lat]`) à la frontière API |
| D3 | Recruteur/Admin | `location` **optionnelle mais validée si fournie** (l'entité le permet ; jamais de valeur non validée) |
| D4 | Reprise des données existantes | **Aucune** : pas de prod (projet académique), bases dev/CI reconstruites par migrations → CHECK appliqué directement en VALID. La question backfill vs `NOT VALID` du ticket tombe. Base dev locale avec freelances de test sans position → reset (`docker compose down -v` + re-migrate), documenté dans la migration |
| D5 | Scénario 4 du ticket (CHECK) | Vérifié **manuellement** (docker compose + SQL) : pas de harnais d'intégration Postgres côté Nest en CI, on n'en construit pas un pour 3 SP. Le garde-fou reste prouvé par la migration versionnée |
| D6 | Bus d'événements | **Hors périmètre** : pas d'émission `freelance.updated` depuis register. Un nouveau freelance change certes les résultats de matching, mais la fenêtre est bornée par le TTL du cache (60 s) — acceptable au MVP. L'émission viendra avec le futur endpoint de *mise à jour* de position (ticket à venir) |

## Composants

### 1. DTO — `backend-core/src/auth/dto/register.dto.ts`
- Nouvelle classe `LocationDto` : `latitude` (`@IsLatitude()`), `longitude` (`@IsLongitude()`),
  messages en français, `@ApiProperty` avec exemples (Toulouse : 43.6045, 1.4442).
- `RegisterDto.location?: LocationDto` :
  - obligatoire si `role === FREELANCE` → 400 sinon ;
  - validée (`@ValidateNested` + `@Type(() => LocationDto)`) dès qu'elle est fournie, quel que soit le rôle.

### 2. Service — `backend-core/src/auth/auth.service.ts::register`
- Si `dto.location` présent : conversion en GeoJSON
  `{ type: 'Point', coordinates: [longitude, latitude] }` — **ordre GeoJSON = [lon, lat]**,
  commenté (C2.2.3) — et passage à `usersRepo.create`.
- Aucun autre changement du flux (anti-élévation de rôle, hash Argon2id, unicité email inchangés).

### 3. Migration — `backend-core/src/database/migrations/<ts>-AddFreelanceLocationCheck.ts`
```sql
ALTER TABLE "users" ADD CONSTRAINT "CHK_users_freelance_location"
  CHECK (role <> 'FREELANCE' OR location IS NOT NULL)
```
- `down()` : `DROP CONSTRAINT`.
- Commentaire : décision D4 (pas de reprise, reset des bases dev le cas échéant).

### 4. Tests — `register.dto` + `auth.service.spec.ts` (fake repo, pattern existant)
1. Freelance + position valide → créé, `location` = Point GeoJSON `[lon, lat]` correctement ordonné.
2. Freelance sans position → 400 au DTO, le repo n'est jamais appelé.
3. Recruteur sans position → créé (Scénario 3 du ticket).
4. Recruteur avec position → créée et validée.
5. Bornes invalides (lat 91, lon 200, types non numériques) → 400.

### 5. Documentation
- Swagger : exemples `location` dans `RegisterDto` (C2.4.1).
- Ticket SH-34 : tracer D1–D6 (dont l'abandon du dilemme backfill/NOT VALID).
- Backlog : statut.

## Hors périmètre
- Émission `freelance.updated` (bus) — futur endpoint de mise à jour de position.
- Front (EP05) : formulaire carte/géoloc.
- Guard « profil incomplet » (option B écartée).
