# [AN-01] HEALTHCHECK résolu en IPv6 : `gateway` et `frontend-web` marqués `unhealthy` alors qu'ils servent le trafic

| | |
|---|---|
| **Identifiant** | AN-01 |
| **Détectée le** | 2026-07-23, lors de la vérification du déploiement de `v1.0.0` |
| **Détectée par** | ☑ Découverte fortuite (inspection de `docker compose ps`) — ☐ Sonde · ☐ Utilisateur · ☐ CI |
| **Sévérité** | ☑ Mineure (aucune indisponibilité) — mais **masquante**, voir §2 |
| **Environnement** | ☑ Production (VM OVHcloud `147.135.230.140`, Ubuntu 22.04) |
| **Version déployée** | `v1.0.0` — SHA `a94568ab5e564cc64ad71b43cefa92e776802b60` |
| **Composant** | `gateway` et `frontend-web` (images `nginx:1.27-alpine`) |
| **Statut** | ☑ **Correctif écrit** — ☐ vérifié en production (voir §7) |
| **Ticket de correction** | `fix/SH-49-healthcheck-ipv6` |

---

## 1. Détection

**Aucune sonde n'a détecté cette anomalie** — elle a été relevée à l'œil, en inspectant
`docker compose ps` après la mise en production du 2026-07-23 : deux conteneurs affichaient
`unhealthy` alors que la plateforme répondait normalement.

Ce constat est en soi une information sur la couverture de la supervision, exploitée au §5.

## 2. Impact

- **Fonctionnalité touchée** : aucune. Les deux conteneurs servent le trafic correctement.
- **Utilisateurs concernés** : aucun.
- **Contournement** : sans objet.
- **Durée d'exposition** : du 2026-07-23 (mise en production) au correctif.
- **Données affectées** : aucune.

**L'impact réel n'est pas fonctionnel, il est diagnostique.** Un état de santé faux est plus
dangereux qu'un état de santé absent :

1. Il **désensibilise** : deux conteneurs en permanence `unhealthy` deviennent du bruit de
   fond, et l'exploitant cesse de regarder cette colonne. Une vraie panne s'y noierait.
2. Il **empêche l'orchestration** de s'appuyer dessus. Aucun `depends_on: service_healthy`
   ne peut cibler ces deux services, ce qui interdit tout démarrage ordonné les impliquant.
3. Il **fausse toute supervision** qui lirait l'état de santé Docker — et rendrait donc une
   future sonde inutilisable sur ces conteneurs.

## 3. Reproduction

**Préconditions** : hôte Linux dont le resolver privilégie IPv6 (Ubuntu 22.04 par défaut),
images `nginx:1.27-alpine` bâties depuis `gateway/Dockerfile` ou `frontend-web/Dockerfile`.

**Étapes**
1. Déployer la stack : `docker compose --env-file .env.staging -f docker-compose.staging.yml up -d`
2. Attendre l'exécution du premier HEALTHCHECK (30 s).
3. `docker compose ps` — observer la colonne d'état.
4. Vérifier en parallèle que le service répond : `curl -I http://<IP_VM>/`

**Résultat attendu** : les conteneurs sont `healthy` et servent le trafic.
**Résultat obtenu** : les conteneurs sont **`unhealthy`** et servent le trafic (`HTTP 200`).

**Reproductible** : ☑ systématiquement — **sur un hôte au resolver IPv6-first uniquement**.

> ⚠️ **Ne se reproduit PAS sous Docker Desktop/WSL** : vérifié le 2026-08-06, les deux
> conteneurs y sont `healthy`. C'est précisément ce qui a permis à l'anomalie de traverser
> tout le développement sans être vue : elle n'existe que sur la cible de production.

## 4. Traces

| Élément | Valeur |
|---|---|
| Commande de la sonde | `wget -qO /dev/null http://localhost:80/ \|\| exit 1` |
| Configuration nginx | `listen 80;` — **IPv4 uniquement**, aucune directive `listen [::]:80;` |
| Vérification manuelle | `docker exec <conteneur> wget -qO- http://127.0.0.1:80/` → succès |
| | `docker exec <conteneur> wget -qO- http://[::1]:80/` → connexion refusée |
| Documentation initiale | [`SH-30`](../tickets/SH-30-mise-en-production.md) §4 · `CHANGELOG.md`, limitations connues de la `v1.0.0` |

## 5. Analyse

**Cause racine.** `wget` de BusyBox (base Alpine) résout `localhost` en privilégiant
l'enregistrement **AAAA**, donc `::1`. Les deux `nginx.conf` ne déclarent que `listen 80;`,
qui n'écoute qu'en IPv4. La sonde tente donc une connexion IPv6 vers un serveur qui n'écoute
qu'en IPv4 : connexion refusée, `wget` sort en erreur, Docker marque le conteneur `unhealthy`.

Le service, lui, n'a jamais cessé de fonctionner : le trafic réel arrive par le proxy Docker
sur l'IPv4 du conteneur.

**Pourquoi n'a-t-elle pas été détectée plus tôt ?**

Trois raisons cumulées, chacune instructive :

1. **L'anomalie ne se manifeste pas sur l'environnement de développement.** Docker
   Desktop/WSL résout `localhost` en IPv4 en premier. Tout le développement s'est déroulé
   sans jamais voir le défaut.
2. **Aucune sonde ne surveillait ces deux conteneurs.** Vérifié le 2026-08-06 : la sonde S1
   de SH-29 ne couvre que `backend-core` et `matching-service`, et **aucune des 397 métriques
   disponibles n'expose l'état de santé d'un conteneur**. La supervision n'aurait pas non plus
   détecté l'anomalie.
3. **La CI ne teste pas les HEALTHCHECK.** `docker-ci` construit les images ; il ne vérifie
   pas que leurs sondes réussissent une fois les conteneurs démarrés.

Le point 2 a produit une amélioration indépendante et plus importante que cette anomalie :
la **sonde S9** (couverture de la gateway par sonde externe), consignée dans
[`SUPERVISION.md`](../exploitation/SUPERVISION.md) §8.

**Périmètre de propagation.** Tout conteneur bâti sur Alpine dont la sonde interroge
`localhost` et dont le serveur n'écoute qu'en IPv4. Vérification faite : seuls `gateway` et
`frontend-web` sont concernés. Le HEALTHCHECK de `backend-core` ajouté par SH-29 cible déjà
`127.0.0.1` — précisément pour ne pas reproduire ce défaut.

## 6. Préconisation de correction

**Correctif retenu** : cibler explicitement **`127.0.0.1`** dans les deux HEALTHCHECK.

**Alternative écartée : ajouter `listen [::]:80;` aux deux `nginx.conf`.** Elle corrigerait
aussi le symptôme, mais **élargirait la surface réseau** des deux services en les faisant
écouter en IPv6, ce dont ni l'un ni l'autre n'a besoin — le trafic arrive par le proxy Docker
en IPv4. Un correctif de sonde ne doit pas modifier le comportement réseau du service qu'il
surveille. Le correctif retenu est strictement local à la sonde, et cohérent avec le
HEALTHCHECK de `backend-core` posé par SH-29.

**Risque** : nul. `127.0.0.1` est l'adresse de bouclage IPv4, toujours disponible dans le
conteneur, et c'est déjà l'interface sur laquelle nginx écoute.

## 7. Suites

- [x] Ticket de correction créé : `fix/SH-49-healthcheck-ipv6`
- [x] Correctif développé (les deux Dockerfiles)
- [ ] CI verte — `docker-ci` se déclenche sur `gateway/**` et `frontend-web/Dockerfile`
- [ ] Déployé — version `vX.Y.Z` ([`PROCESS_RELEASE.md`](../exploitation/PROCESS_RELEASE.md))
- [ ] Vérifié **sur la VM** : `docker compose ps` affiche les deux conteneurs `healthy`
      *(seul environnement où l'anomalie se manifeste — la vérification locale ne prouve rien)*
- [ ] Entrée `Corrigé` au [`CHANGELOG.md`](../../CHANGELOG.md), avec renvoi à cette fiche, et
      **retrait de la ligne correspondante des limitations connues de la `v1.0.0`**
- [x] **Supervision ajustée** : sonde S9 consignée en axe d'amélioration (§5, point 2)
