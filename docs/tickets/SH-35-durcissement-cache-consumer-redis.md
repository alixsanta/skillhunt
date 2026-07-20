**Titre du Ticket :** [SH-35] Durcissement cache /match & consumer Redis — course d'invalidation, PEL, scaling
**Type :** Bug (dette technique / robustesse)
**Priorité :** Medium
**Estimation :** 3 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.2 (tests de robustesse), C2.2.3 (fiabilité de l'invalidation)
**Lot :** Lot 1 (Web MVP)

> Identifié en **code review de SH-14** (4 findings côté matching-service). Aucun n'était
> bloquant pour le merge : les fenêtres d'incohérence sont **bornées par `match_cache_ttl`
> (60 s)**. Ce ticket regroupe le durcissement pour supprimer ces fenêtres et préparer le
> scaling horizontal du service.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** garantie « jamais de résultats périmés » (Scénario 2 du ticket SH-14) sans dépendre du TTL + consumer scalable.
- [x] **Specs Complètes :** findings F1/F3/F4/F5 ci-dessous, critères Gherkin.
- [x] **UX/UI Validé :** n/a (dette technique back).
- [x] **Faisabilité Technique :** snapshot de version, `XAUTOCLAIM`, env var, `pipeline()` — pas de changement d'archi (§3).
- [x] **Estimé :** 3 SP.

### 1. User Story
**En tant que** recruteur,
**Je veux** que le cache `/match` ne serve **jamais** de résultats calculés avant le dernier événement métier, même en cas de course ou de redémarrage du consumer,
**Afin de** contacter des freelances sur la base de données réellement à jour (KPI R4 sans compromis de fraîcheur).

### 2. Findings à corriger (revue SH-14)

**F1 — Course d'invalidation (le principal).** `app/services/match_cache.py` :
`get_cached` lit la version (v5, miss) → le scoring tourne → un `gear.validated` fait `INCR`
(v5→v6) → `set_cached` **relit** la version (v6) et écrit des résultats **périmés** sous
`match:v6:…`, servis jusqu'à expiration du TTL.
*Correctif :* capturer la version **une fois en début de requête** (dans le router) et la
passer à `set_cached` — un résultat calculé sous v5 s'écrit sous v5, donc invisible après bump.

**F4 — PEL non réclamé au redémarrage.** `app/services/event_consumer.py` : la boucle ne lit
que `>` (nouveaux messages). Un crash entre lecture et `process_event` perd l'invalidation.
*Correctif :* au démarrage de `consume_loop`, réclamer les messages en attente
(`XAUTOCLAIM` ou lecture `0`) avant de passer aux nouveaux.

**F3 — Nom de consumer en dur.** `CONSUMER = "matching-1"` : deux réplicas partagent la même
identité dans le groupe (PEL confondus). Inoffensif tant que le traitement est idempotent,
mais contredit l'objectif « microservices scalables indépendamment » (CLAUDE.md §2).
*Correctif :* dériver le nom d'une variable d'env (`HOSTNAME` / nom de pod, fallback local).

**F5 — Double aller-retour Redis sur le hot path.** `get_cached` fait `GET match:version`
puis `GET match:v{N}:…` en série à chaque requête (KPI < 250 ms).
*Correctif :* `pipeline()` n'est pas possible (la 2ᵉ clé dépend de la 1ʳᵉ) → soit script Lua,
soit mémoïsation courte de la version en process ; **F1 supprime déjà le 2ᵉ `GET` de
`set_cached`** (version passée en paramètre). Se contenter de ça est acceptable si le
gain Lua ne vaut pas sa complexité — à trancher à l'implémentation.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Un événement pendant le scoring n'est jamais écrasé**
* **GIVEN** une requête `/match` en cours de scoring sous la version N
* **WHEN** un événement `gear.validated` bump la version à N+1 avant la fin du scoring
* **THEN** le résultat est écrit sous la clé de version N (jamais N+1) et la requête suivante recalcule.

**Scénario 2 : Reprise du PEL au redémarrage**
* **GIVEN** un message lu mais non ACKé (crash simulé du consumer)
* **WHEN** le consumer redémarre
* **THEN** le message est retraité (version bumpée) avant la consommation des nouveaux messages.

**Scénario 3 : Deux réplicas, deux identités**
* **GIVEN** deux instances démarrées avec des env distincts
* **WHEN** elles rejoignent le groupe `matching`
* **THEN** `XINFO CONSUMERS` montre deux consumers distincts.

### 4. Definition of Done (DoD)
- [ ] F1 corrigé : version capturée en début de requête, test de course à l'appui (C2.2.2).
- [ ] F4 corrigé : reprise du PEL testée (intégration Redis réelle).
- [ ] F3 corrigé : nom de consumer configurable par env, défaut documenté.
- [ ] F5 : décision tracée (Lua / mémoïsation / statu quo justifié) dans le ticket.
- [ ] Suite complète verte (pytest + flake8 + bandit) ; pas de régression sur les tests SH-14.
- [ ] Backlog mis à jour.
