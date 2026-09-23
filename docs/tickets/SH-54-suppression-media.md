**Titre du Ticket :** [SH-54] Suppression d'un média — sortir le quota de l'impasse
**Type :** Correctif fonctionnel
**Priorité :** High (impasse produit : le quota atteint est aujourd'hui définitif)
**Estimation :** 2 Story Points
**Compétences RNCP visées :** C2.2.3 (RBAC, validation), C2.2.2 (tests), C2.4.1 (Swagger)
**Lot :** Lot 1 — EP04

> Défaut relevé par la revue de branche de **SH-18a** (2026-09-23). La cause est dans
> SH-16a, pas dans le front : c'est la revue du front qui l'a rendue visible, parce que
> c'est lui qui place le message sous les yeux de l'utilisateur.

### Constat

`MediaService.createDraft` refuse la déclaration au-delà du quota avec :

> `Quota atteint : 20 médias au maximum. Supprimez-en un avant d'en ajouter.`

Or **aucune route de suppression n'existe**. `media.controller.ts` n'expose que `@Post()`,
`@Get('me')`, `@Patch(':id')` et `@Post(':id/complete')`. Le message prescrit donc une action
que ni l'API ni l'interface ne permettent de réaliser.

Le quota compte tout ce qui n'est pas `FAILED` (`media.service.ts`), donc **les `DRAFT`
comptent**. Conséquence aggravante : chaque dépôt qui échoue laisse un `DRAFT` derrière lui.
Sur une connexion instable, 20 tentatives suffisent à bloquer un compte qui n'a jamais publié
une seule vidéo. Le balayage serveur ne purge ces `DRAFT` qu'au-delà de 24 h — et un quota
rempli par de vrais médias `READY`, lui, ne se libère jamais.

### Périmètre

1. **`DELETE /api/v1/media/:id`** — propriétaire uniquement, étanchéité par l'id du token.
   Un média d'autrui rend **404** et non 403, comme `updateOwn` (ne pas révéler l'existence).
2. **Purge du stockage** : `sourceKey`, poster et préfixe HLS (`storage.deletePrefix`, déjà au
   port depuis SH-16a). Supprimer la ligne sans les objets laisserait du S3 orphelin facturé.
3. **Cas du média en cours de transcodage** : décider entre refus en 409 et suppression avec
   annulation du job BullMQ. Un `PROCESSING` supprimé dont le worker écrit ensuite son résultat
   ressusciterait une ligne fantôme — à traiter explicitement, pas à découvrir en recette.
4. **Front** : action de suppression sur `MediaCard`, avec confirmation, puis invalidation de
   `myMediaQueryKey`. *Recoupe SH-18b, qui liste déjà « suppression d'un média ».* Répartition :
   **la route et la purge de stockage appartiennent à SH-54**, parce que l'impasse de quota
   existe dès aujourd'hui et ne dépend pas de SH-17 ; SH-18b n'en garde que l'habillage, à
   livrer avec le reste du lecteur. Si SH-54 passe en premier, retirer l'item de SH-18b.
5. **Message du 409** : ne le remettre en phase avec la réalité qu'une fois la route livrée.

### Critères d'acceptation (Gherkin)

```gherkin
Scénario : le propriétaire libère son quota
  Étant donné un freelance au quota plein
  Quand il supprime un de ses médias
  Alors la déclaration suivante aboutit
  Et les objets de stockage du média supprimé n'existent plus

Scénario : étanchéité entre freelances
  Étant donné un média appartenant à un AUTRE freelance
  Quand un freelance tente de le supprimer
  Alors la réponse est 404
  Et le média de l'autre freelance existe toujours
```

### Definition of Done (DoD)

- [ ] Route `DELETE` documentée Swagger (`@ApiResponse` 204/404/409).
- [ ] Test d'étanchéité RBAC (404 sur le média d'autrui) — **le test échoue si le filtre saute**.
- [ ] Test de purge du stockage (objets réellement supprimés, pas seulement la ligne).
- [ ] Sort du `PROCESSING` tranché et testé.
- [ ] Message de quota cohérent avec ce que le produit permet réellement.
- [ ] Lint, `format:check`, tests et CI verts.
