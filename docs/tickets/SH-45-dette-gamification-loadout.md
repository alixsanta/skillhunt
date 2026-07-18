**Titre du Ticket :** [SH-45] Dette gamification/loadout — durcissements et polissage post-revue SH-21c
**Type :** Dette technique
**Priorité :** Low (aucun item bloquant — fenêtres de risque bornées)
**Estimation :** 2 Story Points
**Compétences RNCP visées :** C2.2.2 (tests), C2.4.1 (Swagger), C2.1.2 (qualité)
**Lot :** Lot 1 (post-rendu acceptable)

> Regroupe les findings **différables** de la revue finale de branche SH-21c (2026-07-17).
> Aucun n'affecte la sécurité, le contrat d'API ni la migration ; tous ont été jugés
> « DIFFÉRABLE » explicitement par la revue (traçabilité : `.superpowers/sdd/progress.md`).

### Items

1. **TOCTOU loadout** : le comptage max-4 de `GearService.setLoadout` n'est pas transactionnel —
   deux PATCH concurrents près du plafond peuvent aboutir à 5 épinglés (conséquence bénigne :
   affichage « 5/4 », badge inchangé car seuil `>=`). Fix : `SELECT … FOR UPDATE` ou contrainte
   partielle. Documenter la limitation en attendant.
2. **Sweep Swagger 400** (C2.4.1) : `@ApiBadRequestResponse` absent sur `PATCH /gear/:id/loadout`
   ET sur les routes existantes (convention repo) ; `@ApiParam` sur `/gamification/freelance/:id`.
   À traiter en un passage global, pas endpoint par endpoint.
3. **Test frontière de seuil** : ajouter un `it.each` à `xp === 250` exact (et 249) dans
   `gamification.service.spec.ts`.
4. **Nettoyage types** : `Badge`/`PublicBadge` exportés non consommés (`BadgeGrid` garde son
   `BadgeItem` local) ; `useSetLoadout` typé `unknown` → `Gear` ; idiome `void xp` dans
   `publicProfileFor`.
5. **`PublicLevelBadge`** : formaliser l'affichage du niveau en vue publique (aujourd'hui `<p>`
   brut, asymétrique avec `LevelCard` privé — asymétrie voulue par la minimisation, le composant
   ne ferait que la rendre propre).
6. **Position de l'erreur loadout** : l'alert s'affiche sous la zone gamification, pas « près de
   la carte » (spec §5) — `role="alert"` compense côté AT ; à rapprocher de la carte si retouche UX.

### Décision produit ACTÉE (ne pas « corriger » sans discussion)
- **Les fiches épinglées apparaissent dans le loadout ET dans la grille principale** (les deux
  vues) : choix assumé en revue finale (loadout = vitrine, grille = inventaire complet ; pas de
  double action possible). Écart tracé vs plan Task 6 (« la grille liste le reste »).

### Definition of Done (DoD)
- [ ] Items 1–6 traités ou explicitement re-différés avec justification.
- [ ] Tests verts, CI verte.
