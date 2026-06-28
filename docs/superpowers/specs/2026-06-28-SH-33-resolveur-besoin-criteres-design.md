# Design — Résolveur besoin→critères (recruteur non-expert) — SH-33

> Spec de conception issue d'un brainstorming (2026-06-28). Couche de traduction posée **devant**
> le moteur de matching SH-12, pour les recruteurs non-experts (persona B2C « particulier »).
> Ticket actionnable : `docs/tickets/SH-33-resolveur-besoin-criteres.md`.
> Le moteur SH-12 reste **inchangé**.

## 1. Contexte & problème

Le moteur SH-12 (`POST /match`) prend en entrée une liste de `skills` techniques
(`["drone-dgac", "fpv"]`) que le recruteur **doit savoir nommer**. Or un nouveau persona — le
**recruteur particulier non-expert** (ex. un propriétaire qui veut faire inspecter sa toiture) — ne
connaît **pas** ce vocabulaire. Il sait décrire son *besoin*, pas les *critères techniques*.

SH-33 ajoute un **résolveur besoin→critères** : le non-expert choisit un **cas d'usage en langage
clair**, qu'on traduit en `skills` alimentant le moteur SH-12 existant.

```
Expert  : POST /match              { skills, location, radius_km }              → moteur SH-12
Novice  : POST /match/by-use-case  { use_case_id, location, radius_km }
                          └─▶ USE_CASE_CATALOG[id] → skills ──▶ même moteur de scoring SH-12
```

### ⚠️ Impact périmètre / RNCP
Ce persona **n'existe pas** dans le dossier de cadrage actuel (qui positionne le recruteur en **B2B** :
« Société de production », SWOT « Utilisateur Final B2B »). Son introduction **élargit le positionnement
produit** (B2B → B2B+B2C). **Livrable associé obligatoire** : mise à jour du dossier `SkillHunt.docx`
(cartographie des acteurs §1.4 + SWOT §2.3) pour réalignement RNCP. *(Hors de ce ticket de code —
suivi séparé, voir §8.)*

### Compétences RNCP visées
- **C2.2.2** — harnais de tests (résolution, invariant de cohérence, endpoint).
- **C2.2.3** — validation stricte des entrées (Pydantic, `use_case_id` inconnu).
- **C2.4.1** — documentation OpenAPI.

### Risques du dossier
- **R4** (pertinence/latence du matching).
- **R10** (complétion/UX — ne jamais bloquer un recruteur non-expert).

## 2. Décisions de cadrage (brainstorming)

| # | Décision | Justification |
|---|---|---|
| D1 | **Persona MVP** (pas futur) | Choix produit assumé : le particulier entre dans le Lot 1. |
| D2 | **Catalogue de cas d'usage** (pas wizard ni NLP) | Déterministe, testable, zéro IA, miroir exact de `CATEGORY_SKILL_MAP`. |
| D3 | **Nouveau ticket SH-33 posé sur SH-12** | Sépare la *traduction d'entrée* du *cœur de calcul* (même discipline que SH-10/SH-31). SH-12 reste validable seul. |
| D4 | **Endpoint séparé `/match/by-use-case`** | Deux personas, deux contrats. `/match` (expert) intact → zéro régression SH-12. |
| D5 | **Catalogue = constante code** (MVP) | ~10 entrées stables, versionnées, testables. BDD/admin = évolution future (cf. §1.4/§1.6 du dossier). |
| D6 | **Catalogue non exhaustif + repli** | On ne peut énumérer tous les besoins. On couvre les *critères techniques distincts* (bornés par les 5 catégories) + une option « Autre » pour ne jamais bloquer. |

## 3. Invariant de cohérence (correctness)

Dans SH-12, les skills d'un freelance sont **inférés de ses catégories de matériel validé** via
`CATEGORY_SKILL_MAP`. Donc un `skill` produit par un cas d'usage mais **absent** des valeurs de
`CATEGORY_SKILL_MAP` donnerait un recall **toujours nul** → aucun match.

**Règle (testée) :** pour tout `UseCase`, `set(use_case.skills) ⊆ ⋃ CATEGORY_SKILL_MAP.values()`.

> Conséquence assumée : le catalogue MVP discrimine selon les **5 catégories** (DRONE, CAMERA_360,
> ROBOTICS, SENSOR, OTHER). Une granularité plus fine viendra de vraies données de skills
> (certifs, skills déclarés) — évolution future. Le nombre *utile* de cas d'usage est donc borné par
> le vocabulaire technique, pas par l'infinité des besoins.

## 4. Architecture & composants (dans `matching-service`)

```
app/services/use_cases.py     # UseCase (dataclass) + USE_CASE_CATALOG + resolve_use_case()
app/routers/use_cases.py      # GET /use-cases  (liste le catalogue)
app/routers/matching.py       # + POST /match/by-use-case  (résout puis réutilise le scoring SH-12)
```

### Structure de donnée
```python
@dataclass(frozen=True)
class UseCase:
    id: str                      # "ROOF_INSPECTION"
    label: str                   # "Inspection de toiture"
    description: str             # langage clair, affiché au recruteur
    skills: list[str]            # ⊆ valeurs de CATEGORY_SKILL_MAP  → alimente MatchRequest.skills
    gear_categories: list[str]   # indice de cohérence (DRONE, SENSOR…)

USE_CASE_CATALOG: dict[str, UseCase]
```

### Set de départ (MVP, skills validés ⊆ CATEGORY_SKILL_MAP)
| id | label | skills | catégories |
|---|---|---|---|
| `ROOF_INSPECTION` | Inspection de toiture | `drone-dgac`, `telepilote` | DRONE, SENSOR |
| `REAL_ESTATE_VIDEO` | Tournage / visite immobilière | `drone-dgac`, `fpv` | DRONE, CAMERA_360 |
| `SITE_MAPPING` | Cartographie de chantier | `drone-dgac`, `uas` | DRONE, SENSOR |
| `INDUSTRIAL_ROBOTICS` | Automatisation / robotique industrielle | `robotics`, `automation` | ROBOTICS |
| `VR_360_TOUR` | Visite virtuelle 360° | `camera-360`, `operateur-360` | CAMERA_360 |
| `SENSOR_SURVEY` | Relevé par capteurs / télémétrie | `sensor`, `lidar`, `telemetrie` | SENSOR |

## 5. Contrats d'API

### `GET /use-cases`
→ liste le catalogue (`id`, `label`, `description`) pour peupler l'UI du non-expert.

### `POST /match/by-use-case`
```jsonc
// requête
{ "use_case_id": "ROOF_INSPECTION", "location": [43.6, 1.44], "radius_km": 50.0 }
// réponse — transparence : on montre les critères inférés
{ "resolved_criteria": { "use_case": "Inspection de toiture",
                         "skills": ["drone-dgac", "telepilote"] },
  "results": [ { "freelance_id": "...", "score": 0.87, "distance_km": 0.0 }, ... ] }
```
Flux : valider l'entrée → `resolve_use_case(id)` → construire un `MatchRequest(skills=…, location, radius_km)`
→ **réutiliser le scoring SH-12 inchangé** (`get_candidates` + `compute_composite_score`) → trier.

### Dégradation gracieuse (R10)
- `use_case_id` inconnu → **400** + liste des cas valides (le non-expert n'est jamais perdu).
- Option **« Autre / je ne trouve pas »** côté UI → repli vers une recherche par grand domaine
  (catégorie de matériel) ; jamais de cul-de-sac.
- Aucun candidat → `results: []` (déjà géré par le moteur).

## 6. Transparence
La réponse renvoie toujours `resolved_criteria` → le recruteur **voit** ce qu'on a recherché pour lui
(« on a recherché : télépilote DGAC… »). Pédagogique + auditable ; base d'un futur ajustement manuel.

## 7. Tests (pytest)
- `resolve_use_case` : id connu → skills attendus ; id inconnu → erreur/None.
- **Invariant de cohérence** : `∀ use_case, set(skills) ⊆ ⋃ CATEGORY_SKILL_MAP.values()`.
- `GET /use-cases` → 200, catalogue non vide, structure correcte.
- `POST /match/by-use-case` : 200 + `resolved_criteria` + résultats triés (candidats mockés, DI override) ;
  `use_case_id` inconnu → 400 ; payload invalide → 422.

## 8. Croissance pilotée par la donnée (évolution, hors MVP)
- Mesurer **quels cas d'usage sont sélectionnés** + **les demandes “Autre”** → priorise les ajouts.
- Migration catalogue **constante → table `use_cases` + endpoint admin** quand l'Admin doit éditer
  sans développeur (aligné dossier §1.4/§1.6). Noté `// TODO` explicite.
- Granularité fine des skills (certifs, skills déclarés) → meilleure discrimination.

## 9. Livrable hors code (à suivre séparément)
Mise à jour de `SkillHunt.docx` : persona « recruteur particulier (B2C) » dans la cartographie des
acteurs (§1.4) + ligne SWOT (opportunité marché B2C / menace attentes floues). **Indispensable pour
l'alignement RNCP** — à faire avant la soutenance.

## 10. Ordre d'implémentation
1. **SH-12** (le moteur) d'abord — prérequis dur.
2. **SH-33** ensuite — réutilise `get_candidates` + `compute_composite_score` sans les modifier.
