# Mode d'emploi — Démo client SkillHunt

> Scénario de démonstration du MVP (Lot 1) sur la **stack conteneurisée complète**.
> Durée : ~15 min de démo + ~10 min de préparation.
> Point d'entrée unique : **http://localhost:8088** (gateway nginx, SH-5).

---

## 1. Préparation (à faire ~15 min avant, pas devant le client)

### 1.1 Démarrer la plateforme

```bash
cd skillhunt
docker compose --profile app up -d --build      # 8 conteneurs, 2-4 min au premier build
docker compose --profile app ps                 # tous doivent être "healthy"
```

> ⚠️ **Piège connu** : `restart: unless-stopped` ressuscite les **anciens** conteneurs au démarrage
> du démon Docker. Des conteneurs « healthy » ne prouvent donc **pas** que le build courant tourne.
> Toujours attendre la fin du `up -d --build` avant de tester.

Si Docker Desktop est éteint :
`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` puis attendre que `docker info` réponde (~10 s).

### 1.2 Provisionner le jeu de démo

```bash
bash scripts/seed-demo.sh
```

Le script crée les comptes, déclare 3 équipements et les fait valider par un compte admin.
Il est **idempotent** (relançable) et n'écrase rien.

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Freelance (télépilote, Toulouse) | `demo2026-pilote@skillhunt.io` | `MotDePasse2026!` |
| Recruteur | `demo2026-recruteur@skillhunt.io` | `MotDePasse2026!` |
| Admin (validation matériel) | `demo2026-admin@skillhunt.io` | `MotDePasse2026!` |

> **Pourquoi un admin créé en base ?** Le rôle `ADMIN` n'est **volontairement pas** auto-attribuable
> à l'inscription (anti-élévation de privilèges, OWASP A01). Le script le provisionne par une
> requête SQL — c'est exactement le point de sécurité à mentionner si le client demande.

### 1.3 Ouvrir les onglets à l'avance

1. `http://localhost:8088/login` — connecté en **freelance**
2. `http://localhost:8088/login` — connecté en **recruteur** (fenêtre de navigation privée : sessions séparées)
3. `http://localhost:8088/api/docs` — Swagger (preuve technique)

> ⚠️ **Rate-limiting** : `/api/v1/auth` est limité à **30 req/min par IP** (burst 10). Une rafale de
> connexions renvoie des **429** et bloque l'IP ~1 min. Connectez-vous **avant** la démo, pas pendant.

---

## 2. Le scénario (15 min)

Fil rouge : **« la preuve de compétence par la donnée technique »** — du matériel déclaré jusqu'à la mise en relation.

### Acte 1 — Le freelance construit son Armurerie (4 min)

| Étape | Où | À dire |
|---|---|---|
| 1 | `/mon-armurerie` | « Voici le Gear Locker : chaque équipement est une carte visuelle. Le statut est explicite : **En attente**, **Validé**, **Rejeté**. » |
| 2 | Bouton **Ajouter** → `/mon-armurerie/ajouter` | Déclarer en direct : catégorie **DRONE**, marque `DJI`, modèle `Mini 4 Pro`, n° de série `SN-DEMO-0004`. |
| 3 | Retour à la liste | « Le matériel arrive en **PENDING**. Une déclaration ne vaut pas preuve : elle est vérifiée. » |
| 4 | Bloc **niveau + badges** | « La gamification récompense la complétude du profil : 6 niveaux (Recrue → Légende), 7 badges. L'XP est **dérivé à la lecture**, jamais stocké — pas de compteur à truquer. » |
| 5 | **Loadout** (épingler 2 cartes) | « Le freelance met en avant 4 équipements maximum. Seul du matériel **validé** est épinglable. » |

### Acte 2 — La validation (2 min)

Sur Swagger (`/api/docs`), connecté avec le compte **admin** :

1. `POST /api/v1/auth/login` avec `demo2026-admin@skillhunt.io` → copier l'`accessToken` dans **Authorize**.
2. `GET /api/v1/gear/pending` → le `Mini 4 Pro` déclaré à l'acte 1 apparaît.
3. `PATCH /api/v1/gear/{id}/review` avec `{"decision":"VALIDATED"}`.
4. Rafraîchir `/mon-armurerie` : la carte passe **Validé** et devient épinglable.

> À dire : « C'est ce contrôle qui donne sa valeur à la donnée — et donc au matching. »

### Acte 3 — Le recruteur cherche et trouve (5 min)

| Étape | Où | À dire |
|---|---|---|
| 1 | `/recherche` (fenêtre recruteur) | Compétences : `drone, telepilote` · Lieu de mission : **Toulouse** (liste déroulante, Paris par défaut) · Rayon : **50 km**. |
| 2 | Résultats | « Score composite : **50 % compétences + 30 % volume de matériel validé + 20 % proximité**. La proximité vient de **PostGIS**, pas d'une API carto payante. » |
| 3 | Carte (Leaflet) | Les candidats sont positionnés géographiquement. |
| 4 | Clic sur le profil de démo → `/freelances/{id}/armurerie` | « Le recruteur voit le **loadout**, le niveau, les badges — mais **jamais** les numéros de série ni le matériel non validé. » |

> **Point de sécurité à souligner** : le backend ne renvoie que du `VALIDATED`, et le champ
> `serialNumber` n'est jamais exposé. Un freelance ne peut pas non plus consulter le casier
> d'un autre freelance (RBAC strict, testé).

### Acte 4 — La mise en relation (3 min)

1. Bouton **« Contacter »** sur l'armurerie publique → `/messages/{id}`.
2. Envoyer un message côté recruteur.
3. Basculer sur la fenêtre freelance → **il arrive en temps réel** (WebSocket, socket.io).

> À dire : « Le jeton d'authentification passe par le handshake WebSocket, jamais dans l'URL.
> La paire recruteur ↔ freelance est imposée côté serveur. »

---

## 3. Preuves techniques (si le client creuse)

| Question probable | Où montrer |
|---|---|
| « L'API est-elle documentée ? » | `http://localhost:8088/api/docs` — 100 % des endpoints avec `@ApiTags`/`@ApiResponse` |
| « Comment sont stockés les mots de passe ? » | **Argon2id**, JWT **RS256** + refresh tokens rotatifs invalidables via Redis |
| « Et si quelqu'un tape une autre URL ? » | Sur Swagger sans token → **401** ; avec un token freelance sur une route admin → **403** |
| « C'est testé ? » | `cd backend-core && npm test` · `cd matching-service && pytest` · CI GitHub Actions (lint + audit + tests + build) |
| « Ça se déploie comment ? » | `docker compose --profile app up` — 8 conteneurs, images durcies **non-root**, un **seul** port publié |

**Architecture en une phrase** : un monolithe NestJS pour le transactionnel, un microservice
FastAPI isolé pour le matching (écosystème data Python), une gateway nginx en point d'entrée unique,
le tout sur PostgreSQL/PostGIS + MongoDB + Redis.

---

## 4. Plan B

| Incident | Réaction |
|---|---|
| Un conteneur unhealthy | `docker compose --profile app restart <service>` puis `docker compose --profile app logs -f <service>` |
| **429** sur le login | Attendre 60 s (rate-limiting par IP — c'est une **fonctionnalité**, l'assumer devant le client) |
| Écran blanc au chargement | Vider le cache (`Ctrl+Shift+R`) : le bundle Vite est cuit au build |
| Le matching ne renvoie rien | Vérifier que le freelance a du matériel **VALIDATED** et une position (`scripts/seed-demo.sh` les garantit) |
| Base polluée par d'anciennes recettes | Repartir propre : `docker compose --profile app down -v` puis reprendre au §1.1 (**efface toutes les données**) |

---

## 5. Ce qui n'est pas dans le périmètre (à assumer si la question vient)

- **Application mobile React Native** : Lot 2 / V1.2, volontairement reportée pour sécuriser le délai du MVP.
- **Pipeline vidéo 4K/360°** (transcodage, CDN) : dé-priorisé au cadrage du 16/07.
- **Publication d'offres** et **résolveur de besoin** : backlog post-MVP (SH-37, SH-33).

> 💡 La **double authentification (TOTP)** est en revanche disponible : bouton
> « Activer la double authentification » sur `/mon-compte`. Bon atout à sortir si le client
> pousse sur la sécurité.
