**Titre du Ticket :** [SH-15] Scaffolding `media-service` (Node + FFmpeg)
**Type :** Feature
**Priorité :** High
**Estimation :** 3 Story Points
**Compétences RNCP visées :** C2.1.2 (structure, normes qualité, lint), C2.2.2 (harnais de tests, test de bootstrap)
**Lot :** Lot 1 (Web MVP)

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** Story INVEST — aucune dépendance bloquante, débloque tout EP04.
- [x] **Specs Complètes :** design validé — `docs/superpowers/specs/2026-08-24-EP04-media-portfolio-design.md`.
- [x] **UX/UI Validé :** N/A (service interne, sans interface).
- [x] **Faisabilité Technique :** Node + FFmpeg arbitré au CLAUDE.md §3 ; BullMQ tranché en D6 du design.
- [x] **Estimé :** 3 SP.

### 1. User Story (Le Besoin)
**En tant que** développeur backend,
**Je veux** disposer d'un squelette `media-service` propre, conteneurisé, supervisé et testé,
**Afin de** pouvoir implémenter le pipeline de transcodage (SH-16) sans friction d'outillage.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** EP04 est le dernier Epic non entamé du Lot 1, et le seul chantier
  qui matérialise réellement le « traitement lourd isolé » justifiant l'architecture hybride
  (CLAUDE.md §2). Sans ce scaffolding, SH-16/17/18 ne peuvent pas démarrer.
* **KPI impacté :** vélocité — déblocage de 14 J/H d'EP04.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Sonde de vivacité**
* **GIVEN** le service est lancé
* **WHEN** je requête `GET /health`
* **THEN** je reçois `200 OK` avec `{"status":"ok","service":"media-service","uptimeSeconds":<n>}`

**Scénario 2 : Métriques exposées**
* **GIVEN** le service est lancé
* **WHEN** je requête `GET /metrics`
* **THEN** je reçois `200 OK` au format texte Prometheus, incluant `media_jobs_total`

**Scénario 3 : La file est réellement consommée**
* **GIVEN** un Redis joignable et le worker démarré
* **WHEN** un job est déposé sur la file `media-transcode`
* **THEN** le worker le traite et le job termine en `completed`

**Scénario 4 : Refus de démarrer mal configuré**
* **GIVEN** la variable `REDIS_URL` absente
* **WHEN** le service démarre
* **THEN** il échoue immédiatement avec un message explicite, sans valeur devinée

**Scénario 5 : Arrêt propre**
* **GIVEN** le service est lancé
* **WHEN** il reçoit `SIGTERM`
* **THEN** le worker puis le serveur HTTP se ferment avant la sortie du processus

**Scénario 6 : Image conteneur saine**
* **GIVEN** l'image construite depuis `media-service/Dockerfile`
* **WHEN** le conteneur démarre dans le profil `app`
* **THEN** son HEALTHCHECK passe à `healthy` et Prometheus scrape sa cible

### 4. Spécifications Techniques

Voir le design EP04 §4 (frontières de service), §7 (contrat du worker) et §11 (découpage).

Structure cible :

    media-service/
    ├── src/
    │   ├── config.ts        # lecture + validation de l'environnement
    │   ├── logger.ts        # pino JSON → stdout
    │   ├── metrics.ts       # registre prom-client dédié
    │   ├── http/server.ts   # /health + /metrics (node:http, sans framework)
    │   ├── queue/worker.ts  # Worker BullMQ (no-op en SH-15)
    │   └── main.ts          # bootstrap + arrêt propre
    ├── Dockerfile
    └── CLAUDE.md

Décisions structurantes reprises du design :
* **Worker pur** : ni route métier, ni PostgreSQL, ni JWT. Identité et vérité métier restent au monolithe (D7).
* **Sans framework HTTP** : deux routes techniques ne justifient pas Express.
* **Port 3002, aucun port hôte** : collecte Prometheus sur le réseau Docker privé (archi §2).
* **Pas de `container_name`** : SH-16 doit pouvoir faire `--scale media-service=2`.

* **BullMQ résolu :** 5.81.3

### 5. Definition of Done (DoD)
- [ ] Les 6 scénarios Gherkin sont vérifiés.
- [ ] `npm run lint`, `npm run test`, `npm run build` passent dans `media-service/`.
- [ ] L'image se construit et le conteneur devient `healthy` dans le profil `app`.
- [ ] La cible `media-service` apparaît `up` dans Prometheus.
- [ ] `media-ci.yml` est vert sur la PR ; l'image est ajoutée à `docker-ci.yml` et `publish-staging.yml`.
- [ ] Dependabot surveille `/media-service`.
- [ ] `docs/BACKLOG.md` passe SH-15 en 🟢.
