**Titre du Ticket :** [SH-18b] Lecteur du portfolio — HLS, visionneuse 360° et section recruteur
**Type :** Fonctionnalité
**Priorité :** Medium
**Estimation :** 3 Story Points
**Compétences RNCP visées :** C2.4.1 (documentation), C2.2.2 (tests)
**Lot :** Lot 1 — EP04
**Dépend de :** SH-17 (routes de lecture : manifeste signé, poster) et SH-16b (métadonnées réelles)

> Seconde moitié de SH-18. SH-18a a livré ce qui ne dépend d'aucune route de lecture :
> la grille des cinq états, le dépôt direct en trois temps, la carte du compte et
> l'emplacement recruteur. **Tout ce qui suppose de LIRE un média est ici**, parce que
> les routes correspondantes n'existent pas avant SH-17.

### Périmètre

1. **Lecteur HLS** — consommation du manifeste réécrit en segments signés (SH-17). Gérer
   l'expiration d'une URL signée pendant la lecture : une vidéo longue survit à la fenêtre
   de 15 min, donc le lecteur doit savoir re-signer sans interrompre la lecture.
2. **Visionneuse 360° WebGL** — activée sur `type === 'VIDEO_360'`, drapeau déjà porté par
   l'entité depuis SH-16a et déjà affiché en pastille par `MediaCard`.
3. **Poster réel** — remplace la vignette dérivée de l'état. Voir `MediaCard.tsx` : le
   commentaire y documente l'intérim.
4. **Section recruteur** — brancher `FreelanceGear.tsx` sur `GET /media/freelance/:id`
   (SH-17). L'emplacement et son état vide sont déjà en place, aucune requête n'est émise
   d'ici là.
5. **Suppression d'un média** — *habillage uniquement*. La route `DELETE` et la purge du
   stockage relèvent de **SH-54**, qui traite l'impasse de quota et ne dépend pas de SH-17.
   Si SH-54 est livré avant, ne garder ici que le bouton et la confirmation.

### Dette héritée de SH-18a à traiter ici

- **`formatDuration` ne reporte pas les heures** (`media-meta.ts`) : au-delà de 3600 s, les
  minutes ne sont pas converties — 1 h 35 s'affiche « 95:12 », forme ambiguë. Le
  comportement est aujourd'hui **épinglé par un test** (`media-meta.test.ts`, cas `3661`
  → `'61:01'`) sans justification écrite : il a été figé tel qu'écrit, pas décidé. Latent
  tant que SH-16b n'a pas sondé les médias, puisque `durationSeconds` vaut toujours `null`.
  **Trancher explicitement ici** — soit `h:mm:ss` au-delà de l'heure, soit le comportement
  actuel assumé et commenté comme tel.
- **`PROCESSING` reste un état mort** tant que SH-16b n'écrit pas la transition ; la grille
  le gère déjà, mais aucun média ne l'atteint. Vérifier le rendu une fois le pipeline livré.

### Definition of Done (DoD)

- [ ] Lecture d'un média `READY` de bout en bout, y compris après expiration d'une URL signée.
- [ ] Bascule 360° pilotée par le type, testée dans les deux cas.
- [ ] Section recruteur branchée, avec son état vide conservé quand le freelance n'a rien publié.
- [ ] Sort de `formatDuration` tranché et commenté.
- [ ] Lint, `format:check`, tests et CI verts.
