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

## Definition of Done (DoD)

- [ ] Résultat conforme au validateur du monolithe — **test croisé** : le résultat réel du
      worker passe `parseTranscodeResult`, plutôt que deux définitions qui dérivent.
- [ ] Test de confinement de préfixe : une clé hors préfixe **fait échouer** le test.
- [ ] Test d'échelle ABR sans sur-échantillonnage.
- [ ] Test de nettoyage du temporaire en cas d'échec.
- [ ] Recette de bout en bout sur la stack : dépôt réel → `READY` visible dans le portfolio.
- [ ] ffmpeg installé en CI, fixture générée au setup, suite verte.
- [ ] Lint, build et CI verts. Backlog et `CHANGELOG.md` mis à jour.
- [ ] `docs/BACKLOG.md` : SH-16a passe à 🟢, SH-16b à 🟢.
