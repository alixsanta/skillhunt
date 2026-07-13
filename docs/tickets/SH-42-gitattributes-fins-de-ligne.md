**Titre du Ticket :** [SH-42] Normaliser les fins de ligne (`.gitattributes`) — `format:check` ment en local
**Type :** Feature (dette technique / outillage)
**Priorité :** Medium
**Estimation :** 1 Story Point (Fibonacci)
**Compétences RNCP visées :** C2.1.2 (qualité / normes de code)
**Lot :** Lot 1 (Web MVP)

> **Origine.** Constat répété pendant SH-20 : sous Windows, `npm run format:check` signale **~13 fichiers non
> conformes** alors que **la CI est verte**. Aucun de ces fichiers n'a de vrai défaut de formatage.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** la commande de vérification du formatage **ment** en local — elle a déjà fait perdre du temps et a failli faire « corriger » des fichiers sains.
- [x] **Specs Complètes :** cause identifiée, correctif connu et standard.
- [x] **UX/UI Validé :** n/a.
- [x] **Faisabilité Technique :** un fichier `.gitattributes` à la racine + une renormalisation unique.
- [x] **Estimé :** 1 SP.

### 1. Le problème

Le dépôt n'a **pas de `.gitattributes`**. Sur Windows, Git applique `core.autocrlf=true` : les fichiers sont
donc **extraits en CRLF** dans le répertoire de travail. Or **Prettier attend des LF** (`endOfLine: "lf"`,
sa valeur par défaut).

Conséquence : `npm run format:check` échoue en local sur des fichiers **parfaitement corrects**, tandis que la
CI (Linux, extraction en LF) les valide. Deux effets pervers, tous deux constatés en SH-20 :

1. **On apprend à ignorer l'échec.** Un vrai défaut de formatage se noie alors dans le bruit — c'est
   exactement ce qui s'est produit : un écart réel dans `frontend-web/CLAUDE.md` (`*single-flight*` au lieu de
   `_single-flight_`) est passé inaperçu en local et **a fait rougir la CI** de la PR #19.
2. **`npm run format` réécrit des fichiers non touchés**, produisant des diffs fantômes qu'il faut restaurer à
   la main avant chaque commit (`git checkout -- …`) — friction permanente, et risque de commiter du bruit.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Coût quasi nul, friction quotidienne supprimée. Tant que ce n'est pas fait, chaque
  développement front paie la taxe.
- **KPI impacté :** fiabilité des vérifications locales (une commande de qualité qui ment ne sert à rien).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : La vérification locale dit la vérité**
* **GIVEN** un poste Windows, dépôt fraîchement cloné
* **WHEN** je lance `npm run format:check` dans `frontend-web/`
* **THEN** la commande **passe** — comme en CI
* **AND** elle n'échoue **que** sur de vrais défauts de formatage.

**Scénario 2 : `npm run format` ne touche que ce qu'il doit**
* **WHEN** je lance `npm run format` après avoir modifié **un** fichier
* **THEN** `git status` ne montre **que ce fichier** (plus de diffs fantômes de fins de ligne).

**Scénario 3 : Cohérence entre plateformes**
* **GIVEN** un fichier créé sous Windows et un fichier créé sous Linux
* **THEN** les deux sont stockés en **LF** dans l'index Git.

### 4. Spécifications Techniques

Créer `.gitattributes` **à la racine** du monorepo :

```gitattributes
# Normalisation des fins de ligne : LF dans l'index, quelle que soit la plateforme.
# Sans ça, Prettier (endOfLine: lf) fait échouer format:check en local sous Windows
# alors que la CI (Linux) est verte — la commande ment (SH-42).
* text=auto eol=lf

# Fichiers binaires : jamais de conversion.
*.png binary
*.jpg binary
*.pdf binary
*.ico binary
```

Puis **renormaliser l'existant en une passe** :

```bash
git add --renormalize .
git commit -m "chore: renormalisation des fins de ligne (LF)"
```

⚠️ **Ce commit touchera beaucoup de fichiers** (fins de ligne uniquement, aucun changement de contenu). À faire
**quand aucune branche de feature n'est en cours**, pour éviter des conflits pénibles — sinon les rebases des
branches ouvertes deviendront douloureux.

### 5. Definition of Done (DoD)
- [ ] `.gitattributes` créé à la racine.
- [ ] Renormalisation effectuée (`git add --renormalize .`), dans un **commit dédié** et isolé.
- [ ] `npm run format:check` **passe en local sous Windows** sur un dépôt propre.
- [ ] `npm run format` sur un fichier modifié ne produit **aucun** diff fantôme.
- [ ] CI verte (backend + frontend).
- [ ] `frontend-web/CLAUDE.md` : retirer la mise en garde sur le faux positif CRLF, devenue obsolète.
- [ ] `docs/BACKLOG.md` mis à jour.
