# Guide de démonstration — jour de l'oral

> **Objet.** Conduire les **5 minutes de démonstration** de la slide 29 sans improviser.
> Complète le script de soutenance (`SkillHunt-Bloc3-Script-Soutenance.docx`) : le script dit
> *ce qu'il faut dire*, ce guide dit *où cliquer, dans quel ordre, et quoi faire si ça tombe*.
>
> **C3.4.2 est éliminatoire.** Sans démonstration, le bloc 3 n'est pas validé, quel que soit
> le reste de la présentation.
>
> **Environnement retenu : la stack conteneurisée locale** (`http://localhost:8088`).
> L'abonnement OVHcloud est résilié avant renouvellement — la production ne sera plus
> joignable le jour J. Voir §2 : il y a des captures à faire **avant** de résilier.
>
> Vérifié de bout en bout sur la stack locale le **2026-09-03** (§10). Incidents traités
> le même jour : §11.

---

## 1. La fiche mémo — à imprimer, une page

| | |
|---|---|
| **URL de démonstration** | `http://localhost:8088` |
| **Swagger (API documentée)** | `http://localhost:8088/api/docs` |
| **Mot de passe de tous les comptes** | `MotDePasse2026!` |
| **Recruteur** | `demo2026-recruteur@skillhunt.io` |
| **Freelance seedé** (secours) | `demo2026-pilote@skillhunt.io` — 3 matériels validés |
| **Admin** (validation) | `demo2026-admin@skillhunt.io` |
| **Freelance créé en direct** | `pilote-jury-<JJMM>@skillhunt.io` — *voir §5, point 8* |
| **Recherche qui matche** | compétences `drone, telepilote` · ville **Toulouse** · rayon **50 km** |
| **Scores attendus** | `DemoPilote` **0.88** · le pilote créé en direct **0.76** · `max` **0.2** |

**Les trois chiffres à connaître par cœur** (le jury demandera comment le score est calculé) :
`0,50 × compétences + 0,30 × matériel + 0,20 × localisation`.
Les compétences sont **inférées des catégories de matériel validé** — c'est exactement ça, le
cœur différenciant : le score ne repose pas sur du déclaratif, il repose sur du matériel vérifié.

> Détail du 0.88 : compétences 1,0 (`drone` et `telepilote` sont tous deux couverts par la
> catégorie DRONE) × 0,50 · matériel 3/5 = 0,6 × 0,30 · localisation 1,0 (distance nulle)
> × 0,20 = **0,88**. Le pilote créé en direct n'a qu'un équipement : 0,50 + 0,06 + 0,20 = **0,76**.

**Les deux commandes du jour :**

```bash
docker compose --profile app up -d          # sans --build : voir §5
bash scripts/seed-demo.sh                   # jeu de démo, idempotent
```

---

## 2. À faire AVANT de résilier OVHcloud — fenêtre qui se ferme

La production a réellement tourné : `v1.0.0` le 23 juillet, `v1.0.1` le 18 août, `v1.1.0` vers
le 20 août, avec une anomalie détectée en conditions réelles ([`AN-01`](../anomalies/AN-01-healthcheck-ipv6.md)).
**C'est un actif de soutenance.** Une fois l'instance supprimée, il n'en restera que ce qui aura
été capturé. Une heure de travail, à faire avant la résiliation :

- [ ] **Enregistrer la vidéo de secours sur la production**, pas en local. Elle sert deux fois :
      de filet si la démo tombe (§8), et de preuve que le logiciel a tourné sur un environnement
      réel. C'est la tâche la plus rentable de toute la préparation.
- [ ] **Captures d'écran** : l'application en production, `http://147.135.230.140/api/v1/health/ready`
      avec ses trois dépendances `up`, et le `docker compose ps` de la VM.
- [ ] **Captures des tableaux de bord Grafana** de la VM (tunnel SSH — le port 3000 n'est pas
      exposé publiquement, c'est volontaire). Sans elles, la supervision de `SH-29` n'a plus
      d'illustration en conditions réelles.
- [ ] **Compléter la ligne `v1.1.0` du [`CHANGELOG.md`](../../CHANGELOG.md)** : la date de
      déploiement et le commit publié y sont encore marqués *« à compléter »*. Mesure faite le
      2026-08-30 : le backend affichait **904 354 s d'uptime**, soit un démarrage autour du
      **19–20 août** — à confirmer sur la VM (`docker compose ps`) pendant qu'elle existe encore.
- [ ] **Vérifier que les 4 images GHCR restent publiques.** C'est ce qui rend le redéploiement
      reproductible sans la VM, et ce qu'on peut montrer au jury si on l'interroge sur le PCA.

> [`SH-30`](../tickets/SH-30-mise-en-production.md) §10 prévoyait la suppression de l'instance
> *après* la soutenance. Elle a lieu avant : le noter dans le ticket, avec la raison. Une
> décision datée et motivée vaut mieux qu'un écart silencieux.

---

## 3. Deux écarts entre le script et le produit — à corriger avant de répéter

Le script de soutenance annonce deux gestes que **l'interface ne sait pas faire** en Lot 1.
Les promettre au jury puis ne pas les montrer serait le pire scénario sur une compétence
éliminatoire. Voici quoi dire à la place.

### Écart 1 — « Je bascule sur l'espace d'administration »

**Il n'y a pas d'écran d'administration.** C'est un choix assumé, écrit dans le code
([`nav-items.ts`](../../frontend-web/src/features/navigation/nav-items.ts) : *« L'admin valide
le matériel via l'API — aucun écran dédié dans le Lot 1 »*). La file de validation existe et
elle est **documentée dans Swagger** : `GET /api/v1/gear/pending`, `PATCH /api/v1/gear/{id}/review`.

**Ce qu'on fait à la place** : on valide par l'API depuis un terminal préparé, et on montre
Swagger. C'est plus fort que l'inverse — ça prouve que le back-office est une API documentée
et testable, pas un écran bricolé pour la démonstration.

**Phrase de remplacement, à dire mot pour mot :**

> « La validation par l'administrateur est une API documentée. Dans le Lot 1, j'ai arbitré de
> ne pas construire d'écran d'administration : il n'apporte rien à la démonstration du cœur
> différenciant, et il coûtait deux jours. Voici la file de validation dans la documentation
> OpenAPI, et voici l'appel qui bascule l'équipement en statut vérifié. »

### Écart 2 — « Je dépose une certification »

L'API des certifications existe (dépôt PDF, file de validation, Signed URL, purge RGPD :
`backend-core/src/certifications/`), mais **il n'y a pas d'écran de dépôt** dans le front.

**Ce qu'on fait à la place** : on **retire le geste** du temps 1, et on montre les endpoints de
certification dans Swagger pendant le temps 2, en une phrase, sur le même écran que la
validation du matériel :

> « La certification suit exactement le même circuit — dépôt, file de validation, lien signé à
> durée limitée, purge des données personnelles du document original. L'API est là ; l'écran
> de dépôt fait partie du Lot 2. »

**À supprimer du script parlé** : *« Je dépose maintenant une certification, et vous voyez son
statut passer en attente de vérification. »* Les huit secondes gagnées vont au temps 3.

---

## 4. Préparation — le rétroplanning

### J-7

- [ ] Toutes les captures du **§2**, puis résiliation OVHcloud.
- [ ] **Un passage complet sur la stack locale**, du `up -d --build` jusqu'à la phrase de
      clôture, en incluant le **temps 4** (chat), seul segment jamais vérifié de bout en bout.
- [ ] Vérifier les scores affichés et **corriger la fiche mémo** s'ils diffèrent (§11 : ils
      bougent dès qu'une recette e2e laisse des comptes derrière elle).

### J-3 — répétitions

- [ ] Trois passages complets **chronométrés**.
- [ ] Le §3 doit être su : les deux phrases de remplacement, sans hésitation.
- [ ] **Construire les images une bonne fois** (`--build`) et ne plus y toucher.

### J-1

- [ ] `docker compose --profile app up -d --build` une dernière fois, puis vérifier que tout
      est `healthy`. Laisser les images construites. **Ne pas coder après ce build** : tout
      commit postérieur ne sera pas dans l'image (§11).
- [ ] **Chargeur** dans le sac : huit conteneurs sur batterie, ce n'est pas une option.
- [ ] Adaptateur vidéo. Tester la sortie écran si l'occasion se présente.

---

## 5. T-45 minutes — la mise en place

Le démarrage de la stack est devenu **le** point critique : c'est la seule chose entre le jury
et la démonstration. Il ne se fait pas dans les cinq dernières minutes.

1. **Démarrer Docker Desktop** et attendre qu'il réponde :
   ```bash
   docker info
   ```
2. **Démarrer la stack, sans reconstruire** :
   ```bash
   docker compose --profile app up -d
   ```
   > **Sans `--build`.** Les images ont été construites au J-1 : reconstruire le jour J, c'est
   > deux à quatre minutes de risque pour zéro gain. Ne reconstruire que si le code a changé
   > depuis — auquel cas ce n'est plus la version répétée.
   >
   > **Ne pas démarrer le profil `obs`** (supervision) : six conteneurs de plus pour rien
   > pendant la démonstration, sur une machine qui pilote aussi un vidéoprojecteur.

3. **Vérifier**, et ne pas se contenter de « ça a l'air parti » :
   ```bash
   docker compose --profile app ps        # tout doit être "healthy"
   curl -s http://localhost:8088/api/v1/health/ready
   ```
   Attendu : `{"status":"ok", … postgres/redis/mongodb: "up"}`.

   > **Piège connu.** Au démarrage de Docker Desktop, `restart: unless-stopped` ressuscite les
   > **anciens** conteneurs. Des conteneurs `healthy` ne prouvent donc pas que la bonne version
   > tourne : toujours attendre la fin de la commande `up`.

4. **Provisionner le jeu de démonstration** (idempotent, relançable sans risque) :
   ```bash
   bash scripts/seed-demo.sh
   ```
   S'il affiche *« Matériel déjà présent »*, c'est normal : la base locale garde son état.

5. **Lancer la recherche de contrôle** — trente secondes, et ça évite la mauvaise surprise
   du §11 :
   ```bash
   bash scripts/demo-valider.sh demo2026-pilote@skillhunt.io   # doit dire "aucun matériel en attente"
   ```
   Puis, dans l'interface, la recherche du §1 : **trois résultats, 0.88 / 0.76 / 0.2**, pas neuf.

6. **Fermer** messagerie, mail, notifications. Mode « Ne pas déranger ». Fond d'écran neutre.
   **Zoom du navigateur à 125 %** — un vidéoprojecteur de salle de soutenance est petit et loin.

7. **Ouvrir les quatre onglets, dans cet ordre**, et s'y connecter :

| # | Fenêtre | Onglet | État à laisser |
|---|---|---|---|
| 1 | **Normale** | `http://localhost:8088/register` | Formulaire vierge, **rien de saisi** |
| 2 | **Normale** | `http://localhost:8088/api/docs` | Swagger chargé, replié sur la section `gear` |
| 3 | **Privée** | `http://localhost:8088/recherche` | **Connectée** en `demo2026-recruteur` |
| 4 | Terminal | dossier du projet | Commande du temps 2 déjà tapée, **non validée** |

   > La fenêtre de **navigation privée** est ce qui permet de tenir deux rôles connectés en même
   > temps. Sans elle, chaque bascule de rôle coûte vingt secondes — soit un tiers du temps 3.

8. **Préparer l'email du pilote créé en direct** : `pilote-jury-<jour><mois>@skillhunt.io`
   (ex. `pilote-jury-1509@skillhunt.io`). **Un email déjà utilisé en répétition renverra une
   erreur devant le jury** — changer le suffixe à chaque passage.

---

## 6. Le déroulé — 5 minutes, quatre temps

> **Un fil narratif, jamais une visite de menus.** Une personne veut être trouvée, une autre
> veut trouver. Tout ce qui n'appartient pas à cette histoire ne se montre pas.

### Temps 1 — Le télépilote · ~1 min 15 · *onglet 1*

| Geste | Ce qu'on doit voir | Ce qu'on dit |
|---|---|---|
| Remplir l'inscription : email du jour, `PiloteJury`, `MotDePasse2026!` (deux fois), rôle **Freelance**, ville **Toulouse** | Le champ **ville** est obligatoire pour un freelance | « Je renseigne ma ville d'activité, parce que c'est elle qui alimentera la recherche géographique. » |
| Valider | Arrivée sur **Mon Armurerie**, vide | « Et voici l'Armurerie. » |
| **+ Ajouter du matériel** → catégorie **Drone**, `DJI`, `Mavic 3 Enterprise`, série `SN-JURY-01` | La carte apparaît au statut **ATTENTE** | « Au lieu d'un formulaire de matériel, le télépilote déclare ses drones sous forme de cartes, avec une progression et des badges. La contrepartie est immédiate : chaque équipement déclaré améliore la précision avec laquelle il sera trouvé. Et il est en attente de vérification — une déclaration n'est pas encore une preuve. » |

**Pièges** : la ville est un menu déroulant de douze villes, pas un champ libre — ne pas taper.
Le mot de passe exige **12 caractères, une minuscule, une majuscule et un chiffre** (les règles
s'affichent sous le champ) et demande une **confirmation** — `MotDePasse2026!` les satisfait.
Ne pas s'attarder sur le formulaire d'inscription : c'est le seul écran banal de la démonstration.

### Temps 2 — La validation par l'administrateur · ~45 s · *onglets 4 puis 2*

| Geste | Ce qu'on doit voir | Ce qu'on dit |
|---|---|---|
| Terminal (onglet 4) : lancer la commande préparée | `✅ DJI Mavic 3 Enterprise → VALIDATED` | Phrase de remplacement du **§3, écart 1** |
| Basculer sur Swagger (onglet 2) : déplier `GET /gear/pending` puis `PATCH /gear/{id}/review` | La documentation OpenAPI des deux endpoints | « Voici la file de validation, documentée. » |
| Mentionner les certifications | Section `certifications` de Swagger | Phrase du **§3, écart 2** |
| Revenir à l'onglet 1, `F5` | La carte passe **ATTENTE → VALIDÉ**, l'XP monte, le badge **Première validation** s'allume | « C'est cette étape qui donne sa valeur au badge Vérifié côté recruteur : sans elle, une déclaration ne serait qu'une affirmation. » |

**La commande à préparer dans le terminal** (tapée, non validée) :

```bash
bash scripts/demo-valider.sh pilote-jury-1509@skillhunt.io
```

*(adapter l'email à celui du jour ; le script est décrit au §7)*

### Temps 3 — Le recruteur · ~1 min 45 · *onglet 3* — **le temps le plus important**

| Geste | Ce qu'on doit voir | Ce qu'on dit |
|---|---|---|
| Champ **compétences** : `drone, telepilote` | | « Je filtre sur une compétence… » |
| Ville **Toulouse**, rayon **50 km**, puis lancer | **Trois profils classés** : `DemoPilote` **0.88**, le pilote créé en direct **0.76**, `max` **0.2** — tous **placés sur la carte** | « Les profils remontent classés par score de correspondance. Ce score croise les compétences, le matériel déclaré et la distance. » |
| **Montrer du doigt l'écart entre les deux premiers** | | « Les deux sont à Toulouse et couvrent la compétence. Ce qui les départage, c'est le volume de matériel vérifié : trois équipements contre un. C'est ici que se joue toute la valeur du produit — un filtre sur le matériel réellement possédé, qu'aucune plateforme généraliste ne sait faire. » |

**C'est le sommet de la démonstration** : le profil créé quatre-vingt-dix secondes plus tôt
apparaît dans les résultats. Le dire explicitement — *« ce deuxième profil, c'est celui que
nous venons de créer »* — et ralentir.

**Pièges** :
- La carte charge ses fonds de plan depuis OpenStreetMap : **c'est la seule chose qui a encore
  besoin d'Internet**, tout le reste tourne sur la machine. Sans réseau, les marqueurs
  s'affichent sur un fond gris ; la démonstration reste valable, ne pas s'en excuser, enchaîner.
- Si le pilote créé en direct **n'apparaît pas**, c'est que le temps 2 a échoué (matériel resté
  en ATTENTE, donc score effondré). Continuer avec `DemoPilote` seul, et le dire simplement.
- Le cache de recherche vit 60 secondes mais il est **invalidé par l'événement de validation** :
  chercher juste après le temps 2 renvoie bien des résultats à jour.
- Le troisième résultat, `max` à **0.2**, est un compte personnel **sans matériel validé**. Il ne
  gêne pas : il illustre au contraire que sans preuve validée, le score s'effondre. Si le jury
  pose la question, c'est la réponse.

### Temps 4 — La mise en relation · ~1 min · *onglets 3 puis 1*

| Geste | Ce qu'on doit voir | Ce qu'on dit |
|---|---|---|
| Cliquer sur le pilote créé en direct → son **armurerie publique** | Le matériel avec son badge **VALIDÉ**, le niveau, les badges | « Le recruteur voit le matériel vérifié, pas seulement déclaré. » |
| Bouton **Contacter** | Le fil de discussion s'ouvre | |
| Écrire un message court : `Bonjour, disponible pour une mission à Toulouse ?` | | |
| Basculer sur l'onglet 1 (le pilote) → **Messages** | **Le message est déjà là**, sans rechargement | « Et le chat contextuel, en temps réel. » |

**La phrase de clôture, mot pour mot :**

> « Cette version couvre l'intégralité du périmètre du Lot 1 tel qu'il a été arbitré le
> 16 juillet. Je vous propose de la valider pour la mise en production. »

Puis **se taire**, revenir face au jury, et attendre.

---

## 7. Le script de validation

[`scripts/demo-valider.sh`](../../scripts/demo-valider.sh) fait, en quelques appels HTTP, ce
qu'un écran d'administration ferait : il se connecte en administrateur, lit la file de
validation, **ne retient que le matériel du freelance visé**, et le bascule en `VALIDATED`.
Il cible `http://localhost:8088` par défaut.

```bash
# Nominal
bash scripts/demo-valider.sh pilote-jury-1509@skillhunt.io

# Répétition à blanc : liste sans rien valider
DRY_RUN=1 bash scripts/demo-valider.sh pilote-jury-1509@skillhunt.io
```

Le filtrage par freelance n'est pas cosmétique : la file contient le matériel en attente de
**tous** les comptes — au 03/09, un équipement du compte personnel `max` y dort encore. Valider
en aveugle toucherait des données qui ne sont pas celles de la démonstration.

---

## 8. Plans de repli — en cascade

> Règle : **on ne débogue jamais devant le jury.** Une tentative de réparation, pas deux.
> Au-delà de trente secondes de flottement, on bascule au plan suivant en l'annonçant
> calmement : *« je bascule sur mon enregistrement de secours »*. Un incident géré posément est
> une compétence d'exploitation, pas un échec.

| Plan | Quand | Quoi | Coût |
|---|---|---|---|
| **A** | Nominal | Stack locale `http://localhost:8088` | — |
| **A′** | Un conteneur est tombé | `docker compose --profile app up -d <service>` — **une seule tentative** | ~20 s |
| **B** | La stack ne répond pas | **Vidéo de secours** enregistrée sur la production, son coupé, commentée en direct avec le même texte | 0 s |
| **C** | Pas de vidéoprojecteur, ou le portable ne s'allume pas | Les captures d'écran de la présentation, commentées dans le même ordre | 0 s |

**Il n'y a plus d'environnement de secours vivant.** Tant que la production existait, une panne
locale se rattrapait en changeant d'URL ; ce n'est plus le cas. **La vidéo n'est plus un
confort, c'est le seul filet** — d'où sa place en tête du §2.

**Deux règles matérielles** qui découlent du choix du local :
- **Brancher le secteur.** Huit conteneurs vident une batterie vite, et une mise en veille
  pendant la partie « pilotage » couperait la stack juste avant la démonstration.
- **Désactiver la mise en veille** et l'écran de verrouillage pour la durée de la soutenance.

---

## 9. Les questions du jury pendant la démonstration

**« Pourquoi une démonstration en local et pas en production ? »**
Parce que l'environnement de production était financé par un essai gratuit, arrivé à échéance,
et que j'ai choisi de résilier plutôt que de laisser courir un abonnement. La production a bien
existé : trois versions y ont été déployées entre le 23 juillet et le 20 août, le journal des
versions en garde la trace commit par commit, et une anomalie y a été détectée puis corrigée en
conditions réelles. Ce que vous voyez ici, ce sont **les mêmes images**, construites par la
chaîne d'intégration et publiées sur un registre public : la démonstration locale n'est pas une
maquette, c'est le même artefact déployé ailleurs.

**« Pourquoi n'y a-t-il pas d'écran d'administration ? »**
C'est un arbitrage de périmètre, pas un oubli. La file de validation est une API documentée et
testée ; l'écran ne servait pas la démonstration du cœur différenciant. Il est au backlog,
budgété, en Lot 2.

**« Comment ce score est-il calculé ? »**
0,50 × compétences + 0,30 × matériel + 0,20 × localisation. Les compétences sont **inférées des
catégories de matériel validé** : le score ne récompense pas le déclaratif, il récompense la
preuve. La distance vient de PostGIS, avec un index géospatial.

**« Que se passe-t-il si le freelance ment sur son matériel ? »**
C'est précisément le rôle de l'étape de validation : le matériel non validé ne compte pas dans
le score. La confiance ne vient pas de la déclaration, elle vient de la vérification.

**« Le chat permet-il d'échanger des fichiers vidéo ? »**
Non. Le périmètre acté est le **texte seul, en un-à-un** recruteur–freelance. Le partage de
fichiers lourds dépend du microservice Média, reporté en Lot 2. — *Ne jamais le promettre.*

**« Pourquoi les résultats sont-ils si peu nombreux ? »**
Parce que c'est un environnement de démonstration au jeu de données maîtrisé, pas une base
peuplée. Le comportement du moteur est le même à un profil qu'à mille : le filtre géographique
est fait par PostGIS, pas en mémoire.

---

## 10. Ce qui a été vérifié, et quand

**Vérifié le 2026-09-03 sur la stack locale**, après reconstruction des images :

- `docker compose --profile app up -d --build` → exit 0 ; `postgres`, `redis`, `mongodb` tous `up`
- Le bundle servi par la gateway porte bien le formulaire courant (règles de mot de passe,
  confirmation) — écran `/register` contrôlé au navigateur
- **Temps 1** : inscription FREELANCE à Toulouse → `201` ; déclaration d'un drone → `PENDING`
- **Temps 2** : `scripts/demo-valider.sh` → `✅ DJI Mavic 3 Enterprise → VALIDATED`
- **Temps 3** : recherche (drone, telepilote · Toulouse · 50 km) → `DemoPilote` **0.88**,
  pilote créé en direct **0.76**, `max` **0.2**. Le 0,76 annoncé par le calcul est **confirmé
  par la mesure**.
- `seed-demo.sh` relancé sans effet de bord (idempotence vérifiée)

**Pas encore vérifié — à faire en répétition** : le **temps 4** (armurerie publique, bouton
Contacter, chat temps réel entre deux fenêtres) et le rendu de la carte au vidéoprojecteur.

---

## 11. Incidents traités le 2026-09-03

**Le 8088 servait un build vieux de deux jours.** Les images dataient du 01/09 à 19:50 alors que
les commits front de `SH-51` sont du 03/09 : le formulaire d'inscription affiché n'était pas
celui du code. *Cause : aucune reconstruction depuis.* Corrigé par
`docker compose --profile app up -d --build`. **C'est exactement pour ça que le J-1 exige un
build et le jour J un simple `up -d` — et pour ça qu'il ne faut plus coder après ce build.**

**L'inscription échouait sur le serveur de développement (5173).** Plus aucun processus
n'écoutait sur `3001` ni `5173` : la page ouverte dans le navigateur était un reliquat en
mémoire, et sa requête partait vers `http://localhost:3001` (repli de `api/client.ts`), d'où un
`ERR_CONNECTION_REFUSED` au préflight. **Sans conséquence pour la soutenance** : la démonstration
se fait sur `8088`, qui n'a besoin d'aucun serveur de développement.

> ⚠️ **Le message d'erreur de l'inscription est trompeur.** [`Register.tsx`](../../frontend-web/src/pages/Register.tsx)
> attrape *toutes* les erreurs dans un `catch` nu et affiche toujours « Cet email est peut-être
> déjà utilisé », y compris pour une panne réseau — c'est ce qui a orienté le diagnostic au
> mauvais endroit. Si une inscription échoue le jour J, **ne pas croire le message** : regarder
> l'onglet réseau.

**La base locale était polluée par d'anciennes recettes.** La recherche remontait **neuf**
profils, dont deux comptes e2e du 17/07 à **0.9976** — donc *devant* `DemoPilote`. 24 comptes de
test et l'ancien jeu de démo de juillet ont été supprimés (par email explicite, cascade sur
`gear`). Restent cinq comptes : les trois `demo2026-*`, le compte personnel `max`, et `Mila M`.

> À retenir : **une base de démonstration se cultive.** Chaque recette e2e y laisse des comptes,
> et ils remontent dans les résultats devant le jury. D'où la vérification ajoutée au §5, point 5.
