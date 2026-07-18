# SH-21c — Gamification de l'Armurerie : XP, niveaux, badges, loadout

> Design validé le 2026-07-17 (session de brainstorming). Fait foi pour l'implémentation de SH-21c,
> troisième et dernière tranche de SH-21 (après 21a vue privée et 21b vue publique).
> Décisions structurantes actées avec l'utilisatrice : gamification complète, XP **dérivé à la
> lecture** (pas de ledger), sources d'XP = **matériel validé + certifications validées**,
> loadout **4 slots / VALIDATED uniquement**, catalogue de **7 badges dérivés**.

## 1. Objectif produit

Le KPI de SH-21 est le **taux de complétion du casier** : la qualité de la donnée Armurerie
alimente directement le matching (R10). La gamification récompense donc exclusivement ce qui
améliore la **preuve vérifiée** : un équipement *validé par l'admin* rapporte, un équipement
simplement déclaré, non (aucune récompense au spam de déclarations).

## 2. Modèle de calcul (backend, dérivé à la lecture)

**Aucune persistance nouvelle pour l'XP** : un service calcule tout à la demande depuis la
donnée existante. Zéro migration XP, zéro dérive, idempotent, trivial à tester (C2.2.2).

### Barème XP
| Source | XP |
|---|---|
| Équipement `VALIDATED` | **50** chacun |
| Catégorie couverte (≥ 1 équipement validé dans la catégorie) | **30** chacune |
| Certification `VALIDATED` (SH-10) | **80** chacune |

### Niveaux (seuils fixes, thème HUD tactique)
| Seuil XP | Niveau | Libellé |
|---|---|---|
| 0 | 1 | Recrue |
| 100 | 2 | Opérateur |
| 250 | 3 | Spécialiste |
| 450 | 4 | Vétéran |
| 700 | 5 | Élite |
| 1000 | 6 | Légende |

La réponse expose `nextLevelAt` (seuil suivant, `null` au niveau 6) pour la barre de
progression front.

### Badges (catalogue statique typé, tous dérivés)
| id | Libellé | Condition |
|---|---|---|
| `first-validated` | Première validation | ≥ 1 équipement validé |
| `arsenal-5` | Arsenal étoffé | ≥ 5 équipements validés |
| `arsenal-10` | Arsenal d'élite | ≥ 10 équipements validés |
| `polyvalent` | Polyvalent | ≥ 3 catégories couvertes |
| `certified` | Certifié | ≥ 1 certification validée |
| `dgac-pilot` | Télépilote DGAC | ≥ 1 certification `DGAC_DRONE` validée |
| `loadout-full` | Loadout complet | 4 équipements épinglés au loadout |

Chaque badge porte `id`, `label`, `description` (français) et `earned` ; le front affiche
aussi les badges **verrouillés** (motivation), avec libellé texte systématique (R6 — jamais
la couleur seule).

## 3. Backend — module `gamification/`

- `gamification.service.ts` — `GamificationService.profileFor(userId)` : repos TypeORM
  `User`/`Gear`/`Certification` injectés ; retourne `{ xp, level, levelLabel, nextLevelAt, badges }`.
- `gamification.controller.ts` :
  - `GET /api/v1/gamification/me` — rôle **FREELANCE**, identité du token. Réponse complète.
  - `GET /api/v1/gamification/freelance/:id` — rôle **RECRUITER**. Réponse **publique
    réduite** : `level`, `levelLabel`, badges **obtenus uniquement** (ni XP chiffré, ni badges
    verrouillés — la mécanique interne n'est pas un signal recruteur). 404 si la cible
    n'existe pas ou n'est pas FREELANCE (réponse uniforme, pas d'énumération).
- DTOs de réponse Swagger (`@ApiTags('🏅 Gamification')`, C2.4.1).
- Barème et seuils = constantes exportées du service (une seule source de vérité, testée).

## 4. Backend — loadout

- **Migration TypeORM** : `gear.isInLoadout boolean NOT NULL DEFAULT false`.
- `PATCH /api/v1/gear/:id/loadout` — body `{ inLoadout: boolean }` (DTO class-validator) ;
  rôle **FREELANCE**, propriétaire uniquement (id du token ; gear d'autrui → **404**, pas
  d'énumération).
  - Épingler exige `status === VALIDATED` → **400** sinon (« le loadout est une vitrine de
    preuve, pas d'intention »).
  - **Maximum 4 épinglés** → **400** au 5ᵉ.
- **Cohérence au re-review** : quand l'admin **rejette** un équipement (`PATCH :id/review`),
  le service retire l'épingle (`isInLoadout = false`) — jamais de non-validé en vitrine.
- Exposition : `GearResponseDto` (privé) et le DTO public (SH-39) portent `isInLoadout` ;
  les listes servent le loadout en premier (tri `isInLoadout DESC` puis existant).
  Le DTO public reste sans `serialNumber` (invariant SH-39/SH-44).

## 5. Frontend — `features/gamification/` + intégrations

- `useGamification()` (privé) / `useFreelanceGamification(id)` (public) — TanStack Query via
  `apiClient`, types régénérés par `gen:api`.
- `LevelCard` : libellé du niveau + barre de progression vers `nextLevelAt`
  (`role="progressbar"`, `aria-valuetext` explicite — conventions SH-44).
- `BadgeGrid` : badges obtenus/verrouillés, chaque badge = icône Lucide + libellé texte +
  description accessible ; l'état verrouillé se lit dans le texte, pas seulement l'opacité.
- **Armurerie privée** (`/mon-armurerie`) : rangée « Loadout » en tête (4 slots — équipements
  épinglés + emplacements vides), puis `LevelCard` + `BadgeGrid`, puis la grille existante.
  Sur chaque `GearCard` validée : action « Épingler au loadout » / « Retirer » ; erreurs API
  (400 plein, 400 non validé) affichées en français près de la carte.
- **Vue publique** (`/freelances/:id/armurerie`) : loadout en tête, niveau + badges obtenus
  (pas d'XP chiffré). Aucun contrôle d'épinglage.
- Palette : tokens `--color-hud-*` existants uniquement (garde anti-hex de SH-44 inchangée).

## 6. Tests

- **Backend** (Jest, TDD) : barème XP (0 gear, mix statuts — seuls les VALIDATED comptent),
  franchissement de seuils, chaque badge (limite N-1/N), réponse publique réduite (pas d'XP,
  pas de badges verrouillés), RBAC (401/403), loadout (épingler validé OK, PENDING → 400,
  5ᵉ → 400, gear d'autrui → 404, rejet admin → épingle retirée).
- **Front** (Vitest + RTL, TDD) : LevelCard (libellé + valuetext), BadgeGrid (obtenu vs
  verrouillé lisible au texte), rangée loadout (épingler/retirer, slot vide), vue publique
  réduite, erreurs 400 affichées.
- E2E réel à la vérification : stack conteneurisée, freelance de démo → valider du matériel
  → XP/badges évoluent → épingler 4 → badge « Loadout complet » → vue recruteur.

## 7. Hors périmètre (tracé)

- Historique d'XP (« +50 XP » événementiel) — nécessiterait le ledger MongoDB/bus Redis,
  écarté pour le rendu du 23/07 (le calcul dérivé rend le passage au ledger possible plus
  tard sans casser le contrat d'API).
- XP liés à l'activité (chat, complétude profil) — écartés au cadrage.
- Notifications de badge en temps réel.

## 8. Risques & notes

- `FreelanceGear.tsx` est modifié en parallèle par SH-24 (PR #37) : partir de `develop`,
  résoudre le conflit au 2ᵉ merge.
- La migration `gear.isInLoadout` est la seule écriture de schéma ; elle est additive et
  sans reprise de données.
- Estimation : **~5 SP** en 3 tranches livrables (backend gamification · backend loadout ·
  front).
