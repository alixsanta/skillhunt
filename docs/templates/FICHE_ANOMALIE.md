<!--
Gabarit de CONSIGNATION D'ANOMALIE — SkillHunt (SH-29).

Copier ce fichier pour chaque anomalie détectée en production :
    docs/anomalies/AN-XX-<slug>.md

Compétence RNCP visée : C4.2.1 — « Consigner les anomalies détectées en élaborant un
processus de collecte et consignation, en utilisant des outils de collecte et en y intégrant
toutes les informations pertinentes, afin de déterminer le correctif à mettre en place. »

Critères d'évaluation auxquels ce gabarit répond :
  - « Le processus de collecte est structuré et adapté à la typologie du logiciel. »
    → §1 : l'anomalie est reliée à la SONDE qui l'a détectée, ou au canal de signalement.
  - « La fiche de consignation contient les informations permettant de reproduire le bogue. »
    → §3 : étapes, environnement, VERSION DÉPLOYÉE et requestId (corrélation inter-services).
  - « L'analyse du bogue et les préconisations de corrections sont explicitées et permettent
    de corriger l'anomalie. » → §5 et §6.

⚠️ Une fiche remplie de mémoire après coup ne vaut rien. Les champs §3 et §4 doivent être
renseignés DEPUIS Grafana et Loki pendant que les traces existent — la rétention est de
7 jours.
-->

# [AN-XX] Titre court et factuel de l'anomalie

| | |
|---|---|
| **Identifiant** | AN-XX |
| **Détectée le** | AAAA-MM-JJ à HH:MM (UTC) |
| **Détectée par** | ☐ Sonde `S_` · ☐ Utilisateur · ☐ Revue · ☐ CI · ☐ Découverte fortuite |
| **Sévérité** | ☐ Critique · ☐ Avertissement · ☐ Sécurité · ☐ Mineure |
| **Environnement** | ☐ Production (VM OVHcloud) · ☐ Staging · ☐ Local |
| **Version déployée** | `vX.Y.Z` — SHA `……` (cf. table de correspondance du `CHANGELOG.md`) |
| **Composant** | `backend-core` / `matching-service` / `frontend-web` / `gateway` / infrastructure |
| **Statut** | ☐ Ouverte · ☐ En cours · ☐ Corrigée · ☐ Écartée (justifier §6) |
| **Ticket de correction** | `fix/SH-XX-…` |

---

## 1. Détection

**Comment l'anomalie a-t-elle été portée à notre connaissance ?**

> Si une sonde a déclenché : **laquelle**, à quelle heure, quelle valeur mesurée face à quel
> seuil. Coller l'extrait du mail d'alerte.
>
> Si l'anomalie a été **découverte autrement** (utilisateur, revue, hasard), le dire
> franchement : c'est une information sur la couverture de la supervision, et le §7 en tirera
> la conséquence. Une anomalie que le système aurait dû voir et n'a pas vue est un défaut de
> supervision autant qu'un défaut applicatif.

## 2. Impact

- **Fonctionnalité touchée** :
- **Utilisateurs concernés** (rôle, proportion) :
- **Contournement disponible** : ☐ oui — lequel ☐ non
- **Durée d'exposition** : de … à … (ou « toujours en cours »)
- **Données affectées** : ☐ aucune ☐ lecture ☐ écriture ☐ perte — *si perte, détailler*

## 3. Reproduction

> **Critère explicite du référentiel** : la fiche doit contenir les informations permettant
> de **reproduire** le bogue. Une fiche non reproductible ne permet pas de valider le
> correctif — on ne saura pas s'il a marché.

**Préconditions** (rôle, données, état) :

**Étapes**
1.
2.
3.

**Résultat attendu** :
**Résultat obtenu** :

**Reproductible** : ☐ systématiquement ☐ par intermittence (fréquence : …) ☐ une seule fois

## 4. Traces

| Élément | Valeur |
|---|---|
| `requestId` | *La clé : reconstitue le trajet à travers les deux services* |
| Requête LogQL | `{plateforme="skillhunt"} \|= "<requestId>"` |
| Extrait de logs | *coller les lignes utiles, expurgées si besoin* |
| Tableau de bord | *lien Grafana + fenêtre temporelle* |
| Métriques au moment des faits | *latence, taux d'erreur, mémoire…* |

> ⚠️ **Rétention : 7 jours** sur Loki et Prometheus. Extraire les traces **maintenant**.

## 5. Analyse

**Cause racine** *(le « pourquoi », pas le « quoi »)*

**Pourquoi n'a-t-elle pas été détectée plus tôt ?**
> Question systématique. Test manquant, sonde absente, seuil mal placé, cas non prévu ? La
> réponse alimente souvent une amélioration plus utile que le correctif lui-même.

**Périmètre de propagation** : autres composants susceptibles d'être touchés par la même cause.

## 6. Préconisation de correction

**Correctif proposé** :

**Risque du correctif** *(grille §5 de la politique de dépendances si des versions bougent)* :

**Alternatives écartées, et pourquoi** :

**Si l'anomalie est écartée sans correction** : justifier — non-exploitabilité démontrée,
coût disproportionné, contournement acceptable — et **fixer une date de réexamen**. Une
anomalie écartée sans échéance est une dette silencieuse.

## 7. Suites

- [ ] Ticket de correction créé : `fix/SH-XX-…`
- [ ] Correctif développé, **test de non-régression** couvrant précisément ce cas
- [ ] CI verte
- [ ] Déployé — version `vX.Y.Z` ([`PROCESS_RELEASE.md`](../exploitation/PROCESS_RELEASE.md))
- [ ] Entrée `Corrigé` au [`CHANGELOG.md`](../../CHANGELOG.md), avec renvoi à cette fiche
- [ ] **Alerte refermée** — vérifié dans Grafana
- [ ] **Supervision ajustée** si l'anomalie n'avait pas été détectée par une sonde : nouvelle
      sonde, seuil revu, ou constat argumenté qu'aucune sonde ne pouvait la voir

---

## Annexe — Anomalies consignées

| ID | Date | Titre | Sonde | Sévérité | Statut | Version corrective |
|---|---|---|---|---|---|---|
| AN-01 | 2026-07-23 | HEALTHCHECK résolu en IPv6 : `frontend-web` et `gateway` marqués `unhealthy` alors qu'ils servent le trafic | *(antérieure à la supervision)* | Mineure | Ouverte | — |

> **AN-01** est documentée dans le `CHANGELOG.md` (limitations connues de la `v1.0.0`) et dans
> [`SH-30`](../tickets/SH-30-mise-en-production.md) §4. Elle a été **délibérément laissée
> ouverte** : elle sert de support à C4.2.1 et C4.2.2, et la supervision mise en place par
> SH-29 doit d'abord la **détecter** — ce qui prouvera que le système fonctionne sur une
> anomalie réelle, documentée avant d'être corrigée.
