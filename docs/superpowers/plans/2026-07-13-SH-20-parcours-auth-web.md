# SH-20 — Parcours d'authentification Web — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un visiteur de créer un compte, se connecter et rester connecté (session restaurée au rechargement, access token rafraîchi automatiquement), afin de débloquer les écrans authentifiés du front (SH-21a).

**Architecture:** Le refresh token (7 j) quitte le body JSON pour un **cookie `httpOnly`** posé par `backend-core` — inaccessible au JavaScript, donc involable par XSS. L'access token (15 min) ne vit **qu'en mémoire** dans un store JS observable, injecté en `Authorization: Bearer` par un intercepteur Axios qui, sur `401`, déclenche un refresh **en vol unique** puis rejoue la requête. La rotation et la révocation Redis par `jti` (SH-7/SH-14) sont **inchangées** : seul le *transport* du refresh token évolue.

**Tech Stack:** NestJS 11 + Express (`cookie-parser`) · Jest · React 19 + React Router 7 + Axios · Vitest + RTL + **MSW**

**Spec de référence :** `docs/superpowers/specs/2026-07-13-SH-20-parcours-auth-web-design.md`
**Ticket :** `docs/tickets/SH-20-parcours-auth-web.md`
**Branche :** `feature/SH-20-parcours-auth-web` (déjà créée depuis `develop`)

## Global Constraints

- **Langue** : commentaires et textes UI **en français** ; identifiants **en anglais** (CLAUDE.md §7).
- **Aucun token en `localStorage`/`sessionStorage`** — jamais, sous aucun prétexte (décision §3 de la spec).
- **Aucun secret en dur** : tout par variable d'environnement.
- **Routes backend versionnées** : `api/v1/<feature>` ; **Swagger obligatoire** sur tout endpoint (`@ApiTags`, `@ApiOperation`, `@ApiResponse`).
- **Toute entrée validée** par DTO `class-validator` ; le `ValidationPipe` global est en `whitelist + forbidNonWhitelisted + transform` — ne pas le contourner.
- **Le décodage du JWT côté client sert à l'affichage et au routage UNIQUEMENT.** L'autorité reste la vérification de signature serveur. Ne jamais fonder une décision de sécurité dessus.
- **Deux nouvelles dépendances, validées** : `cookie-parser` (+ `@types/cookie-parser`) côté backend ; `msw` (dev) côté frontend.
- Commentaires de traçabilité RNCP là où c'est pertinent (ex. `// Anti-XSS : le refresh token reste hors de portée du JS (C2.2.3)`).
- **Ne pas commiter/pousser au-delà de ce que le plan demande** ; PR vers `develop` uniquement.

---

## Structure des fichiers

**backend-core**
| Fichier | Responsabilité |
|---|---|
| `src/common/cors.ts` *(créé)* | Résolution des origines CORS autorisées depuis l'env (pure, testable) |
| `src/common/cors.spec.ts` *(créé)* | Tests de la résolution CORS |
| `src/main.ts` *(modifié)* | Câblage : origines explicites + `cookie-parser` |
| `src/auth/refresh-cookie.ts` *(créé)* | Nom, chemin et attributs du cookie de refresh (source unique) |
| `src/auth/auth.controller.ts` *(modifié)* | Pose/lit/expire le cookie ; lit le token cookie **ou** body |
| `src/auth/dto/register.dto.ts` *(modifié)* | `RefreshDto.refreshToken` devient optionnel |
| `src/auth/auth.controller.spec.ts` *(créé)* | Tests du transport par cookie |
| `.env.example` *(modifié)* | `CORS_ORIGIN` |

**frontend-web**
| Fichier | Responsabilité |
|---|---|
| `src/test/server.ts` *(créé)* | Serveur MSW (simulation réseau des tests) |
| `src/setupTests.ts` *(modifié)* | Cycle de vie MSW |
| `src/features/auth/types.ts` *(créé)* | `AuthUser`, `UserRole` |
| `src/features/auth/token.ts` *(créé)* | Décodage du payload de l'access token (affichage seul) |
| `src/features/auth/session-store.ts` *(créé)* | Session **en mémoire**, observable hors React (l'intercepteur en a besoin) |
| `src/api/auth-interceptors.ts` *(créé)* | Injection du bearer + refresh *single-flight* + rejeu |
| `src/features/auth/AuthProvider.tsx` *(créé)* | Contexte React : restauration de session, `login`/`register`/`logout` |
| `src/features/auth/ProtectedRoute.tsx` *(créé)* | Garde de route + mémorisation de la route demandée |
| `src/pages/Login.tsx`, `src/pages/Register.tsx`, `src/pages/Account.tsx` *(créés)* | Écrans |
| `src/app/routes.tsx`, `src/app/providers.tsx`, `src/main.tsx`, `src/pages/Home.tsx` *(modifiés)* | Câblage |

---

## Task 1 : Origines CORS explicites (+ `cookie-parser`)

> **Pourquoi d'abord ?** `origin: '*'` **avec** `credentials: true` est rejeté par les navigateurs sur toute requête créditée. Tant que ce n'est pas corrigé, **aucun** appel authentifié du front ne peut aboutir. C'est le `TODO sécurité (SH-20)` laissé en SH-19.

**Files:**
- Create: `backend-core/src/common/cors.ts`
- Test: `backend-core/src/common/cors.spec.ts`
- Modify: `backend-core/src/main.ts:10-14`
- Modify: `backend-core/.env.example`

**Interfaces:**
- Produces: `resolveCorsOrigins(rawValue?: string): string[]`, `DEFAULT_CORS_ORIGIN: string`

- [ ] **Step 1: Installer `cookie-parser`** (utilisé dès la Task 2, on l'installe ici pour n'avoir qu'un seul passage sur `package.json`)

```bash
cd backend-core
npm install cookie-parser
npm install --save-dev @types/cookie-parser
```

- [ ] **Step 2: Écrire le test qui échoue**

Créer `backend-core/src/common/cors.spec.ts` :

```ts
import { resolveCorsOrigins, DEFAULT_CORS_ORIGIN } from './cors';

describe('resolveCorsOrigins', () => {
  it('retombe sur l\'origine de dev quand CORS_ORIGIN est absent ou vide', () => {
    expect(resolveCorsOrigins(undefined)).toEqual([DEFAULT_CORS_ORIGIN]);
    expect(resolveCorsOrigins('   ')).toEqual([DEFAULT_CORS_ORIGIN]);
  });

  it('accepte plusieurs origines séparées par des virgules', () => {
    expect(resolveCorsOrigins('https://app.skillhunt.io, https://admin.skillhunt.io')).toEqual([
      'https://app.skillhunt.io',
      'https://admin.skillhunt.io',
    ]);
  });

  // Garde-fou : '*' + credentials est rejeté par le navigateur ET ouvrirait l'API
  // à n'importe quelle origine. On échoue au démarrage plutôt qu'en production (C2.2.3).
  it('refuse le joker "*"', () => {
    expect(() => resolveCorsOrigins('*')).toThrow(/joker/i);
  });
});
```

- [ ] **Step 3: Lancer le test, vérifier qu'il échoue**

Run: `cd backend-core && npx jest src/common/cors.spec.ts`
Expected: FAIL — `Cannot find module './cors'`

- [ ] **Step 4: Implémenter**

Créer `backend-core/src/common/cors.ts` :

```ts
// Origine par défaut en développement : le serveur Vite du frontend-web.
export const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

/**
 * Résout la liste des origines autorisées à appeler l'API depuis un navigateur.
 *
 * Le joker '*' est INTERDIT : combiné à `credentials: true`, il est rejeté par les
 * navigateurs sur toute requête créditée (le front pose `withCredentials`), et il
 * exposerait l'API à n'importe quelle origine. Échouer au démarrage vaut mieux qu'une
 * faille silencieuse en production (C2.2.3).
 */
export function resolveCorsOrigins(rawValue?: string): string[] {
  const raw = (rawValue ?? '').trim();
  if (!raw) {
    return [DEFAULT_CORS_ORIGIN];
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes('*')) {
    throw new Error(
      'CORS_ORIGIN ne peut pas contenir le joker "*" : incompatible avec credentials:true et dangereux.',
    );
  }

  return origins;
}
```

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

Run: `cd backend-core && npx jest src/common/cors.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Câbler dans `main.ts`**

Remplacer le bloc `app.enableCors({...})` (lignes 9-14) et ajouter `cookie-parser` :

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { resolveCorsOrigins } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Lecture du cookie de refresh (httpOnly) déposé au login (SH-20)
  app.use(cookieParser());

  // CORS à origines EXPLICITES : '*' + credentials est rejeté par le navigateur (C2.2.3)
  app.enableCors({
    origin: resolveCorsOrigins(process.env.CORS_ORIGIN),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
```

(le reste de `bootstrap()` est inchangé)

- [ ] **Step 7: Documenter la variable d'environnement**

Ajouter à `backend-core/.env.example` :

```bash
# Origines autorisées à appeler l'API depuis un navigateur (séparées par des virgules).
# Le joker '*' est refusé au démarrage : incompatible avec les requêtes créditées (SH-20).
CORS_ORIGIN=http://localhost:5173
```

- [ ] **Step 8: Vérifier que rien n'est cassé**

Run: `cd backend-core && npm run lint && npm run test && npm run build`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend-core/package.json backend-core/package-lock.json backend-core/src/common/cors.ts backend-core/src/common/cors.spec.ts backend-core/src/main.ts backend-core/.env.example
git commit -m "feat(SH-20/backend): origines CORS explicites + cookie-parser

'origin: *' avec credentials:true est rejeté par les navigateurs sur requête
créditée : aucun appel authentifié du front ne pouvait aboutir. L'origine est
désormais lue dans CORS_ORIGIN, et le joker '*' échoue au démarrage.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 : Transport du refresh token par cookie `httpOnly`

**Files:**
- Create: `backend-core/src/auth/refresh-cookie.ts`
- Modify: `backend-core/src/auth/dto/register.dto.ts:44-49`
- Modify: `backend-core/src/auth/auth.controller.ts`
- Test: `backend-core/src/auth/auth.controller.spec.ts`

**Interfaces:**
- Consumes: `AuthService.login/refresh/logout` (inchangés), `TokenPair = { accessToken: string; refreshToken: string }`
- Produces: `REFRESH_COOKIE_NAME = 'sh_refresh'`, `refreshCookieOptions(isProduction: boolean): CookieOptions`, `clearRefreshCookieOptions(isProduction: boolean): CookieOptions`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `backend-core/src/auth/auth.controller.spec.ts` :

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE_NAME } from './refresh-cookie';

// Faux Response Express : on n'observe que ce qui nous intéresse — les cookies posés.
function makeResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

// Faux Request Express : `cookies` est peuplé par cookie-parser en vrai.
function makeRequest(cookies: Record<string, string> = {}) {
  return { cookies } as unknown as Request;
}

describe('AuthController — transport du refresh token (SH-20)', () => {
  let controller: AuthController;
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get<AuthController>(AuthController);
  });

  it('login dépose le refresh token dans un cookie httpOnly restreint aux routes d\'auth', async () => {
    authService.login.mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const res = makeResponse();

    const body = await controller.login({ email: 'a@b.io', password: 'motdepasse8' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'refresh-1',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
      }),
    );
    // Le body reste inchangé : le mobile (Lot 2) consomme le refresh token par cette voie.
    expect(body).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('refresh lit le token depuis le COOKIE quand le body est vide (parcours web)', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    const res = makeResponse();

    await controller.refresh(makeRequest({ [REFRESH_COOKIE_NAME]: 'refresh-1' }), {}, res);

    expect(authService.refresh).toHaveBeenCalledWith('refresh-1');
    // Rotation : le nouveau token remplace l'ancien dans le cookie.
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, 'refresh-2', expect.any(Object));
  });

  it('refresh accepte encore le token dans le BODY (parcours mobile, Lot 2)', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' });

    await controller.refresh(makeRequest(), { refreshToken: 'refresh-mobile' }, makeResponse());

    expect(authService.refresh).toHaveBeenCalledWith('refresh-mobile');
  });

  it('le cookie a la priorité sur le body', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    await controller.refresh(
      makeRequest({ [REFRESH_COOKIE_NAME]: 'depuis-cookie' }),
      { refreshToken: 'depuis-body' },
      makeResponse(),
    );

    expect(authService.refresh).toHaveBeenCalledWith('depuis-cookie');
  });

  it('refresh sans cookie NI body est rejeté en 401', async () => {
    await expect(controller.refresh(makeRequest(), {}, makeResponse())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('logout révoque le token et expire le cookie', async () => {
    authService.logout.mockResolvedValue({ success: true });
    const res = makeResponse();

    await controller.logout(makeRequest({ [REFRESH_COOKIE_NAME]: 'refresh-1' }), {}, res);

    expect(authService.logout).toHaveBeenCalledWith('refresh-1');
    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      expect.objectContaining({ path: '/api/v1/auth' }),
    );
  });

  it('logout sans aucun token reste idempotent (pas de 401) et expire quand même le cookie', async () => {
    const res = makeResponse();

    await expect(controller.logout(makeRequest(), {}, res)).resolves.toEqual({ success: true });
    expect(authService.logout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `cd backend-core && npx jest src/auth/auth.controller.spec.ts`
Expected: FAIL — `Cannot find module './refresh-cookie'`

- [ ] **Step 3: Créer les options du cookie**

Créer `backend-core/src/auth/refresh-cookie.ts` :

```ts
import type { CookieOptions } from 'express';

// Nom du cookie portant le refresh token (SH-20).
export const REFRESH_COOKIE_NAME = 'sh_refresh';

// Le cookie n'est envoyé QU'aux routes d'authentification : surface d'exposition minimale.
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

// Aligné sur le TTL du refresh token en Redis (7 jours, cf. auth.service.ts).
export const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Attributs du cookie de refresh.
 *
 * `httpOnly` est la raison d'être de ce cookie : le refresh token (7 jours) devient
 * INACCESSIBLE au JavaScript, donc involable par une XSS — contrairement au localStorage.
 * `sameSite: 'lax'` couvre le CSRF (front et API sur le même site). (C2.2.3)
 */
export function refreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction, // jamais en clair sur le réseau en production
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

/** Mêmes attributs sans `maxAge` : indispensable pour que le navigateur retrouve ET supprime le cookie. */
export function clearRefreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}
```

- [ ] **Step 4: Rendre `RefreshDto.refreshToken` optionnel**

Dans `backend-core/src/auth/dto/register.dto.ts`, remplacer la classe `RefreshDto` (lignes 44-49) :

```ts
export class RefreshDto {
  // Optionnel depuis SH-20 : le web transmet le refresh token par cookie httpOnly.
  // Le body reste supporté pour le mobile (Lot 2), où le cookie est inadapté.
  @ApiPropertyOptional({ description: 'Refresh token (JWT). Inutile pour le web : le cookie httpOnly fait foi.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le refresh token ne peut pas être vide' })
  refreshToken?: string;
}
```

Mettre à jour les imports en tête de fichier :

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, MinLength, IsIn, IsOptional } from 'class-validator';
```

- [ ] **Step 5: Réécrire le contrôleur**

Remplacer intégralement `backend-core/src/auth/auth.controller.ts` :

```ts
import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto } from './dto/register.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  clearRefreshCookieOptions,
} from './refresh-cookie';

@ApiTags('🔐 IAM - Authentification & Autorisation')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /** Dépose le refresh token dans un cookie httpOnly : hors de portée du JS (anti-XSS, C2.2.3). */
  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(this.isProduction));
  }

  /** Cookie prioritaire (web) ; body en repli (mobile, Lot 2). */
  private readRefreshToken(req: Request, dto?: RefreshDto): string | undefined {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    return fromCookie ?? dto?.refreshToken;
  }

  @Post('register')
  @ApiOperation({ summary: 'Inscription d\'un nouvel utilisateur (Freelance ou Recruteur)' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès (sans exposer le hash).' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authentification : access token dans le body, refresh token en cookie httpOnly' })
  @ApiResponse({ status: 200, description: 'Jetons JWT RS256 émis ; cookie `sh_refresh` déposé.' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    // Le body conserve le couple complet : le mobile (Lot 2) n'utilise pas les cookies.
    return tokens;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotation du refresh token (lu depuis le cookie, ou le body pour le mobile)' })
  @ApiResponse({ status: 200, description: 'Nouveau couple émis ; l\'ancien refresh token est révoqué.' })
  @ApiResponse({ status: 401, description: 'Refresh token absent, invalide, expiré ou révoqué.' })
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.readRefreshToken(req, dto);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token manquant');
    }

    const tokens = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(res, tokens.refreshToken); // rotation : le cookie porte le nouveau jeton
    return tokens;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion : révocation du refresh token (Redis) et expiration du cookie' })
  @ApiResponse({ status: 200, description: 'Refresh token révoqué (opération idempotente).' })
  async logout(
    @Req() req: Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.readRefreshToken(req, dto);

    // Idempotent : se déconnecter sans jeton n'est pas une erreur — mais on purge le cookie dans tous les cas.
    const result = refreshToken ? await this.authService.logout(refreshToken) : { success: true };

    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions(this.isProduction));
    return result;
  }
}
```

- [ ] **Step 6: Lancer les tests, vérifier qu'ils passent**

Run: `cd backend-core && npx jest src/auth/auth.controller.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Vérifier la non-régression de la suite complète**

Run: `cd backend-core && npm run lint && npm run test && npm run build`
Expected: PASS — en particulier `auth.service.spec.ts` (la rotation et la révocation Redis ne sont pas touchées).

- [ ] **Step 8: Commit**

```bash
git add backend-core/src/auth/
git commit -m "feat(SH-20/backend): refresh token transporté par cookie httpOnly

Le refresh token (7 jours) quitte le body pour un cookie httpOnly + SameSite=Lax,
restreint au chemin /api/v1/auth : une XSS ne peut plus l'exfiltrer. Le body reste
accepté pour le mobile (Lot 2). Rotation et révocation Redis inchangées.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 : Harnais MSW côté frontend

> **Pourquoi :** l'intercepteur Axios est la pièce la plus risquée du ticket (refresh concurrent, rejeu). Le tester sérieusement exige de simuler de vraies réponses HTTP — d'où MSW, qui intercepte au niveau réseau.

**Files:**
- Create: `frontend-web/src/test/server.ts`
- Modify: `frontend-web/src/setupTests.ts`

**Interfaces:**
- Produces: `server` (instance MSW `setupServer`), réutilisée par toutes les tâches front suivantes.

- [ ] **Step 1: Installer MSW**

```bash
cd frontend-web
npm install --save-dev msw
```

- [ ] **Step 2: Créer le serveur MSW**

Créer `frontend-web/src/test/server.ts` :

```ts
import { setupServer } from 'msw/node';

// Serveur de simulation réseau des tests (SH-20). Aucun handler par défaut :
// chaque test déclare les réponses qu'il attend via `server.use(...)`, ce qui rend
// visible tout appel HTTP non prévu (`onUnhandledRequest: 'error'`).
export const server = setupServer();
```

- [ ] **Step 3: Brancher le cycle de vie MSW**

Remplacer `frontend-web/src/setupTests.ts` :

```ts
// Étend les matchers Vitest avec ceux de jest-dom (toBeInTheDocument, etc.)
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './test/server';

// Tout appel HTTP non simulé fait échouer le test : on ne laisse passer aucune
// requête réseau involontaire (SH-20).
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 4: Vérifier que la suite existante passe toujours**

Run: `cd frontend-web && npm run test`
Expected: PASS — les tests SH-19/SH-38 existants ne font aucun appel réseau, ils ne sont donc pas affectés.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/package.json frontend-web/package-lock.json frontend-web/src/test/server.ts frontend-web/src/setupTests.ts
git commit -m "test(SH-20/frontend): harnais MSW pour simuler le réseau

Indispensable pour tester l'intercepteur de refresh au niveau HTTP réel.
onUnhandledRequest: 'error' fait échouer tout appel non simulé.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4 : Session en mémoire (store observable + décodage du token)

> **Pourquoi un store hors React :** l'intercepteur Axios n'est pas un composant — il ne peut pas lire un `useState`. Le store est donc un module JS observable, que React consomme via `useSyncExternalStore`. Une seule source de vérité, zéro duplication.

**Files:**
- Create: `frontend-web/src/features/auth/types.ts`
- Create: `frontend-web/src/features/auth/token.ts`
- Create: `frontend-web/src/features/auth/session-store.ts`
- Test: `frontend-web/src/features/auth/token.test.ts`
- Test: `frontend-web/src/features/auth/session-store.test.ts`

**Interfaces:**
- Produces:
  - `type UserRole = 'FREELANCE' | 'RECRUITER' | 'ADMIN'`
  - `interface AuthUser { userId: string; email: string; role: UserRole }`
  - `decodeAccessToken(token: string): AuthUser | null`
  - `sessionStore: { getAccessToken(): string | null; getUser(): AuthUser | null; setSession(token: string): void; clear(): void; subscribe(listener: () => void): () => void }`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `frontend-web/src/features/auth/token.test.ts` :

```ts
import { decodeAccessToken } from './token';

// Fabrique un JWT factice : seule la partie payload nous intéresse (on ne vérifie
// aucune signature côté client — c'est le rôle exclusif du serveur).
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

describe('decodeAccessToken', () => {
  it('extrait l\'identité du payload', () => {
    const token = fakeJwt({
      userId: 'u-1',
      email: 'pilote@skillhunt.io',
      role: 'FREELANCE',
      type: 'access',
    });

    expect(decodeAccessToken(token)).toEqual({
      userId: 'u-1',
      email: 'pilote@skillhunt.io',
      role: 'FREELANCE',
    });
  });

  it('renvoie null sur un token malformé', () => {
    expect(decodeAccessToken('pas-un-jwt')).toBeNull();
    expect(decodeAccessToken('a.b.c')).toBeNull();
  });

  it('renvoie null si le payload est incomplet', () => {
    expect(decodeAccessToken(fakeJwt({ userId: 'u-1' }))).toBeNull();
  });
});
```

Créer `frontend-web/src/features/auth/session-store.test.ts` :

```ts
import { sessionStore } from './session-store';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const token = fakeJwt({ userId: 'u-1', email: 'a@skillhunt.io', role: 'RECRUITER' });

describe('sessionStore', () => {
  afterEach(() => sessionStore.clear());

  it('mémorise le token et l\'identité décodée', () => {
    sessionStore.setSession(token);

    expect(sessionStore.getAccessToken()).toBe(token);
    expect(sessionStore.getUser()).toEqual({
      userId: 'u-1',
      email: 'a@skillhunt.io',
      role: 'RECRUITER',
    });
  });

  it('notifie ses abonnés à chaque changement', () => {
    const listener = vi.fn();
    const unsubscribe = sessionStore.subscribe(listener);

    sessionStore.setSession(token);
    sessionStore.clear();

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    sessionStore.setSession(token);
    expect(listener).toHaveBeenCalledTimes(2); // plus notifié après désabonnement
  });

  // Exigence non négociable de SH-20 : le token ne doit JAMAIS être persisté.
  it('n\'écrit RIEN dans localStorage ni sessionStorage', () => {
    sessionStore.setSession(token);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/features/auth`
Expected: FAIL — `Failed to resolve import './token'`

- [ ] **Step 3: Implémenter les types**

Créer `frontend-web/src/features/auth/types.ts` :

```ts
// Miroir de UserRole côté backend (backend-core/src/common/enums.ts).
export type UserRole = 'FREELANCE' | 'RECRUITER' | 'ADMIN';

// Identité de l'utilisateur connecté, telle que portée par le payload du JWT.
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
}
```

- [ ] **Step 4: Implémenter le décodage**

Créer `frontend-web/src/features/auth/token.ts` :

```ts
import type { AuthUser } from './types';

/**
 * Décode le payload d'un access token JWT.
 *
 * ⚠️ AUCUNE signature n'est vérifiée ici, et c'est volontaire : ce décodage sert
 * UNIQUEMENT à l'affichage et au routage côté client (afficher un email, masquer une
 * entrée de menu). L'autorité reste exclusivement le serveur, qui vérifie la signature
 * RS256 dans son JwtAuthGuard. Aucune décision de sécurité ne repose sur cette fonction. (C2.2.3)
 */
export function decodeAccessToken(token: string): AuthUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    // base64url → base64 avant décodage
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as Partial<AuthUser>;

    if (!payload.userId || !payload.email || !payload.role) {
      return null;
    }

    return { userId: payload.userId, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Implémenter le store**

Créer `frontend-web/src/features/auth/session-store.ts` :

```ts
import { decodeAccessToken } from './token';
import type { AuthUser } from './types';

/**
 * Session courante, EN MÉMOIRE UNIQUEMENT (SH-20).
 *
 * Rien n'est écrit dans localStorage/sessionStorage : l'access token disparaît avec
 * l'onglet. La persistance de la session est assurée par le cookie httpOnly du refresh
 * token, que le JavaScript ne peut pas lire (anti-XSS, C2.2.3).
 *
 * Store hors React : l'intercepteur Axios n'est pas un composant et doit pouvoir lire
 * le token. React s'y abonne via useSyncExternalStore.
 */
let accessToken: string | null = null;
let currentUser: AuthUser | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export const sessionStore = {
  getAccessToken: (): string | null => accessToken,

  getUser: (): AuthUser | null => currentUser,

  setSession(token: string): void {
    accessToken = token;
    currentUser = decodeAccessToken(token);
    emit();
  },

  clear(): void {
    accessToken = null;
    currentUser = null;
    emit();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
```

- [ ] **Step 6: Lancer les tests, vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/features/auth`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/features/auth/
git commit -m "feat(SH-20/frontend): session en mémoire + décodage de l'access token

Store observable hors React (l'intercepteur Axios n'est pas un composant).
Aucune écriture dans localStorage — un test le vérifie explicitement.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5 : Intercepteurs Axios — bearer, refresh *single-flight*, rejeu

> ⚠️ **Le cœur du risque de ce ticket.** Si deux requêtes prennent un `401` en même temps et déclenchent chacune une rotation, la seconde rotation **révoque le jeton produit par la première** : l'utilisateur est déconnecté sans raison. D'où le refresh *en vol unique*.

**Files:**
- Create: `frontend-web/src/api/auth-interceptors.ts`
- Test: `frontend-web/src/api/auth-interceptors.test.ts`

**Interfaces:**
- Consumes: `apiClient` (`@/api/client`), `sessionStore` (Task 4)
- Produces: `installAuthInterceptors(): void` (idempotente), `REFRESH_ENDPOINT = '/api/v1/auth/refresh'`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `frontend-web/src/api/auth-interceptors.test.ts` :

```ts
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { apiClient, DEFAULT_API_URL } from './client';
import { installAuthInterceptors } from './auth-interceptors';
import { sessionStore } from '@/features/auth/session-store';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const OLD_TOKEN = fakeJwt({ userId: 'u-1', email: 'a@skillhunt.io', role: 'FREELANCE' });
const NEW_TOKEN = fakeJwt({ userId: 'u-1', email: 'a@skillhunt.io', role: 'FREELANCE' });

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

beforeAll(() => installAuthInterceptors());
afterEach(() => sessionStore.clear());

describe('intercepteurs d\'authentification (SH-20)', () => {
  it('injecte le bearer quand la session est active', async () => {
    sessionStore.setSession(OLD_TOKEN);
    let seen: string | null = null;

    server.use(
      http.get(url('/api/v1/gear/me'), ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({ items: [] });
      }),
    );

    await apiClient.get('/api/v1/gear/me');

    expect(seen).toBe(`Bearer ${OLD_TOKEN}`);
  });

  it('n\'injecte aucun bearer sans session', async () => {
    let seen: string | null = 'sentinelle';

    server.use(
      http.get(url('/api/v1/public'), ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiClient.get('/api/v1/public');

    expect(seen).toBeNull();
  });

  it('sur 401 : rafraîchit le token puis REJOUE la requête initiale', async () => {
    sessionStore.setSession(OLD_TOKEN);
    let attempt = 0;

    server.use(
      http.post(url('/api/v1/auth/refresh'), () =>
        HttpResponse.json({ accessToken: NEW_TOKEN, refreshToken: 'ignoré-par-le-web' }),
      ),
      http.get(url('/api/v1/gear/me'), ({ request }) => {
        attempt += 1;
        // Le 1er appel porte l'ancien token → 401 ; le rejeu doit porter le nouveau.
        if (request.headers.get('authorization') === `Bearer ${NEW_TOKEN}`) {
          return HttpResponse.json({ items: ['drone'] });
        }
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const response = await apiClient.get<{ items: string[] }>('/api/v1/gear/me');

    expect(response.data).toEqual({ items: ['drone'] });
    expect(attempt).toBe(2); // appel initial + rejeu
    expect(sessionStore.getAccessToken()).toBe(NEW_TOKEN);
  });

  it('sur 401 CONCURRENTS : un SEUL appel à /auth/refresh (single-flight)', async () => {
    sessionStore.setSession(OLD_TOKEN);
    let refreshCalls = 0;

    server.use(
      http.post(url('/api/v1/auth/refresh'), () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: NEW_TOKEN, refreshToken: 'r' });
      }),
      http.get(url('/api/v1/gear/me'), ({ request }) =>
        request.headers.get('authorization') === `Bearer ${NEW_TOKEN}`
          ? HttpResponse.json({ ok: true })
          : new HttpResponse(null, { status: 401 }),
      ),
    );

    await Promise.all([
      apiClient.get('/api/v1/gear/me'),
      apiClient.get('/api/v1/gear/me'),
      apiClient.get('/api/v1/gear/me'),
    ]);

    // Sans single-flight : 3 rotations, dont 2 révoquent le jeton des autres → déconnexion.
    expect(refreshCalls).toBe(1);
  });

  it('si le refresh échoue : la session est purgée et l\'erreur remonte', async () => {
    sessionStore.setSession(OLD_TOKEN);

    server.use(
      http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })),
      http.get(url('/api/v1/gear/me'), () => new HttpResponse(null, { status: 401 })),
    );

    await expect(apiClient.get('/api/v1/gear/me')).rejects.toBeDefined();
    expect(sessionStore.getAccessToken()).toBeNull();
    expect(sessionStore.getUser()).toBeNull();
  });

  it('un 401 sur /auth/refresh lui-même ne déclenche pas de boucle', async () => {
    let refreshCalls = 0;

    server.use(
      http.post(url('/api/v1/auth/refresh'), () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(apiClient.post('/api/v1/auth/refresh', {})).rejects.toBeDefined();

    expect(refreshCalls).toBe(1); // pas de rappel récursif
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/api/auth-interceptors.test.ts`
Expected: FAIL — `Failed to resolve import './auth-interceptors'`

- [ ] **Step 3: Implémenter les intercepteurs**

Créer `frontend-web/src/api/auth-interceptors.ts` :

```ts
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { apiClient } from './client';
import { sessionStore } from '@/features/auth/session-store';

export const REFRESH_ENDPOINT = '/api/v1/auth/refresh';

// Marque une requête déjà rejouée : on ne rejoue jamais deux fois (anti-boucle).
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

interface RefreshResponse {
  accessToken: string;
}

// Refresh EN VOL UNIQUE (single-flight).
//
// Si N requêtes prennent un 401 simultanément et déclenchent chacune une rotation,
// chaque rotation révoque le jeton de la précédente (le backend révoque l'ancien jti) :
// l'utilisateur se retrouve déconnecté sans raison. On partage donc UNE seule promesse.
let refreshPromise: Promise<string> | null = null;

function refreshOnce(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      // Body vide : le refresh token voyage dans le cookie httpOnly (SH-20).
      .post<RefreshResponse>(REFRESH_ENDPOINT, {})
      .then((response) => {
        sessionStore.setSession(response.data.accessToken);
        return response.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

let installed = false;

/** Idempotente : un double appel (React StrictMode) n'empile pas les intercepteurs. */
export function installAuthInterceptors(): void {
  if (installed) {
    return;
  }
  installed = true;

  // Requête : injection du bearer quand une session est active.
  apiClient.interceptors.request.use((config) => {
    const token = sessionStore.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Réponse : sur 401, rafraîchir puis rejouer une seule fois.
  apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as RetriableConfig | undefined;

      const isRefreshCall = config?.url === REFRESH_ENDPOINT;
      if (error.response?.status !== 401 || !config || config._retried || isRefreshCall) {
        return Promise.reject(error);
      }

      config._retried = true;

      try {
        await refreshOnce();
        // Le rejeu repasse par l'intercepteur de requête → il portera le NOUVEAU token.
        return await apiClient(config);
      } catch (refreshError) {
        // Refresh expiré ou révoqué : la session est morte. ProtectedRoute redirigera
        // vers /login en réaction au store vidé (pas de couplage au routeur ici).
        sessionStore.clear();
        return Promise.reject(refreshError);
      }
    },
  );
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/api/auth-interceptors.test.ts`
Expected: PASS (6 tests) — en particulier `refreshCalls === 1` sur les 401 concurrents.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/api/auth-interceptors.ts frontend-web/src/api/auth-interceptors.test.ts
git commit -m "feat(SH-20/frontend): intercepteurs Axios (bearer + refresh single-flight)

Sur 401, un seul refresh est émis même si N requêtes échouent simultanément :
N rotations parallèles se révoqueraient mutuellement et déconnecteraient
l'utilisateur. La requête initiale est ensuite rejouée une seule fois.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6 : `AuthProvider` — restauration de session, login, register, logout

**Files:**
- Create: `frontend-web/src/features/auth/AuthProvider.tsx`
- Create: `frontend-web/src/features/auth/useAuth.ts`
- Test: `frontend-web/src/features/auth/AuthProvider.test.tsx`
- Modify: `frontend-web/src/app/providers.tsx`
- Modify: `frontend-web/src/main.tsx`

**Interfaces:**
- Consumes: `sessionStore`, `installAuthInterceptors`, `apiClient`
- Produces:
  - `AuthProvider({ children }: { children: ReactNode })`
  - `useAuth(): { user: AuthUser | null; status: 'restoring' | 'ready'; login(email: string, password: string): Promise<void>; register(input: RegisterInput): Promise<void>; logout(): Promise<void> }`
  - `interface RegisterInput { email: string; username: string; password: string; role: 'FREELANCE' | 'RECRUITER' }`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `frontend-web/src/features/auth/AuthProvider.test.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import { sessionStore } from './session-store';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const TOKEN = fakeJwt({ userId: 'u-1', email: 'pilote@skillhunt.io', role: 'FREELANCE' });
const url = (path: string) => `${DEFAULT_API_URL}${path}`;

// Sonde : affiche l'état de la session et permet de déclencher les actions.
function Probe() {
  const { user, status, login, logout } = useAuth();

  if (status === 'restoring') {
    return <p>Restauration de la session…</p>;
  }

  return (
    <div>
      <p>{user ? `Connecté : ${user.email}` : 'Déconnecté'}</p>
      <button onClick={() => login('pilote@skillhunt.io', 'motdepasse8')}>Se connecter</button>
      <button onClick={() => logout()}>Se déconnecter</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

afterEach(() => sessionStore.clear());

describe('AuthProvider (SH-20)', () => {
  it('restaure la session au démarrage grâce au cookie de refresh', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () =>
        HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
      ),
    );

    renderProbe();

    // Un état de chargement est affiché tant que la restauration est en vol :
    // sans lui, les routes protégées redirigeraient vers /login à chaque F5.
    expect(screen.getByText('Restauration de la session…')).toBeInTheDocument();

    expect(await screen.findByText('Connecté : pilote@skillhunt.io')).toBeInTheDocument();
  });

  it('reste déconnecté quand aucun cookie valide n\'existe', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })),
    );

    renderProbe();

    expect(await screen.findByText('Déconnecté')).toBeInTheDocument();
  });

  it('ouvre une session au login', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })),
      http.post(url('/api/v1/auth/login'), () =>
        HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
      ),
    );

    renderProbe();
    await screen.findByText('Déconnecté');

    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('Connecté : pilote@skillhunt.io')).toBeInTheDocument();
  });

  it('purge la session au logout et appelle le backend (révocation Redis)', async () => {
    let logoutCalled = false;

    server.use(
      http.post(url('/api/v1/auth/refresh'), () =>
        HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
      ),
      http.post(url('/api/v1/auth/logout'), () => {
        logoutCalled = true;
        return HttpResponse.json({ success: true });
      }),
    );

    renderProbe();
    await screen.findByText('Connecté : pilote@skillhunt.io');

    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByText('Déconnecté')).toBeInTheDocument();
    await waitFor(() => expect(logoutCalled).toBe(true));
    expect(sessionStore.getAccessToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/features/auth/AuthProvider.test.tsx`
Expected: FAIL — `Failed to resolve import './AuthProvider'`

- [ ] **Step 3: Créer le contexte et le hook**

Créer `frontend-web/src/features/auth/useAuth.ts` :

```ts
import { createContext, useContext } from 'react';
import type { AuthUser } from './types';

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  role: 'FREELANCE' | 'RECRUITER';
}

export interface AuthContextValue {
  user: AuthUser | null;
  // 'restoring' : le refresh silencieux du démarrage est en vol.
  status: 'restoring' | 'ready';
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l\'intérieur d\'un <AuthProvider>.');
  }
  return context;
}
```

- [ ] **Step 4: Implémenter le provider**

Créer `frontend-web/src/features/auth/AuthProvider.tsx` :

```tsx
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { apiClient } from '@/api/client';
import { installAuthInterceptors } from '@/api/auth-interceptors';
import { sessionStore } from './session-store';
import { AuthContext, type AuthContextValue, type RegisterInput } from './useAuth';

interface TokenPair {
  accessToken: string;
  // Présent dans le body pour le mobile (Lot 2) ; le web l'ignore — il vit dans le cookie httpOnly.
  refreshToken: string;
}

// Les intercepteurs doivent être en place avant le tout premier appel (la restauration
// de session ci-dessous en est un). La fonction est idempotente.
installAuthInterceptors();

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(sessionStore.subscribe, sessionStore.getUser);
  const [status, setStatus] = useState<'restoring' | 'ready'>('restoring');

  // Restauration de session : l'access token n'a pas survécu au rechargement (mémoire),
  // mais le cookie de refresh, lui, est toujours là. On tente donc un refresh silencieux.
  useEffect(() => {
    let cancelled = false;

    apiClient
      .post<TokenPair>('/api/v1/auth/refresh', {})
      .then((response) => {
        if (!cancelled) {
          sessionStore.setSession(response.data.accessToken);
        }
      })
      .catch(() => {
        // Pas de cookie, ou refresh expiré/révoqué : simple visiteur non connecté.
        sessionStore.clear();
      })
      .finally(() => {
        if (!cancelled) {
          setStatus('ready');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiClient.post<TokenPair>('/api/v1/auth/login', { email, password });
    sessionStore.setSession(response.data.accessToken);
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      // `register` ne renvoie aucun token : on enchaîne le login pour que l'utilisateur
      // arrive directement connecté (décision de design SH-20).
      await apiClient.post('/api/v1/auth/register', input);
      await login(input.email, input.password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      // Body vide : le refresh token est dans le cookie. Révoque le jti en Redis.
      await apiClient.post('/api/v1/auth/logout', {});
    } finally {
      // La session locale est purgée même si l'appel réseau échoue.
      sessionStore.clear();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 5: Lancer les tests, vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/features/auth/AuthProvider.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Brancher le provider dans l'app**

Remplacer `frontend-web/src/app/providers.tsx` :

```tsx
import { type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/AuthProvider';

// Fournit les providers globaux du frontend (SH-19). TanStack Query + session d'auth (SH-20).
export function AppProviders({ children }: { children: ReactNode }) {
  // useState garantit un QueryClient stable sur toute la vie du composant.
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 7: Vérifier que `AppProviders` enveloppe bien le routeur**

Ouvrir `frontend-web/src/main.tsx` et confirmer que `<App />` est bien rendu à l'intérieur de `<AppProviders>`. Si ce n'est pas le cas, l'y placer :

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
```

- [ ] **Step 8: Vérifier la suite complète**

Run: `cd frontend-web && npm run lint && npm run test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add frontend-web/src/features/auth/ frontend-web/src/app/providers.tsx frontend-web/src/main.tsx
git commit -m "feat(SH-20/frontend): AuthProvider (restauration de session, login, register, logout)

Au démarrage, un refresh silencieux restaure la session : l'access token vit en
mémoire et ne survit pas au rechargement, contrairement au cookie httpOnly.
Un état 'restoring' évite que les routes protégées ne redirigent vers /login
avant que la session soit rétablie. L'inscription enchaîne un login automatique.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7 : Écrans, route protégée et câblage du routeur

**Files:**
- Create: `frontend-web/src/features/auth/ProtectedRoute.tsx`
- Create: `frontend-web/src/pages/Login.tsx`
- Create: `frontend-web/src/pages/Register.tsx`
- Create: `frontend-web/src/pages/Account.tsx`
- Test: `frontend-web/src/features/auth/ProtectedRoute.test.tsx`
- Test: `frontend-web/src/pages/Login.test.tsx`
- Modify: `frontend-web/src/app/routes.tsx`
- Modify: `frontend-web/src/pages/Home.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 6)
- Produces: `ProtectedRoute({ children }: { children: ReactNode })`, pages `Login`, `Register`, `Account`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `frontend-web/src/features/auth/ProtectedRoute.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';
import { sessionStore } from './session-store';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const TOKEN = fakeJwt({ userId: 'u-1', email: 'pilote@skillhunt.io', role: 'FREELANCE' });
const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>Écran de connexion</p>} />
          <Route
            path="/mon-compte"
            element={
              <ProtectedRoute>
                <p>Contenu protégé</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => sessionStore.clear());

describe('ProtectedRoute (SH-20)', () => {
  it('redirige un visiteur non authentifié vers /login', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })),
    );

    renderAt('/mon-compte');

    expect(await screen.findByText('Écran de connexion')).toBeInTheDocument();
    expect(screen.queryByText('Contenu protégé')).not.toBeInTheDocument();
  });

  it('laisse passer un utilisateur authentifié', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () =>
        HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' }),
      ),
    );

    renderAt('/mon-compte');

    expect(await screen.findByText('Contenu protégé')).toBeInTheDocument();
  });

  it('ne redirige PAS tant que la session est en cours de restauration', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), async () => {
        // Réponse lente : on veut observer l'état intermédiaire.
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ accessToken: TOKEN, refreshToken: 'r' });
      }),
    );

    renderAt('/mon-compte');

    // Le piège : sans état 'restoring', l'utilisateur serait éjecté vers /login à chaque F5.
    expect(screen.queryByText('Écran de connexion')).not.toBeInTheDocument();
    expect(await screen.findByText('Contenu protégé')).toBeInTheDocument();
  });
});
```

Créer `frontend-web/src/pages/Login.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { sessionStore } from '@/features/auth/session-store';
import Login from './Login';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  server.use(
    http.post(url('/api/v1/auth/refresh'), () => new HttpResponse(null, { status: 401 })),
  );
});
afterEach(() => sessionStore.clear());

describe('Écran de connexion (SH-20)', () => {
  it('affiche un message d\'erreur en français sur identifiants invalides', async () => {
    server.use(
      http.post(url('/api/v1/auth/login'), () => new HttpResponse(null, { status: 401 })),
    );

    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email'), 'pilote@skillhunt.io');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'mauvaispass');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    // Message volontairement générique : ne révèle pas si l'email existe (anti-énumération).
    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou mot de passe incorrect');
  });

  it('refuse un mot de passe trop court sans appeler le backend', async () => {
    // Aucun handler /login : si le formulaire appelait le backend, MSW ferait échouer le test.
    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email'), 'pilote@skillhunt.io');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'court');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('au moins 8 caractères');
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/features/auth/ProtectedRoute.test.tsx src/pages/Login.test.tsx`
Expected: FAIL — modules `./ProtectedRoute` et `./Login` introuvables

- [ ] **Step 3: Implémenter la route protégée**

Créer `frontend-web/src/features/auth/ProtectedRoute.tsx` :

```tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

/**
 * Garde de route (SH-20).
 *
 * ⚠️ Il s'agit d'une garde d'ERGONOMIE, pas d'une garde de sécurité : la vraie
 * protection est le JwtAuthGuard du backend, qui vérifie la signature RS256. Elle évite
 * juste d'afficher un écran vide à un visiteur non connecté.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();

  // Tant que le refresh silencieux du démarrage est en vol, on ne conclut RIEN :
  // rediriger maintenant éjecterait l'utilisateur vers /login à chaque rechargement.
  if (status === 'restoring') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement de votre session…</p>
      </main>
    );
  }

  if (!user) {
    // `state.from` permet de revenir sur la route demandée après connexion.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Implémenter l'écran de connexion**

Créer `frontend-web/src/pages/Login.tsx` :

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Route d'origine mémorisée par ProtectedRoute, sinon l'accueil.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Validation client en miroir du DTO backend — confort d'UX seulement :
    // le backend reste l'autorité (ValidationPipe global).
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      // Message générique : ne révèle pas si l'email existe (anti-énumération de comptes).
      setError('Email ou mot de passe incorrect.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold">Connexion</h1>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
            className="rounded-md border px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
            className="rounded-md border px-3 py-2"
          />
        </div>

        {error && (
          <p id="login-error" role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting}>
          Se connecter
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Pas encore de compte ? <Link to="/register" className="underline">Créer un compte</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Implémenter l'écran d'inscription**

Créer `frontend-web/src/pages/Register.tsx` :

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

// ADMIN est volontairement absent : il n'est pas auto-attribuable (cf. SELF_ASSIGNABLE_ROLES backend).
const ROLES = [
  { value: 'FREELANCE', label: 'Freelance' },
  { value: 'RECRUITER', label: 'Recruteur' },
] as const;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'FREELANCE' | 'RECRUITER'>('FREELANCE');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }

    setSubmitting(true);
    try {
      // `register` enchaîne automatiquement le login : l'utilisateur arrive connecté.
      await register({ email, username, password, role });
      navigate('/mon-compte', { replace: true });
    } catch {
      setError('Inscription impossible. Cet email est peut-être déjà utilisé.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold">Créer un compte</h1>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error ? 'register-error' : undefined}
            className="rounded-md border px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="username">Nom d'utilisateur</label>
          <input
            id="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="rounded-md border px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={error ? 'register-error' : undefined}
            className="rounded-md border px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="role">Je suis</label>
          <select
            id="role"
            value={role}
            onChange={(event) => setRole(event.target.value as 'FREELANCE' | 'RECRUITER')}
            className="rounded-md border px-3 py-2"
          >
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p id="register-error" role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting}>
          Créer mon compte
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Déjà inscrit ? <Link to="/login" className="underline">Se connecter</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Implémenter la page protégée « Mon compte »**

Créer `frontend-web/src/pages/Account.tsx` :

```tsx
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

// Première page protégée du front (SH-20). Elle sert de preuve de bout en bout du
// parcours d'authentification, en attendant les écrans métier (Armurerie, SH-21a).
export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold">Mon compte</h1>
      <p>{user?.email}</p>
      <p className="text-muted-foreground text-sm tracking-widest uppercase">{user?.role}</p>
      <Button onClick={handleLogout}>Se déconnecter</Button>
    </main>
  );
}
```

- [ ] **Step 7: Câbler les routes**

Remplacer `frontend-web/src/app/routes.tsx` :

```tsx
import { type RouteObject } from 'react-router-dom';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Account from '@/pages/Account';
import NotFound from '@/pages/NotFound';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';

// Table de routes (SH-19). Module sans effet de bord : les tests l'importent sans
// construire de router browser-history (SH-38).
export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    path: '/mon-compte',
    element: (
      <ProtectedRoute>
        <Account />
      </ProtectedRoute>
    ),
  },
  { path: '*', element: <NotFound /> },
];
```

- [ ] **Step 8: Donner un point d'entrée depuis l'accueil**

Remplacer `frontend-web/src/pages/Home.tsx` :

```tsx
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

// Page d'accueil (SH-19), enrichie de l'état de session (SH-20).
export default function Home() {
  const { user } = useAuth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">SkillHunt</h1>
      <p className="text-muted-foreground">Plateforme de recrutement technique de niche</p>

      {user ? (
        <Button asChild>
          <Link to="/mon-compte">Mon compte</Link>
        </Button>
      ) : (
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/login">Se connecter</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">Créer un compte</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
```

⚠️ `Home` consomme désormais `useAuth()` : le test existant `src/app/router.test.tsx` (SH-38) doit envelopper le rendu dans `<AuthProvider>` et simuler `/api/v1/auth/refresh` (401), sinon il échouera. Adapter ce test au besoin en suivant le pattern de `Login.test.tsx`.

- [ ] **Step 9: Lancer toute la suite front**

Run: `cd frontend-web && npm run lint && npm run test`
Expected: PASS — corriger `router.test.tsx` si nécessaire (cf. Step 8).

- [ ] **Step 10: Formater et vérifier le build**

Run: `cd frontend-web && npm run format && npm run format:check && npm run build`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add frontend-web/src/
git commit -m "feat(SH-20/frontend): écrans login/register, route protégée, déconnexion

L'inscription enchaîne un login automatique. ProtectedRoute mémorise la route
demandée et attend la fin de la restauration de session avant de conclure.
Messages d'erreur génériques : pas d'énumération de comptes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8 : Documentation, backlog et vérification de bout en bout

**Files:**
- Modify: `frontend-web/CLAUDE.md`
- Modify: `backend-core/CLAUDE.md`
- Modify: `docs/BACKLOG.md`
- Create: `docs/tickets/SH-40-2fa-comptes-pro.md`

- [ ] **Step 1: Vérifier le parcours réel dans un navigateur**

Les tests ne prouvent pas que le **cookie** fonctionne vraiment de bout en bout (MSW simule le réseau, il ne rejoue pas la politique de cookies d'un navigateur). Cette vérification manuelle est **obligatoire** :

```bash
# Terminal 1
cd backend-core && docker compose up -d && npm run start:dev
# Terminal 2
cd frontend-web && npm run dev
```

Dans le navigateur, sur http://localhost:5173 :
1. Créer un compte → on doit arriver **connecté** sur `/mon-compte`.
2. Onglet **Application → Cookies** : vérifier la présence de `sh_refresh`, avec **HttpOnly ✅**, `SameSite=Lax`, `Path=/api/v1/auth`.
3. Console : `localStorage.length` doit valoir **0**.
4. **Recharger la page (F5)** : la session doit être **restaurée** (pas de redirection vers `/login`).
5. Se déconnecter → le cookie `sh_refresh` doit **disparaître**, et `/mon-compte` doit rediriger vers `/login`.

- [ ] **Step 2: Créer le ticket 2FA (dette assumée)**

La 2FA était annoncée au backlog dans SH-20 ; elle en a été **sortie** faute de brique backend. Créer `docs/tickets/SH-40-2fa-comptes-pro.md` pour ne pas la perdre : TOTP côté NestJS (secret **chiffré AES-256 au repos**, cf. CLAUDE.md §8), endpoints d'enrôlement et de vérification, puis l'UI. Statut 🔵 Backlog, compétences C2.2.3 / C2.2.2.

- [ ] **Step 3: Mettre à jour les CLAUDE.md locaux**

`frontend-web/CLAUDE.md` — ajouter aux règles spécifiques :

```markdown
- **Auth (SH-20)** : l'access token vit **en mémoire** (`features/auth/session-store.ts`), le refresh token dans un **cookie `httpOnly`** posé par le backend. **Ne jamais écrire un token dans `localStorage`/`sessionStorage`.** Les appels authentifiés passent par `apiClient`, dont les intercepteurs injectent le bearer et rafraîchissent le token (single-flight) — ne pas les court-circuiter.
- **Tests réseau** : MSW (`src/test/server.ts`). `onUnhandledRequest: 'error'` — tout appel HTTP non simulé fait échouer le test.
```

`backend-core/CLAUDE.md` — ajouter à la section « Dette technique connue » :

```markdown
- ✅ *Résolu (SH-20)* : CORS à **origines explicites** (`CORS_ORIGIN`, joker `*` refusé au démarrage) et refresh token transporté par **cookie `httpOnly`** (`auth/refresh-cookie.ts`). Le body reste accepté pour le mobile (Lot 2).
```

- [ ] **Step 4: Mettre à jour le backlog**

Dans `docs/BACKLOG.md` : passer **SH-20** à 🟢 Terminé, ajouter **SH-40** (2FA, 🔵 Backlog) dans EP02, et signaler dans « Prochaines actions » que **SH-21a est débloqué**.

- [ ] **Step 5: Vérification finale des deux services**

Run:
```bash
cd backend-core && npm run lint && npm run test && npm run build
cd ../frontend-web && npm run lint && npm run format:check && npm run test && npm run build
```
Expected: tout PASS. **Ne pas déclarer le travail terminé sans avoir vu ces sorties vertes.**

- [ ] **Step 6: Commit et PR**

```bash
git add docs/ frontend-web/CLAUDE.md backend-core/CLAUDE.md
git commit -m "docs(SH-20): conventions d'auth, ticket 2FA (SH-40), backlog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push -u origin feature/SH-20-parcours-auth-web
```

Ouvrir une PR vers **`develop`** (jamais `main`), en documentant : la décision cookie `httpOnly` vs `localStorage`, le piège du refresh concurrent, et le résultat de la vérification navigateur du Step 1.

---

## Couverture de la spec

| Exigence de la spec | Tâche |
|---|---|
| §4.1 CORS à origine explicite | Task 1 |
| §4.2 Cookie `httpOnly`/`Secure`/`SameSite`/`path`/`maxAge` | Task 2 |
| §4.3 Lecture cookie **ou** body ; 401 si aucun | Task 2 |
| §5.1 Session en mémoire, aucun `localStorage` | Task 4 (test dédié) |
| §5.1 Identité par décodage du token (affichage seul) | Task 4 |
| §5.2 Bearer + refresh single-flight + rejeu + anti-boucle | Task 5 |
| §5.3 Restauration de session + état de chargement | Task 6 (+ Task 7 pour `ProtectedRoute`) |
| §5.4 Écrans, `ProtectedRoute`, login auto après register, logout | Task 7 |
| §5.5 Validation client miroir, messages FR, `aria-describedby` | Task 7 |
| §6 Tests backend et frontend | Tasks 1, 2, 4, 5, 6, 7 |
| §7 2FA reportée → ticket dédié | Task 8 |
