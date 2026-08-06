**Titre du Ticket :** [SH-29] Système de supervision et d'alerte (Grafana + Loki + Prometheus, signalement par mail)
**Type :** Feature (exploitation / MCO)
**Priorité :** High
**Estimation :** 8 Story Points (Fibonacci) — *ré-estimé depuis 5 SP : le périmètre réel couvre 3 chantiers (instrumentation du code, stack d'observabilité, sondes & alerting), pas seulement le déploiement d'une stack.*
**Compétences RNCP visées :** **C4.1.2** (concevoir un système de supervision et d'alerte — *éliminatoire*), C4.2.1 (alimente la collecte d'anomalies), C4.3.1 (fournit les indicateurs de performance), C2.2.2
**Lot :** Lot 1 (Web MVP)

> **Origine.** SH-30 a mis la plateforme en production sur une VM publique — mais **en aveugle** :
> aucun log structuré, aucune métrique, aucune sonde, aucun signalement. Le seul `/health` du
> parc est celui du `matching-service` ; `backend-core` n'expose rien et n'a même pas de
> `healthcheck:` dans le compose. Ce ticket est le support principal du **dossier BLOC 4**
> (« Maintenir l'application logicielle en condition opérationnelle »), dont la compétence
> **C4.1.2 est éliminatoire**.

---

### 0. Definition of Ready (DoR)

- [x] **Valeur Claire :** la plateforme tourne en production sans aucun moyen de savoir si elle est disponible, lente ou en erreur. Toute anomalie est aujourd'hui découverte par hasard, pas détectée.
- [x] **Specs Complètes :** 3 chantiers (A instrumentation, B stack, C sondes & alerting) ; tableau sondes → indicateurs → seuils en §4.3 ; critères Gherkin couvrant le cas passant, le cas d'erreur et le cas de sécurité.
- [x] **UX/UI Validé :** n/a (exploitation). Les dashboards Grafana sont provisionnés as-code, pas dessinés à la main.
- [x] **Faisabilité Technique :** stack conteneurisée existante (8 services), VM OVHcloud disponible jusqu'à fin août 2026. Décisions de stack tracées en §2.
- [x] **Estimé :** 8 SP.

### 1. User Story

**En tant que** mainteneuse de SkillHunt en charge du maintien en condition opérationnelle,
**Je veux** un système de supervision qui mesure la disponibilité, la performance et les erreurs de la plateforme, et qui **me signale par mail** tout franchissement de seuil,
**Afin de** détecter une anomalie avant l'utilisateur, et de disposer des éléments factuels permettant de la consigner puis de la corriger.

### 2. Contexte & Valeur Business

* **Pourquoi maintenant ?** Rendu du dossier BLOC 4 entre le **17 et le 21 août 2026**. C4.1.2 est **éliminatoire** : sans système de supervision décrit (sondes, indicateurs, modalités de signalement), le bloc n'est pas validé. Par ailleurs C4.2.1 (consigner une anomalie *détectée en production*) et C4.3.1 (proposer des axes d'amélioration *à partir des indicateurs de performance*) dépendent tous deux de la sortie de ce ticket.
* **KPI impacté :** disponibilité (SLI principal), latence p95 de l'API (cible CLAUDE.md §3 : < 50 ms), taux d'erreur 5xx, délai moyen de détection d'incident (aujourd'hui : non borné).
* **Périmètre de supervision :** les **8 conteneurs du profil `app`** (postgres, redis, mongo, localstack, backend-core, matching-service, frontend-web, gateway), sur la **stack conteneurisée locale** (référence reproductible) **puis sur la VM OVHcloud** (production, jusqu'à fin août).

#### Décisions techniques tracées

| Décision | Retenu | Écarté | Justification |
|---|---|---|---|
| Moteur de logs | **Loki** | ELK (Elasticsearch + Logstash + Kibana) | ELK = ~2–4 Go de RAM **en plus** des 8 conteneurs existants ; la VM est une b2-7 (7 Go). Loki indexe les *labels* et non le contenu → ~300 Mo, même valeur d'exploitation. Le backlog mentionnait « ELK » : décision révisée ici. |
| Collecteur de logs | **Grafana Alloy** | Promtail | Promtail est passé en LTS puis **fin de support** (successeur officiel : Alloy). Retenir un composant en fin de vie dans un dossier dont le sujet est le *maintien en condition opérationnelle* — et dont C4.1.1 porte sur la mise à jour des dépendances — serait incohérent. ⚠️ *Vérifier le statut de Promtail/Alloy au moment de l'implémentation et ajuster la justification si besoin.* |
| Métriques | **Prometheus + cAdvisor** | Loki seul | Loki ne donne que des logs. C4.1.2 exige des « critères de qualité et de performance » et la « disponibilité » — ce sont des métriques, pas des lignes de log. |
| Signalement | **SMTP → Mailpit** (dev/staging), relais SMTP réel en prod via variable d'env | SMTP Gmail direct, webhook Discord/Slack | Le mail est la modalité la plus universelle et la plus traçable. Mailpit capte le mail réellement émis en SMTP → preuve consultable et reproductible par le jury, **sans aucun secret dans le repo** (CLAUDE.md §8). Le passage en prod ne change qu'une URL de relais. |

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Détection d'indisponibilité et signalement**
* **GIVEN** la stack `app` + le profil `obs` démarrés et un état nominal (toutes les sondes vertes)
* **WHEN** j'arrête le conteneur `matching-service` (`docker compose stop matching-service`)
* **THEN** la sonde de disponibilité passe à `up == 0` en moins de **30 secondes**
* **AND** en moins de **4 minutes** sur un hôte non saturé, une alerte de sévérité `CRITIQUE` est émise
* **AND** un mail est reçu dans Mailpit, contenant le service concerné, l'indicateur, la valeur mesurée face à son seuil, la sonde d'origine et la conduite à tenir.

> **Correction du critère — 2026-08-06.** Ce scénario annonçait initialement « moins de
> **2 minutes** ». Ce seuil a été écrit **avant** le choix des paramètres d'alerte, et il
> est structurellement inatteignable avec eux :
>
> | Poste | Délai |
> |---|---|
> | Intervalle de scrape Prometheus | ≤ 15 s |
> | Persistance `for` de la règle S1 | 2 min |
> | Intervalle d'évaluation de la règle | ≤ 1 min |
> | `group_wait` avant notification | 30 s |
> | **Plancher théorique** | **≈ 2 min 45 s** |
>
> Le budget est donc revu à **4 minutes**, et non l'inverse. Abaisser la persistance sous
> 2 minutes tiendrait la promesse d'origine, mais ferait alerter à **chaque
> redéploiement** — un conteneur met 30 à 60 s à revenir. Une alerte qui se déclenche sans
> incident est filtrée par son destinataire en quelques jours, et c'est la panne suivante
> qu'on rate : mauvais échange. Le paramétrage est conservé, le critère corrigé.
>
> **Mesures réelles** (poste de développement, 13 conteneurs) : **3 min 04 s** au premier
> cycle, **4 min 50 s** au second, à configuration identique. L'écart vient de la charge
> de l'hôte : Grafana journalise lui-même `Tick dropped because alert rule evaluation is
> too slow`. Le critère des 4 minutes vaut donc **pour un hôte non saturé** ; sur un poste
> chargé, compter jusqu'à 5 minutes. À revalider sur la VM OVHcloud, dimensionnée pour.

**Scénario 2 : Retour à la normale (résolution)**
* **GIVEN** une alerte `CRITIQUE` active
* **WHEN** je redémarre le conteneur
* **THEN** l'alerte repasse à `Resolved` et un **mail de résolution** est émis (preuve du cycle complet, exigé par « garantir une disponibilité permanente »)
* **AND** le **sujet** du mail distingue la résolution du déclenchement (préfixe `[RÉSOLU]`).

> **Ajout du critère de sujet — 2026-08-06.** Le premier cycle de bout en bout a montré
> que les deux mails d'un même incident portaient un sujet **identique** : un destinataire
> parcourant sa boîte ne pouvait pas distinguer « la plateforme est tombée » de « elle est
> revenue ». Le signalement informait qu'il s'était passé quelque chose, sans dire quoi.
> Corrigé dans le modèle de sujet ; le critère est ajouté ici pour qu'il soit vérifié.

**Scénario 3 : Corrélation d'une requête de bout en bout**
* **GIVEN** les logs structurés JSON activés sur `backend-core` et `matching-service`
* **WHEN** un recruteur lance une recherche (`POST /api/v1/matching/search`, qui appelle le microservice)
* **THEN** une requête LogQL sur le `requestId` dans Grafana ramène **la ligne du monolithe ET celle du microservice**, avec le statut HTTP et la durée.

**Scénario 4 : Aucune donnée sensible dans les logs (non négociable)**
* **GIVEN** un `POST /api/v1/auth/login` avec un mot de passe, et un appel authentifié portant un `Authorization: Bearer …`
* **WHEN** je recherche dans Loki les champs `password`, `token`, `authorization`, `serialNumber`, `cookie`
* **THEN** aucune valeur en clair n'apparaît — les champs sont **redactés** (`[Redacted]`).

**Scénario 5 : Surface d'exposition maîtrisée**
* **GIVEN** la stack complète démarrée
* **WHEN** j'interroge la gateway publique sur `/metrics`, `/loki`, `/prometheus`
* **THEN** j'obtiens **404** — les endpoints d'observabilité ne sont **jamais** joignables depuis l'extérieur ; ils restent sur le réseau Docker privé
* **AND** Grafana n'est atteignable que sur son propre port hôte, distinct de la gateway.

**Scénario 6 : Reproductibilité (provisioning as-code)**
* **GIVEN** un poste vierge et le dépôt cloné
* **WHEN** j'exécute `docker compose --profile app --profile obs up -d`
* **THEN** Grafana démarre avec ses datasources, ses dashboards et ses règles d'alerte **déjà en place** — aucune configuration manuelle dans l'UI.

**Scénario 7 : Détection d'une rafale d'authentification (sécurité, R7/R9)**
* **GIVEN** le rate-limiting gateway de SH-5 actif
* **WHEN** je lance 50 requêtes en rafale sur `/api/v1/auth/login` depuis une même IP
* **THEN** la gateway renvoie des `429`, la sonde correspondante les comptabilise
* **AND** au-delà du seuil, une alerte de sévérité `SÉCURITÉ` est signalée par mail.

---

### 4. Spécifications Techniques

#### 4.1 Chantier A — Instrumentation du code *(prérequis : sans ça, la stack n'a rien à ingérer)*

**`backend-core` (NestJS)**
* **Logs structurés JSON** : `nestjs-pino` + `pino-http` (dépendances légères, standard de fait de l'écosystème Nest — signalé au titre de CLAUDE.md §14). Remplace les `console.log` de [main.ts](../../backend-core/src/main.ts) et les `Logger` texte épars.
  * Champs obligatoires : `timestamp`, `level`, `service`, `requestId`, `method`, `route`, `statusCode`, `durationMs`, `userId` *(uniquement l'identifiant technique — jamais l'email, minimisation RGPD §8.7)*.
  * **`redact`** obligatoire sur : `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.refreshToken`, `*.token`, `*.twoFactorSecret`, `*.serialNumber`.
* **Corrélation** : middleware générant un `requestId` (UUID v4) s'il est absent, propagé en en-tête `X-Request-Id` **jusqu'au `matching-service`** (le client HTTP du module `matching` doit le relayer).
* **Sondes exposées** :
  * `GET /api/v1/health` — liveness, réponse triviale, **documenté Swagger** (`@ApiTags('Health')`, C2.4.1).
  * `GET /api/v1/health/ready` — readiness : vérifie PostgreSQL, Redis et MongoDB, renvoie **503** si une dépendance est HS (c'est ce qui rend l'indisponibilité *mesurable*).
  * `GET /metrics` — format Prometheus via `prom-client` : `http_request_duration_seconds` (histogramme, labels `method`/`route`/`status`), `http_requests_total`, métriques par défaut du process (heap, event loop lag).
    ⚠️ **Cet endpoint ne doit PAS être routé par la gateway** (cf. §4.4) : il révèle la cartographie des routes et le volume de trafic.
* **`healthcheck:`** ajouté au service `backend-core` du compose (aujourd'hui absent), ciblant `/api/v1/health` sur `127.0.0.1` — **pas** `localhost` (cf. l'anomalie IPv6 ci-dessous).

**`matching-service` (FastAPI)**
* Logs JSON (`python-json-logger` ou `structlog`), mêmes champs, même `requestId` lu depuis `X-Request-Id`.
* `prometheus-fastapi-instrumentator` → `/metrics` (réseau privé uniquement).
* `/health` existant conservé ; ajout d'un `/health/ready` vérifiant PostgreSQL et Redis.

> ⚠️ **À NE PAS corriger dans ce ticket.** L'anomalie de production documentée en
> [SH-30 §4](SH-30-mise-en-production.md#L125) — `frontend-web` et `gateway` marqués `unhealthy`
> parce que leur HEALTHCHECK résout `localhost` en IPv6 `::1` alors que leur `nginx.conf` ne
> déclare que `listen 80;` — **doit rester ouverte**. Elle est le support de C4.2.1 (fiche de
> consignation) et C4.2.2 (correctif déployé via la CI/CD) : la supervision mise en place ici
> doit d'abord **la détecter**, ce qui prouve que le système fonctionne. Le correctif fera
> l'objet d'un ticket `fix/` distinct, après la mise en service de SH-29.

#### 4.2 Chantier B — Stack d'observabilité (profil compose `obs`)

Nouveau profil `obs` dans `docker-compose.yml`, activable indépendamment (`--profile app --profile obs`) :

| Service | Rôle | Contrainte |
|---|---|---|
| `grafana` | Visualisation + moteur d'alerting | Seul port hôte publié du profil (`${GRAFANA_PORT:-3000}`). Compte admin par variable d'env, **jamais en dur**. |
| `loki` | Stockage des logs | Aucun port hôte. Rétention 7 jours (suffisant pour la fenêtre du dossier, borne la conso disque). |
| `alloy` | Collecte des logs des conteneurs Docker | Monte le socket Docker en **lecture seule** (`/var/run/docker.sock:ro`). |
| `prometheus` | Stockage des métriques | Aucun port hôte. Rétention 7 jours. Scrape : `backend-core`, `matching-service`, `cadvisor`. |
| `cadvisor` | Métriques par conteneur (CPU, RAM, restarts) | Aucun port hôte. Aucune ligne de code applicatif requise. |
| `mailpit` | Catcher SMTP + interface web de consultation | Port hôte pour l'UI uniquement. |

* **Provisioning as-code obligatoire** (aucun clic dans l'UI Grafana) sous `observability/` :
  * `grafana/provisioning/datasources/*.yml` (Loki + Prometheus)
  * `grafana/provisioning/dashboards/*.json` — 3 dashboards : *Vue d'ensemble plateforme*, *API backend-core*, *Logs & erreurs*
  * `grafana/provisioning/alerting/*.yml` — règles + contact point SMTP + templates de notification
  * `alloy/config.alloy`, `prometheus/prometheus.yml`, `loki/loki-config.yml`
* **`mem_limit`** sur chaque conteneur `obs` : la VM b2-7 (7 Go) héberge déjà 8 conteneurs. Prévoir le passage en **b2-15** pour la phase d'observation en production si la marge est insuffisante.

#### 4.3 Chantier C — Sondes, indicateurs et seuils *(cœur de C4.1.2)*

> Le référentiel exige que « les sondes mises en place **et leur finalité**  soient explicitées »
> et que « les critères de qualité et de performance soient décrits ». Ce tableau est le
> livrable central du dossier — il est repris tel quel dans la partie C4.1.2.

| # | Sonde | Source | Indicateur (SLI) | Seuil → Sévérité | Finalité |
|---|---|---|---|---|---|
| S1 | Disponibilité service | Prometheus `up` + `/health/ready` | % de disponibilité sur 5 min | `up == 0` pendant 2 min → **CRITIQUE** | Garantir la disponibilité permanente (exigence C4.1.2) |
| S2 | Latence API | `http_request_duration_seconds` | p95 par route | p95 > 500 ms sur 5 min → **WARNING** | Détecter la dégradation avant la panne (cible archi < 50 ms) |
| S3 | Taux d'erreur serveur | `http_requests_total{status=~"5.."}` | ratio 5xx / total | > 2 % sur 5 min → **CRITIQUE** | Détecter une régression fonctionnelle en production |
| S4 | Saturation mémoire | cAdvisor | RAM utilisée / limite, par conteneur | > 85 % pendant 10 min → **WARNING** | Anticiper l'OOM-kill (contrainte réelle de la VM b2-7) |
| S5 | Instabilité conteneur | cAdvisor | nombre de redémarrages | > 2 en 15 min → **CRITIQUE** | Détecter un crash-loop (`restart: unless-stopped` le masque sinon) |
| S6 | Erreurs applicatives | Loki (LogQL `level="error"`) | erreurs / min | > 10/min sur 5 min → **WARNING** | Repérer les erreurs métier invisibles en HTTP 200 |
| S7 | Pression sur l'authentification | Loki (logs gateway, `status=429`) | 429 sur `/api/v1/auth` par IP | > 20/min → **SÉCURITÉ** | Détecter une tentative de brute-force (R7/R9, complète SH-5) |
| S8 | Retard du bus d'événements | métrique custom / logs consumer | lag du consumer Redis Stream | > 100 messages sur 5 min → **WARNING** | Détecter un matching qui décroche du temps réel (SH-14) |

**Modalité de signalement**
* Grafana Alerting → **contact point SMTP** → Mailpit (`smtp://mailpit:1025`) en dev/staging ; en production, la même configuration pointe vers un relais réel via `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM` — **aucun identifiant commité**.
* Template de mail (versionné) : `[SÉVÉRITÉ] service — indicateur`, valeur mesurée, seuil franchi, horodatage, lien dashboard, lien vers le runbook.
* Notification de **résolution** activée (une alerte qui ne se referme jamais n'est pas exploitable).
* Regroupement / anti-flood : `group_wait 30s`, `repeat_interval 4h`.

#### 4.4 Sécurité (CLAUDE.md §8)

* **Aucun endpoint d'observabilité routé par la gateway.** `nginx.conf` n'ajoute aucune `location` pour `/metrics`, `/loki`, `/prometheus` — ces services vivent sur le réseau Docker privé et ne publient aucun port hôte (Grafana et Mailpit exceptés, sur des ports dédiés).
* **Grafana** : compte admin par variable d'env, inscription anonyme désactivée. L'exposition publique de Grafana sur la VM reste une **dégradation assumée et documentée** tant que SH-4 (TLS + hardening) n'est pas fait — à mentionner explicitement dans le dossier comme axe d'amélioration (matière pour C4.3.1).
* **Socket Docker monté en lecture seule** pour Alloy et cAdvisor.
* **Redaction des logs** (§4.1) : traitée comme un critère bloquant, pas comme une bonne pratique — le Scénario 4 l'atteste.

#### 4.5 Livrables documentaires (support direct du dossier BLOC 4)

* `docs/exploitation/SUPERVISION.md` — périmètre supervisé, tableau des sondes §4.3, indicateurs, seuils, modalités de signalement, architecture de la stack.
* `docs/exploitation/RUNBOOK.md` — pour chaque alerte : cause probable, vérifications, remédiation, escalade.
* `docs/templates/FICHE_ANOMALIE.md` — gabarit de consignation (identifiant, date/heure de détection, **sonde ayant déclenché**, sévérité, environnement, version déployée, étapes de reproduction, logs/`requestId` associés, analyse, préconisation de correctif, statut). C'est le format exigé par **C4.2.1**, et il doit être alimenté par la supervision — pas rempli de mémoire.

---

### 5. Definition of Done (DoD)

- [ ] **Chantier A** : logs JSON + `requestId` propagé sur les deux services ; `/health`, `/health/ready` et `/metrics` exposés ; `healthcheck:` ajouté à `backend-core` ; endpoints de santé documentés Swagger (C2.4.1).
- [ ] **Redaction vérifiée par un test** : aucun mot de passe, token, cookie ni `serialNumber` en clair dans les logs (Scénario 4 automatisé en Jest).
- [ ] **Chantier B** : profil `obs` opérationnel ; `docker compose --profile app --profile obs up -d` sur un poste vierge donne Grafana **déjà provisionné** (datasources, 3 dashboards, règles d'alerte) — Scénario 6 rejoué.
- [ ] **Chantier C** : les 8 sondes du tableau §4.3 sont actives et visibles dans Grafana.
- [ ] **Cycle d'alerte prouvé de bout en bout** : arrêt de service → mail `CRITIQUE` dans Mailpit en < 2 min → redémarrage → mail `Resolved`. **Captures d'écran archivées** (preuve jury).
- [ ] **Scénario 5 vérifié** : `/metrics`, `/loki`, `/prometheus` renvoient 404 à travers la gateway.
- [ ] **Déployé sur la VM OVHcloud** et laissé en observation avec du trafic réel — condition pour que C4.2.1 porte sur des anomalies « détectées en production » et non simulées.
- [ ] **L'anomalie IPv6 de SH-30 est effectivement détectée par la supervision** (elle n'a pas été corrigée en douce dans ce ticket).
- [ ] `SUPERVISION.md`, `RUNBOOK.md` et `FICHE_ANOMALIE.md` rédigés.
- [ ] Aucun secret en dur ; `SMTP_*` et `GRAFANA_ADMIN_PASSWORD` en variables d'env, absents du dépôt.
- [ ] **CI verte** : lint + audit sécurité + tests + build sur les deux services instrumentés.
- [ ] Nouvelles dépendances ajoutées **sans réintroduire de vulnérabilité** (`npm audit` = 0, hygiène SH-32 préservée).
- [ ] `docs/BACKLOG.md` mis à jour (titre, statut, compétences C4).
