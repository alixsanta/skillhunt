**Titre du Ticket :** [SH-23] Cartographie des résultats de recherche (Leaflet + OpenStreetMap)
**Type :** Feature
**Priorité :** Medium
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.4.1 (visualisation/UI), C2.2.2 (tests), C2.1.2 (choix technique justifié)
**Lot :** Lot 1 (Web MVP)

> **Décision « Mapbox » → Leaflet + OSM (actée le 2026-07-16).** L'intitulé historique visait
> Mapbox, qui exige un compte, un token d'API (secret à gérer) et un quota. **Leaflet +
> OpenStreetMap** : zéro compte, zéro token, zéro coût — parfaitement cohérent avec le choix
> structurant du dossier « PostGIS plutôt qu'une API carto payante » (CLAUDE.md §3). Le nom du
> fichier est conservé pour la traçabilité du backlog.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** un recruteur RAISONNE géographiquement (rayon de mission) — la liste triée ne montre pas la répartition spatiale des candidats.
- [x] **Specs Complètes :** Gherkin ci-dessous ; prérequis : les résultats de matching doivent porter la position (enrichissement SH-22).
- [x] **UX/UI Validé :** carte sous les résultats de `/recherche` — centre + rayon de mission matérialisés, un marqueur par freelance (popup : username, score, lien armurerie).
- [x] **Faisabilité Technique :** positions déjà en base (SH-34), proxy SH-22 en place, react-leaflet éprouvé.
- [x] **Estimé :** 5 SP.

### 1. User Story
**En tant que** recruteur,
**Je veux** voir les freelances correspondants placés sur une carte avec mon rayon de mission,
**Afin de** juger d'un coup d'œil leur répartition géographique avant de les contacter.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Carte des résultats**
* **GIVEN** une recherche qui renvoie des freelances
* **THEN** une carte s'affiche sous la liste : fond OpenStreetMap (attribution affichée), le lieu de mission centré, le rayon matérialisé par un cercle
* **AND** chaque freelance est un marqueur dont la popup montre username + score et un lien vers son armurerie publique (SH-21b).

**Scénario 2 : Position portée par l'API**
* **GIVEN** le proxy `POST /matching/search` (SH-22)
* **THEN** chaque résultat porte `latitude`/`longitude` (position déclarée à l'inscription, SH-34) — précision « ville », pas d'adresse.

**Scénario 3 : Pas de résultat, pas de carte**
* **GIVEN** une recherche sans correspondance
* **THEN** l'état vide existant s'affiche, sans carte.

### 4. Spécifications Techniques
* **backend-core (`matching/`)** : `MatchResultDto` enrichi de `latitude`/`longitude` (nullable, `type: Number` explicite — piège des unions déjà rencontré en SH-22) depuis `users.location` (GeoJSON `[lon, lat]` → attention à l'ordre). Même requête d'enrichissement que le username (pas de N+1).
* **frontend-web (`features/matching/SearchMap.tsx`)** : react-leaflet ; **`CircleMarker`/`Circle` SVG stylés par `className` + tokens CSS** (aucun asset d'icône Leaflet à embarquer, aucune couleur en dur — le thème reste dans `index.css`). Tuiles `tile.openstreetmap.org` avec attribution.
* **Tests** : mapping position (ordre lon/lat !) côté backend ; côté front, react-leaflet est mocké (jsdom ne rend pas de carte) — on vérifie les données passées aux marqueurs et les popups.
* **Éco-conception (SH-28)** : leaflet ≈ 43 kB gzip — pesé par le job de build ; tuiles chargées à l'affichage seulement (la carte n'apparaît qu'avec des résultats).

### 5. Definition of Done (DoD)
- [x] `latitude`/`longitude` dans `MatchResultDto` (ordre GeoJSON `[lon, lat]` → champs explicites, vérifié par test ; `type: Number` explicite — piège des unions SH-22 évité).
- [x] Carte sur `/recherche` : centre + cercle de rayon (le périmètre PostGIS réellement interrogé) + marqueurs `CircleMarker` avec popup (username, score, lien SH-21b) ; freelance sans position = pas de marqueur (testé).
- [x] Aucun token/secret ; attribution OSM affichée ; couleurs par tokens CSS (`index.css`) — zéro asset d'icône Leaflet.
- [x] **Éco-conception (SH-28)** : Leaflet chargé PARESSEUSEMENT (chunk séparé de 45 kB gzip, `React.lazy`) — le bundle initial ne bouge presque pas et les visiteurs sans recherche ne le téléchargent jamais.
- [x] 123 tests front + 19 tests matching backend verts ; CI à confirmer sur la PR.
- [x] Vérifié au navigateur sur la stack réelle (Toulouse, cercle 50 km, marqueur du freelance, tuiles OSM) ; `docs/BACKLOG.md` mis à jour.
