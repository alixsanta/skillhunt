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

### Findings des relectures ciblées (2026-07-15)

Relectures sécurité / accessibilité / correction de la PR #22. **Déjà corrigés et mergés** (donc
hors périmètre de ce ticket, listés pour mémoire) : repère non-coloré des chips actives (1.4.1),
explication visible du CTA désactivé, exhaustivité `GEAR_CATEGORIES`/`GEAR_STATUSES`, **contraste des
bordures HUD `#1e2732` → `#5c6e88` (1.4.11)**. Restent, déférés ici :

7. **`GearProgress` ne borne pas ses entrées.** Sûr aujourd'hui (`Armurerie` passe toujours
   `validatedCount ≤ items.length`), mais réutilisé avec `validated > total`, `aria-valuenow`
   dépasserait 100 (ARIA invalide) et la barre déborderait. → `Math.min(100, Math.max(0, …))`.
8. **Un 401 tombe dans la branche d'erreur générique avec « Réessayer ».** Sur session expirée, les
   intercepteurs ont déjà tenté le refresh ; réessayer est futile. Inoffensif (le 4xx n'est pas
   réessayé), mais le bouton invite à une action sans effet. → distinguer 401 (ou masquer Réessayer).

**Candidats plutôt pour SH-27 (audit a11y en CI)** — relevés ici pour ne pas les perdre :
- **4.1.3** : le filtrage par catégorie n'est pas annoncé aux lecteurs d'écran (pas de région
  `aria-live`, et le compteur d'en-tête reste le total non filtré). → région polie « N équipements affichés ».
- **aria-valuetext** sur `GearProgress` pour une annonce plus riche (`{validated} sur {total}…`).
- **Contraste `text-hud-muted` (#7b8794) sur carte (#111820) ≈ 4,9:1** : passe 4.5:1 de justesse — à
  mesurer précisément (axe/Lighthouse) plutôt qu'à l'estimation manuelle.
- **`prefers-reduced-motion`** : les `transition-*` (chips, boutons) mériteraient un override global.

### Definition of Done
- [ ] Items 1, 2, 4, 5, 6 traités (rapides) ; item 3 traité ou requalifié dans un ticket d'intégration.
- [ ] Items 7, 8 traités (bornage `GearProgress`, gestion du 401).
- [ ] Items « candidats SH-27 » traités ici OU explicitement portés dans SH-27.
- [ ] Tests Vitest/Jest passants ; CI verte (lint + `format:check` + tests + build).
