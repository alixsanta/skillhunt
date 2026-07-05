**Titre du Ticket :** [SH-36] TokenStore Redis — cohérence du fail-safe et atomicité de l'écriture
**Type :** Bug (dette technique / sécurité)
**Priorité :** Medium
**Estimation :** 2 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (résilience auth), C2.2.2 (tests de panne)
**Lot :** Lot 1 (Web MVP)

> Identifié en **code review de SH-14** (2 findings côté backend-core). Le fail-safe de
> `isValid` (Redis down ⇒ token invalide, jamais fail-open) est correct ; ce ticket
> complète le comportement des **autres** méthodes du TokenStore, laissées à moitié traitées.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** un hoquet Redis ne doit plus produire de 500 opaque sur login/register/refresh ; l'index de révocation globale doit rester fiable.
- [x] **Specs Complètes :** findings F2/F6 ci-dessous, critères Gherkin.
- [x] **UX/UI Validé :** n/a (dette technique back).
- [x] **Faisabilité Technique :** try/catch ciblés + `multi()` ioredis — pas de changement d'archi (§3).
- [x] **Estimé :** 2 SP.

### 1. User Story
**En tant qu'** utilisateur (freelance ou recruteur),
**Je veux** qu'une indisponibilité passagère de Redis produise un comportement d'auth **défini et testé** (refus propre, jamais d'erreur serveur opaque),
**Afin de** garder confiance dans la plateforme même en mode dégradé (Defense in Depth, §8-5).

### 2. Findings à corriger (revue SH-14)

**F2 — `save`/`revoke` ne sont pas fail-safe.** `auth/token-store.service.ts` +
`auth/auth.service.ts` : `isValid` avale les erreurs Redis (refus par défaut), mais `save`
(appelé par `issueTokens` → login/register/refresh) et `revoke` (rotation) laissent
l'exception remonter → **500 Internal Server Error** avec identifiants pourtant valides.
*Décision à trancher puis implémenter :*
1. **Assumer le fail-closed** (recommandé : sans `save`, le refresh token émis serait
   invérifiable) mais le faire **proprement** : intercepter l'erreur Redis et renvoyer une
   `ServiceUnavailableException` (503) explicite plutôt qu'un 500 opaque ;
2. ou dégrader en best-effort (l'access token courte durée fonctionne, le refresh échouera
   au premier usage via le fail-safe d'`isValid`) — à documenter si retenu.

**F6 — Écriture non atomique et 3 RTT.** `TokenStore.save` enchaîne `SET` → `SADD` →
`EXPIRE` séquentiellement. Si `SADD` échoue après `SET`, le jti est **valide mais absent
de l'index** `user:{id}:jtis` → invisible pour `revokeAllForUser` (scénario PCA /
compromission du dossier §4.4).
*Correctif :* regrouper les trois commandes dans un `multi()` ioredis (atomique, 1 seul
aller-retour).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Login pendant une panne Redis**
* **GIVEN** Redis indisponible côté backend-core
* **WHEN** un utilisateur soumet des identifiants valides sur `/login`
* **THEN** la réponse est le comportement décidé en §2-F2 (503 explicite ou dégradation documentée) — jamais un 500 opaque.

**Scénario 2 : Écriture atomique du refresh token**
* **GIVEN** un `save(jti, userId, ttl)`
* **WHEN** l'écriture s'exécute
* **THEN** `refresh:{jti}` et l'entrée du set `user:{userId}:jtis` sont créés dans la même transaction (`MULTI`/`EXEC`) — jamais l'un sans l'autre.

**Scénario 3 : Révocation globale fiable**
* **GIVEN** trois refresh tokens émis pour un utilisateur
* **WHEN** `revokeAllForUser` est appelé
* **THEN** les trois tokens sont invalidés (aucun jti orphelin hors index).

### 4. Definition of Done (DoD)
- [ ] Décision F2 tracée dans ce ticket (option retenue + justification) et implémentée avec test de panne Redis (C2.2.2).
- [ ] `save` atomique via `multi()`, tests unitaires adaptés (commandes groupées).
- [ ] Suite backend-core verte (lint + Jest + build) ; tests d'intégration Redis réels re-passés.
- [ ] Backlog mis à jour.
