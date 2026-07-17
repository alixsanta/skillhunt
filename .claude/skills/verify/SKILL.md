---
name: verify
description: Recette de vérification e2e de SkillHunt sur la stack conteneurisée (gateway 8088)
---

# Vérifier SkillHunt de bout en bout

## Lancer la stack complète

```bash
docker compose --profile app up -d --build   # 8 conteneurs, ~2-4 min
docker compose --profile app ps              # tout doit être "healthy"
```

Point d'entrée UNIQUE : la gateway sur `http://localhost:8088` (SPA + `/api/...` + `/socket.io/`).
Le backend/matching/frontend n'ont AUCUN port hôte. Swagger : `http://localhost:8088/api/docs`.

## Pièges connus

- **Docker Desktop éteint** : `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` puis attendre `docker info` (~10 s).
- **`restart: unless-stopped` ressuscite les VIEUX conteneurs** au démarrage du démon : des conteneurs
  "healthy" ne prouvent PAS que le build récent est déployé. Toujours attendre la fin du
  `up -d --build` avant de tester, et en cas de doute vérifier un artefact dans l'image
  (ex. `docker exec skillhunt-gateway grep socket.io /etc/nginx/conf.d/default.conf`).
- Ports hôtes infra (conflits avec services perso) : Postgres **5433**, Redis **6380**, Mongo **27018**.

## Piloter les surfaces

- **REST + WebSocket** : script Node à 2 clients socket.io — modèle dans l'historique SH-24
  (`sh24-e2e.js` : register/login via `/api/v1/auth`, `io('http://localhost:8088', { auth: { token } })`,
  sondes 400/401/403/404). socket.io-client s'emprunte à `frontend-web/node_modules`.
- **UI** : navigateur sur `http://localhost:8088/login` ; les comptes créés par le script e2e
  fonctionnent dans l'UI (mot de passe `MotDePasse2026!`).
- Un register FREELANCE exige `location: { latitude, longitude }` (SH-34) ; RECRUITER non.
