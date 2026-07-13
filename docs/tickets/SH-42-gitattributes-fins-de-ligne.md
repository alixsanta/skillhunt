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

### 1. User Story
**En tant que** développeur travaillant sous Windows,
**Je veux** que `npm run format:check` donne **le même verdict en local et en CI**,
**Afin de** pouvoir lui faire confiance — aujourd'hui il échoue sur des fichiers corrects, donc on apprend à ignorer son échec, et un vrai défaut passe.

### 1 bis. Le problème

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
* **GIVEN** un dépôt propre où **un seul** fichier a été modifié
* **WHEN** je lance `npm run format`
* **THEN** `git status` ne montre **que ce fichier** (plus de diffs fantômes de fins de ligne).

**Scénario 3 : Cohérence entre plateformes**
* **GIVEN** un fichier créé sous Windows et un fichier créé sous Linux
* **WHEN** ils sont ajoutés à l'index
* **THEN** les deux y sont stockés en **LF**.

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

⚠️ **Ce commit touchera beaucoup de fichiers** (fins de ligne uniquement, aucun changement de contenu). Il doit
être passé **quand aucune branche de travail n'est ouverte**, sinon tout rebase en cours devient douloureux.

> ✅ **La fenêtre est ouverte maintenant.** Vérifié au moment de la rédaction :
> `git branch -r --no-merged develop` ne renvoie **aucune** branche de travail en cours (hors celle de ce
> ticket). C'est le bon moment pour le faire — avant de démarrer `SH-21a`.

### 5. Definition of Done (DoD)
- [ ] `.gitattributes` créé à la racine.
- [ ] Renormalisation effectuée (`git add --renormalize .`), dans un **commit dédié** et isolé.
- [ ] `npm run format:check` **passe en local sous Windows** sur un dépôt propre.
- [ ] `npm run format` sur un fichier modifié ne produit **aucun** diff fantôme.
- [ ] CI verte (backend + frontend).
- [ ] `docs/BACKLOG.md` mis à jour.
