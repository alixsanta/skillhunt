**Titre du Ticket :** [SH-44] Armurerie — durcissement des tests et polissage (dette de revue SH-21a)
**Type :** Dette technique
**Priorité :** Low
**Estimation :** 2 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.2 (renforcement des tests), C2.1.2 (qualité de code), C2.4.1 (contrat OpenAPI)
**Lot :** Lot 1 (Web MVP)

> **Dette relevée en revue finale de SH-21a** (branche `feature/SH-21a-armurerie-grille-inventaire`).
> La revue whole-branch (opus) a conclu « Ready to merge : OUI », **zéro Critical / zéro Important** ;
> les points ci-dessous sont tous des Minors *déférés* — aucun n'est une faille ni un bug vivant.
> Regroupés ici pour la traçabilité, à traiter quand on retouche ces fichiers.

### Items

1. **Élargir le garde anti-hex à `src/pages/`.**
   `frontend-web/src/features/gear/gear-meta.test.ts` ne scanne que `src/features/gear/*`. `Armurerie.tsx`
   (aujourd'hui propre, tokens `bg-hud-*`) pourrait régresser une couleur hexadécimale en dur sans que le
   garde ne rougisse. → étendre le glob du test à `src/pages/`.

2. **Contrat OpenAPI : assertion à clés exactes.**
   `backend-core/src/gear/gear.controller.spec.ts` utilise `arrayContaining`, qui ne détecterait pas un
   champ **en trop** dans `GearResponseDto`. → passer à une assertion sur le jeu de clés exact.

3. **Contrat documenté vs. réponse HTTP réelle.**
   Aucun test ne compare le contrat Swagger documenté à une vraie réponse `GET /gear/me`. Un futur
   `relations: ['freelance']` sur l'entité ferait diverger doc et réalité en silence. → test d'intégration léger.

4. **`GearCard` : durcir la non-exposition de `serialNumber`.**
   Le test « pas de serialNumber » (`GearCard.test.tsx`) ne vérifie que les nœuds **texte** ; une fuite via
   `title`/`aria-label`/attribut passerait. `GearCard` ne passe aujourd'hui `serialNumber` à aucune prop —
   ajouter une assertion `queryByTitle`/attribut en durcissement.

5. **Message 403 (RBAC) : couleur sémantique.**
   `Armurerie.tsx` stylise le message « réservée aux freelances » en `text-hud-pending` (token « attente »
   ambre). Nit sémantique — une couleur neutre/muette conviendrait mieux qu'un ambre « en attente ».
   (L'accessibilité tient déjà via le libellé texte.)

6. **Divergence dénominateur de progression / compteur d'en-tête (> 100 équipements).**
   `Armurerie.tsx` : la barre se calcule sur `items.length` (≤ 100 chargés) tandis que l'en-tête affiche
   `data.total`. Divergence **intentionnelle** (cohérente avec « Affichage des N les plus récents »).
   → un commentaire d'une ligne suffit pour prévenir une mauvaise lecture future. La vraie pagination
   au-delà de 100 est une itération ultérieure.

### Definition of Done
- [ ] Items 1, 2, 4, 5, 6 traités (rapides) ; item 3 traité ou requalifié dans un ticket d'intégration.
- [ ] Tests Vitest/Jest passants ; CI verte (lint + `format:check` + tests + build).
