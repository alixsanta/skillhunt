**Titre du Ticket :** [SH-30] Mise en production V1.0 (staging démo jury) + PCA (rollback < 5 min)
**Type :** Feature (infrastructure)
**Priorité :** High
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.2 (déploiement/exploitation), C2.1.2 (reproductibilité)
**Lot :** Lot 1 (Web MVP)

> **Origine.** SH-2 a rendu la plateforme conteneurisée et reproductible (une image, N configs
> par variables d'env). Ce ticket franchit la dernière étape : publier les images sur un
> **registre** (GHCR) et les faire tourner sur une **VM accessible publiquement**, gratuitement,
> pour la soutenance du 23/07/2026. Pas de domaine possédé → pas de TLS ce soir : accès démo en
> HTTP nu sur l'IP publique (dégradation assumée, documentée §4).

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** sans hébergement public, la démo jury dépend du poste de l'utilisatrice.
- [x] **Specs Complètes :** runbook §4 ci-dessous.
- [x] **UX/UI Validé :** n/a (infrastructure).
- [x] **Faisabilité Technique :** images déjà 12-factor (SH-2/SH-6/SH-31) ; LocalStack évite un compte AWS réel.
- [x] **Estimé :** 5 SP.

### 1. User Story
**En tant que** mainteneuse de SkillHunt,
**Je veux** publier les images applicatives sur un registre et les déployer sur une VM gratuite,
**Afin de** présenter une démo accessible publiquement au jury sans dépendre de mon poste.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** Soutenance le 23/07/2026 (cf. mémoire `rendu-mvp-23-juillet`) ; le
  jury évalue en priorité dossier + dépôt Git (CI/tests/Swagger), mais une démo live renforce
  la preuve de compétence C2.2.2.
* **Choix d'hébergement :** VM **OVHcloud Public Cloud**, financée par l'essai gratuit
  (200 $ de crédit, 30 jours, réservé au premier projet Public Cloud du compte). Suffisant et
  largement dimensionné pour une démo d'un jour (~0,08 €/h pour une instance b2-7/b2-15).
  Alternative écartée : Oracle Cloud "Always Free" (gratuit à vie mais capacité ARM parfois
  indisponible — risqué la veille d'une soutenance) ; PaaS gratuits (Render/Fly) qui n'orchestrent
  pas facilement un compose multi-services avec Mongo+Redis sans coût.
  ⚠️ **L'essai n'est pas gratuit à vie** : une carte bancaire est enregistrée et sera débitée
  automatiquement passé les 30 jours / le crédit épuisé — **supprimer le projet Public Cloud
  après la soutenance** si on ne compte pas continuer à l'utiliser.
* **PCA / rollback :** chaque image est poussée avec deux tags (`latest` + SHA du commit) →
  revenir à la version précédente = republier `docker-compose.staging.yml` avec le SHA voulu et
  `docker compose up -d`, sans rebuild (< 5 min).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Publication des images**
* **GIVEN** le workflow `publish-staging.yml` lancé manuellement avec l'IP publique de la VM
* **WHEN** les 4 jobs de la matrice se terminent
* **THEN** `ghcr.io/alixsanta/skillhunt/{backend-core,matching-service,frontend-web,gateway}:latest` existent et sont **publics** (pull sans authentification depuis la VM).

**Scénario 2 : Démarrage sur la VM**
* **GIVEN** Docker installé sur la VM et `docker-compose.staging.yml` + `.env.staging` copiés
* **WHEN** `docker compose --env-file .env.staging -f docker-compose.staging.yml up -d`
* **THEN** les 7 conteneurs démarrent et deviennent `healthy` (postgres, redis, mongo, localstack, backend-core, matching-service, frontend-web) + gateway.

**Scénario 3 : Boucle démo accessible publiquement**
* **GIVEN** le port 80 ouvert dans le security group Horizon (OVH)
* **WHEN** un navigateur externe visite `http://<IP_VM>`
* **THEN** la SPA se charge, `/api/docs` (Swagger) répond, et la boucle démo (register → déclaration matériel → recherche matching → armurerie publique) fonctionne de bout en bout.

**Scénario 4 : Rollback**
* **GIVEN** un incident sur `:latest` pendant la démo
* **WHEN** on repointe le compose sur le tag `:<SHA_précédent>` et relance `up -d`
* **THEN** la plateforme revient à l'état antérieur en moins de 5 minutes, sans rebuild.

### 4. Spécifications Techniques — Runbook de déploiement

**Préparé côté repo (fait, cf. commits de ce ticket) :**
- `docker-compose.staging.yml` : ajout du service `localstack` (S3 émulé, zéro compte AWS),
  variables d'infra (`DB_HOST=postgres`, `MONGODB_URL`, `MATCHING_SERVICE_URL`…) injectées via
  `environment:` + interpolation `${POSTGRES_USER}` (nécessite `--env-file .env.staging`
  explicite — Compose ne lit sinon que `.env`), port `443` retiré (pas de TLS ce soir), owner
  GHCR corrigé (`alixsanta`, pas un pseudonyme).
- `.env.staging` : variables réellement lues par le code (backend-core lit `DB_HOST/PORT/
  USERNAME/PASSWORD/NAME`, **pas** `DATABASE_URL` — piège du brouillon initial), paire JWT
  RS256 dédiée au staging (base64, jetable), clé AES-256 2FA générée, retrait de
  `MAPBOX_API_KEY`/`SENDGRID_API_KEY` (non câblés dans le code, cf. grep — le front utilise
  Leaflet/OSM, pas Mapbox). Fichier ajouté au `.gitignore` (absent à tort du filtre `*.env`).
- `.github/workflows/publish-staging.yml` : build + push des 4 images sur GHCR via
  `workflow_dispatch` (input `vite_api_url`, cuit dans le bundle frontend au build).

**À faire (Manager OVHcloud, création de compte + carte bancaire) :**
1. Créer un compte OVHcloud puis un **premier** projet Public Cloud (condition de l'essai
   gratuit — un compte ayant déjà eu un projet Public Cloud n'est plus éligible aux 200 $/30j).
   Carte bancaire enregistrée mais non débitée pendant l'essai.
2. Dans le projet → **Settings → SSH Keys → Add an SSH key** : coller une clé publique
   (`~/.ssh/id_ed25519.pub` ou en générer une : `ssh-keygen -t ed25519`).
3. **Create an instance** :
   - Région : la plus proche (ex. Gravelines/GRA ou Strasbourg/SBG).
   - Modèle/Flavor : famille **b2** (pay-as-you-go, sans engagement — **pas** b3/c3/r3 qui sont
     des « Savings Plans » avec engagement). **b2-7** (2 vCPU/7 Go) suffit ; **b2-15**
     (4 vCPU/15 Go, ~0,17 €/h) si on veut plus de marge — coût négligeable sur une demi-journée.
   - Distribution : **Ubuntu 22.04**.
   - Clé SSH : celle ajoutée à l'étape 2.
   - Réseau : mode **Public** (accès Internet direct par IPv4).
   - *Launch my instance* → attendre quelques minutes, noter l'**IP publique** (Dashboard →
     Networks).
4. ⚠️ **Les ports entrants sont fermés par défaut** (contrairement à certains VPS) : Network →
   **Security Groups** (interface Horizon) → créer/éditer le security group de l'instance →
   ajouter deux règles d'*Ingress* : TCP **22** (SSH, si pas déjà présente) et TCP **80**
   (HTTP), source `0.0.0.0/0`.
5. SSH sur la VM (`ssh ubuntu@<IP_VM>`), installer Docker :
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-plugin
   sudo usermod -aG docker $USER   # puis se reconnecter
   ```
6. Rendre les 4 packages GHCR **publics** (GitHub → onglet Packages du repo → chaque package
   → *Package settings* → *Change visibility* → Public) pour que la VM `pull` sans PAT.
7. Lancer le workflow `publish-staging.yml` (GitHub → Actions → Run workflow) avec
   `vite_api_url = http://<IP_VM>` (étape 3).
8. Sur la VM : copier `docker-compose.staging.yml` et `.env.staging`, renseigner
   `CORS_ORIGIN=http://<IP_VM>` dans `.env.staging`, puis :
   ```bash
   docker compose --env-file .env.staging -f docker-compose.staging.yml pull
   docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
   docker compose -f docker-compose.staging.yml ps   # attendre "healthy" partout
   ```
9. Vérifier depuis un poste externe : `http://<IP_VM>/api/docs` (Swagger) puis la boucle démo.
10. **Après la soutenance** : supprimer l'instance et le projet Public Cloud (Manager OVHcloud)
    pour éviter toute facturation une fois l'essai terminé.

### 5. Definition of Done (DoD)
- [x] Fichiers de config staging corrigés et cohérents avec le code réel (variables d'env vérifiées module par module).
- [x] Workflow CI de publication GHCR créé.
- [ ] VM OVHcloud Public Cloud créée (action utilisatrice).
- [ ] Images publiées et rendues publiques sur GHCR.
- [ ] Stack `up` sur la VM, 7 conteneurs `healthy`.
- [ ] Boucle démo vérifiée depuis un poste externe à l'IP publique.
- [ ] `docs/BACKLOG.md` mis à jour (statut SH-30).
