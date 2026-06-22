# CLAUDE.md — backend-core (Monolithe NestJS)

> Contexte local. Hérite du `CLAUDE.md` racine — ici on ne décrit que les conventions **spécifiques au monolithe**.

## Rôle du service
Cœur transactionnel de SkillHunt : **IAM/Auth, Armurerie (Gear Locker), Certifications, Chat, CRUD profils**.
Node 20 · NestJS 10 · TypeScript strict · port **3001** · Swagger sur `/api/docs`.

## Organisation (pattern à respecter)
Une feature = un dossier sous `src/` contenant :
```
<feature>/
├── <feature>.controller.ts   # routes api/v1/<feature>, décorateurs Swagger
├── <feature>.service.ts       # logique métier, injecté via DI
├── <feature>.spec.ts          # tests Jest
└── dto/
    └── <action>.dto.ts        # validation class-validator + @ApiProperty
```
Déclarer chaque controller/service dans `app.module.ts`.

## Règles spécifiques
- **Routes** : toujours `@Controller('api/v1/<feature>')`.
- **Swagger obligatoire** : `@ApiTags` (avec emoji, cohérent avec l'existant), `@ApiOperation`, et `@ApiBearerAuth()` sur les routes protégées.
- **Validation** : chaque body a un DTO `class-validator`, avec messages d'erreur **en français** et exemples `@ApiProperty`. Le `ValidationPipe` global (`main.ts`) est en `whitelist + forbidNonWhitelisted + transform` — ne pas le contourner.
- **Auth/RBAC** : protéger via `@UseGuards(JwtAuthGuard)` puis `@UseGuards(new RolesGuard([UserRole.X]))`. Récupérer l'utilisateur **uniquement** via le décorateur `@CurrentUser()` — **jamais** un `userId` passé en body (anti-usurpation, OWASP).
- **Erreurs** : exceptions Nest (`UnauthorizedException`, `NotFoundException`, `ForbiddenException`…), messages utilisateur en français.
- **DI** : pas de `new Service()` manuel ; tout passe par le constructeur.

## Dette technique connue à résorber (placeholders)
Voir §5 du `CLAUDE.md` racine. En particulier dans ce service :
- `auth/token-store.service.ts` : registre des refresh tokens **en mémoire** → migrer vers **Redis** (SH-14) pour le TTL natif et le multi-instances.
- ✅ *Résolu (SH-6)* : persistance **PostgreSQL + PostGIS** réelle via **TypeORM**. `DbState` mémoire supprimé. Entités `users/user.entity.ts` (avec colonne `location` GEOGRAPHY(Point,4326)) et `gear/gear.entity.ts` ; config dans `database/data-source.ts` ; schéma versionné par migrations (`npm run migration:run`). Base de dev via `docker compose up -d` (Postgres+PostGIS sur le port hôte **5433**). MongoDB (NoSQL) reste à brancher.
- ✅ *Résolu (SH-7)* : hachage **Argon2id** réel, JWT **RS256** signés/vérifiés, `JwtAuthGuard` vérifie réellement la signature. Clés RSA chargées via `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (cf. `.env.example`), fallback éphémère en dev.
> Quand tu remplaces un placeholder : migre, n'étends pas. Ne copie jamais une signature/secret en dur.

## Commandes
```bash
npm ci
npm run start:dev    # hot reload → http://localhost:3001
npm run lint
npm run test
npm run build
```
