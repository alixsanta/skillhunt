**Titre du Ticket :** [SH-16b] Pipeline de transcodage réel — `ffprobe` / `ffmpeg`, HLS multi-débit et poster
**Type :** Fonctionnalité
**Priorité :** High (dernier verrou de l'état `READY`)
**Estimation :** 3 Story Points
**Compétences RNCP visées :** C2.2.2 (tests), C2.1.2 (qualité), C2.2.3 (validation des entrées)
**Lot :** Lot 1 — EP04
**Dépend de :** SH-15 (scaffolding du worker) et SH-16a (flux entrant, contrat de job figé)

> Le fichier était référencé par le backlog sans exister : ce ticket comble ce lien mort,
> et reprend le périmètre déjà arrêté par la [conception EP04](../superpowers/specs/2026-08-24-EP04-media-portfolio-design.md)
> §7 et §11.

## User Story

> **En tant que** freelance télépilote,
> **je veux** que la vidéo que je dépose devienne réellement lisible,
> **afin de** prouver ma compétence par l'image plutôt que par une ligne de CV.

## Pourquoi ce ticket est le verrou

Le worker livré par SH-15 est un **no-op assumé** : il journalise le job et rend
`{ renditions: [] }`. Conséquence documentée dans SH-16a : **l'état `READY` est
inatteignable**, parce que le validateur durci de `MediaService.applyTranscodeResult`
exige une durée, des dimensions, un type et au moins une piste valide — qu'aucun worker
no-op ne peut produire.

Tout le reste de la chaîne existe donc et fonctionne : déclaration, URL PUT signée, dépôt
direct, vérification `head()`, enfilement BullMQ, écoute `QueueEvents`, balayage des
brouillons, et depuis SH-18a l'interface complète. **Il ne manque que le traitement.**

## Contrat — FIGÉ depuis SH-15, non négociable ici

```ts
// Entrée (job « media-transcode »)
{ mediaId, sourceKey, outputPrefix, posterKey }

// Sortie attendue par backend-core
{ durationSeconds, width, height, type, mimeType,
  renditions: [{ name, width, height, bandwidth, playlistKey }] }
```

Le validateur côté monolithe (`media.service.ts`) **rejette** tout résultat dont :
- `durationSeconds` n'est pas un nombre fini strictement positif ;
- `width` / `height` / `bandwidth` ne sont pas des entiers strictement positifs ;
- `type` n'est ni `VIDEO` ni `VIDEO_360` ;
- `mimeType` n'est pas dans `['video/mp4', 'video/quicktime']` ;
- une `playlistKey` sort du préfixe `private/media/<freelanceId>/<mediaId>/`.

⚠️ **Le confinement de préfixe est une exigence de sécurité, pas une formalité** : une
`playlistKey` arbitraire serait signée par SH-17 et ouvrirait un accès au stockage d'un
AUTRE freelance. Le worker doit donc dériver ses clés de l'`outputPrefix` reçu, jamais les
composer à partir d'autre chose.

## Périmètre

1. **Accès S3 depuis le worker.** Le job ne porte que des clés, pas d'URL signée : le
   worker gagne son propre client S3 (`@aws-sdk/client-s3`) — conforme à l'architecture
   §4, où `media-service` écrit en S3 directement. Il reste un **worker pur** : ni base,
   ni route métier, ni JWT.
2. **Téléchargement du master** dans `MEDIA_TMP_DIR`, plutôt que `ffmpeg -i <url>` : le 4K
   supporte mal les aléas réseau en cours de `seek` (conception §7).
3. **`ffprobe`** : durée, dimensions, et **détection de projection 360°** par les tags
   `spherical` / `equirectangular` → `type` = `VIDEO_360` (décision D5 : aucune projection
   serveur, le rendu WebGL est côté front).
4. **`ffmpeg`** : échelle ABR **360p / 720p / 1080p** (décision D3) + `poster.jpg` à
   t = 1 s. **Ne jamais sur-échantillonner** : une source 720p ne produit pas de piste
   1080p — ce serait du calcul et du stockage pour une qualité inventée.
5. **Dépôt des sorties** sous `outputPrefix` : playlists de variante et segments. Le
   manifeste maître n'est PAS produit ici (décision D4 : généré à la volée par SH-17).
6. **Nettoyage du temporaire y compris en cas d'échec** — un `finally`, pas un chemin
   heureux. Un worker qui laisse ses fichiers remplit son disque en quelques jobs.
7. **Progression** : `job.updateProgress()` alimentée par la sortie `-progress` de ffmpeg.
8. **Métriques** : jobs traités, histogramme de durée, échecs — le registre dédié existe
   déjà (`metrics.ts`).
9. **ffmpeg en CI** : le workflow doit l'installer, et la fixture de test est **générée par
   ffmpeg au setup** (décision actée) plutôt que versionnée en binaire.

## Hors périmètre

- Manifeste maître, URLs signées de lecture, route recruteur, `DELETE` → **SH-17**.
- Lecteur HLS et visionneuse 360° → **SH-18b**.
- Projection serveur des vidéos 360° (`v360`) → écartée en conception (D5).

## Critères d'acceptation (Gherkin)

```gherkin
Scénario : une vidéo déposée devient lisible
  Étant donné un média au statut UPLOADED et son master déposé en stockage
  Quand le worker traite le job de transcodage
  Alors le résultat porte une durée, des dimensions et au moins une piste
  Et chaque playlistKey reste dans le préfixe du média
  Et le média passe au statut READY

Scénario : une source 720p ne produit pas de piste 1080p
  Étant donné un master de 1280×720
  Quand le worker construit son échelle ABR
  Alors les pistes produites sont au plus de 720p
  Et aucune piste ne sur-échantillonne la source

Scénario : projection équirectangulaire détectée
  Étant donné un master portant les tags de projection sphérique
  Quand ffprobe le sonde
  Alors le type rendu est VIDEO_360

Scénario : le temporaire est nettoyé même en échec
  Étant donné un master illisible par ffmpeg
  Quand le job échoue
  Alors le répertoire temporaire du job n'existe plus
  Et le média finit FAILED avec une raison courte
```

## Correction apportée au ticket en cours de route

⚠️ Ce ticket affirmait plus haut que le validateur exige « **au moins une piste valide** ».
**C'était faux**, et le constater a révélé un défaut réel : `parseTranscodeResult` vérifiait
les pistes par `renditions.every(...)`, or `every` rend **`true` sur un tableau vide**. Un
résultat par ailleurs conforme mais sans aucune piste faisait donc passer le média en
`READY` — le portfolio aurait affiché « PRÊT » sur une vidéo injouable, et le manifeste
maître de SH-17 aurait été vide.

Le garde-fou `renditions.length === 0` a été ajouté, avec son test. L'affirmation du
contrat est donc devenue vraie *après* ce ticket, pas avant.

## Recette de bout en bout — 2026-11-11

Jouée par l'API à travers la gateway (8088), sur un compte freelance créé pour l'occasion,
avec `media-service` reconstruit depuis cette branche. Vidéos de test générées par ffmpeg.

| Scénario | Résultat |
|---|---|
| Dépôt d'un 720p de 6 s | `UPLOADED` → **`READY` en 4 s** ; pistes 360p + 720p, **pas de 1080p inventé** |
| Dépôt d'un 720p de 22 s | `READY` en 20 s ; **6 segments de 4 s, identiques sur les deux pistes** |
| Fichier texte annoncé `video/mp4` | 3 tentatives → **`FAILED` en 16 s**, raison courte, temporaire vide |
| Objets déposés | `master`, `poster.jpg`, `hls/<piste>.m3u8`, `hls/<piste>/seg-*.ts` — conforme à §5.4 |
| En-têtes | types MIME exacts, **AES-256 au repos** sur chaque sortie |
| API | aucune clé de stockage exposée (`sourceKey`, `posterKey`, `hlsPrefix`, `playlistKey`) |
| Portfolio | cartes « PRÊT » avec leur durée, cartes « ÉCHEC » avec leur raison |

### Cinq défauts que seule la recette pouvait révéler

Tous dans du code que les tests unitaires disaient vert.

1. **Le worker n'aurait pas démarré dans la stack.** `AWS_S3_BUCKET` est obligatoire depuis
   ce ticket, mais les fichiers compose ne le fournissaient pas : l'étape de câblage avait
   été sautée tant que Docker était arrêté. Corrigé dans les deux fichiers. En staging, les
   deux identifiants S3 sont passés par substitution et **non** par `env_file`, qui aurait
   livré au worker les mots de passe de base et les clés JWT.
2. **`-hls_time 4` était lettre morte.** Sans images-clés forcées, ffmpeg ne coupe qu'aux
   images-clés de l'encodeur — une toutes les 250 images, soit des segments de **10 s**.
   Pire sur du contenu réel : les images-clés de changement de plan ne tombent pas aux
   mêmes instants selon la définition, ce qui désaligne les pistes et casse la bascule de
   qualité. Invisible sur une fixture de 2 s. Corrigé par `-force_key_frames`.
3. **La raison d'échec exposait l'intérieur du conteneur.** L'erreur brute de `ffprobe`
   devenait l'`errorReason` affiché dans le portfolio : ligne de commande complète, chemin
   `/tmp/media/…`, adresse mémoire. Corrigé par `TranscodeError`, qui sépare un message
   utilisateur d'un détail réservé aux journaux, avec un point de passage unique dans le
   worker — vérifié par sabotage.
4. **Même défaut côté monolithe pour les jobs interrompus** : BullMQ écrit alors lui-même
   la raison (« job stalled more than allowable limit »), affichée telle quelle. Traduite
   dans l'écouteur.
5. **Trois tests d'intégration étaient cassés sans que rien ne le signale.** Les suites
   Redis étaient sautées depuis le début du ticket. Elles attendaient encore l'enveloppe
   vide de l'ancien no-op, et l'une portait un commentaire affirmant que « le bucket n'est
   jamais atteint » — écrit sans pouvoir l'exécuter, et faux. Le stockage est désormais
   injectable, et le test fait passer un **vrai** transcodage par la **vraie** file.

Un sixième constat concerne mes propres tests : « ne fait pas échouer le transcodage quand
la progression ne s'écrit pas » faisait échouer le téléchargement **avant** tout appel de
progression. Il ne prouvait rien. Réécrit.

### Constats laissés ouverts

- **`PROCESSING` n'est jamais observé** : le média passe d'`UPLOADED` à `READY` sans
  transition intermédiaire, personne n'écrivant ce statut au démarrage du job. L'état est
  géré par l'interface mais reste mort, comme SH-18a le notait déjà.
- **Hypothèse NON vérifiée — perte d'évènement si le monolithe est arrêté pendant un
  transcodage.** Une nouvelle instance `QueueEvents` lit le flux à partir de sa fin : un
  job qui se termine pendant un redémarrage de `backend-core` pourrait laisser son média
  bloqué en `UPLOADED`. Je l'ai d'abord cru observé, à tort — ma lecture de la base avait
  précédé l'évènement de quelques secondes, et le monolithe l'a bien traité. Le scénario
  reste à tester délibérément (redémarrage du backend pendant un job) avant de conclure.
- **L'inscription d'un email déjà pris rend 401** et non 409. Hors périmètre, relevé au
  passage.
- **L'image du worker tourne en Node 20**, et le SDK AWS avertit au démarrage qu'il exigera
  Node 22. L'avertissement sort en texte brut, que la collecte de journaux ignore.

## Definition of Done (DoD)

- [x] Résultat conforme au validateur du monolithe — **test croisé** : `contract.spec.ts`
      confronte la sortie RÉELLE de `runPipeline` à chaque règle. Limite assumée : les
      règles existent en deux copies, faute de paquet partagé dans le monorepo ; les deux
      fichiers portent un renvoi mutuel.
- [x] Test de confinement de préfixe — **vérifié par sabotage** : pointer la clé ailleurs
      fait tomber le test.
- [x] Test d'échelle ABR sans sur-échantillonnage — **vérifié par sabotage** (2 échecs).
- [x] Test de nettoyage du temporaire en cas d'échec — **vérifié par sabotage** (2 échecs).
- [x] **Recette de bout en bout faite le 2026-11-11** sur la stack conteneurisée — voir la
      section « Recette » ci-dessous. `READY` observé en conditions réelles, pour la
      première fois du projet.
- [x] ffmpeg installé en CI, fixture générée au setup.
- [x] Lint et build verts sur `backend-core` et `media-service`.
- [ ] ⛔ **CI non vérifiée** : depuis le 9 novembre, les workflows Node échouent en 2 s
      avec **zéro étape exécutée et aucun log**, sur toutes les branches y compris
      Dependabot. Cause hors du code (aucun fichier de workflow n'est en cause) ; à
      investiguer côté compte GitHub.
- [x] Backlog et `CHANGELOG.md` mis à jour.
