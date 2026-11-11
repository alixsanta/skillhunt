#!/usr/bin/env bash
# Valide le matériel en attente d'UN freelance donné — ce que ferait un écran d'administration.
#
# Contexte : le Lot 1 n'a pas d'écran d'administration (choix assumé, cf.
# frontend-web/src/features/navigation/nav-items.ts). La file de validation est une API
# documentée ; ce script l'appelle, pour la démonstration de soutenance (temps 2).
# Guide associé : docs/soutenance/GUIDE_DEMO_JOUR_J.md
#
# Usage   : bash scripts/demo-valider.sh <email-du-freelance> [mot-de-passe]
# Variantes :
#   DRY_RUN=1 bash scripts/demo-valider.sh <email>                   # liste sans rien valider
#   API=http://autre-hote:8088 bash scripts/demo-valider.sh <email>  # autre cible
set -euo pipefail

API="${API:-http://localhost:8088}"
ADMIN_EMAIL="${ADMIN_EMAIL:-demo2026-admin@skillhunt.io}"
PWD_DEMO_DEFAULT="MotDePasse2026!"

FREELANCE_EMAIL="${1:-}"
FREELANCE_PWD="${2:-${PWD_DEMO:-$PWD_DEMO_DEFAULT}}"
ADMIN_PWD="${ADMIN_PWD:-${PWD_DEMO:-$PWD_DEMO_DEFAULT}}"

if [ -z "$FREELANCE_EMAIL" ]; then
  echo "Usage : bash scripts/demo-valider.sh <email-du-freelance> [mot-de-passe]" >&2
  exit 2
fi

# Extraction JSON sans dépendance externe (jq n'est pas garanti sur le poste de démo).
jqv() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d)$1??'')}catch(e){console.log('')}})"; }

login() { # $1=email $2=password -> access token
  curl -s --max-time 15 -X POST "$API/api/v1/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jqv ".accessToken"
}

echo "→ Cible : $API"

ADMIN_TOKEN=$(login "$ADMIN_EMAIL" "$ADMIN_PWD")
[ -n "$ADMIN_TOKEN" ] || { echo "ÉCHEC : connexion administrateur impossible ($ADMIN_EMAIL)" >&2; exit 1; }

# L'id du freelance vient de SON propre jeton : c'est ce qui permet de filtrer la file de
# validation sans accès à la base. Indispensable ici, où la file contient du matériel
# d'AUTRES comptes qu'il ne faut surtout pas valider en aveugle.
FREELANCE_TOKEN=$(login "$FREELANCE_EMAIL" "$FREELANCE_PWD")
[ -n "$FREELANCE_TOKEN" ] || { echo "ÉCHEC : connexion freelance impossible ($FREELANCE_EMAIL)" >&2; exit 1; }

FREELANCE_ID=$(curl -s --max-time 15 "$API/api/v1/gear/me?limit=1" \
  -H "Authorization: Bearer $FREELANCE_TOKEN" | jqv ".items?.[0]?.freelanceId")

if [ -z "$FREELANCE_ID" ]; then
  echo "ÉCHEC : aucun équipement trouvé pour $FREELANCE_EMAIL — rien à valider." >&2
  echo "        (le matériel doit être déclaré AVANT de lancer ce script)" >&2
  exit 1
fi

PENDING=$(curl -s --max-time 15 "$API/api/v1/gear/pending?limit=50" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | node -e "let d='';const f=process.argv[1];process.stdin.on('data',c=>d+=c).on('end',()=>{try{(JSON.parse(d).items||[]).filter(g=>g.freelanceId===f).forEach(g=>console.log(g.id+'|'+g.brand+' '+g.model))}catch(e){}})" "$FREELANCE_ID")

if [ -z "$PENDING" ]; then
  echo "→ Aucun matériel en attente pour $FREELANCE_EMAIL (déjà validé ?)"
  exit 0
fi

while IFS='|' read -r id label; do
  [ -n "$id" ] || continue
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "   [DRY_RUN] $label ($id) resterait en PENDING"
    continue
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -X PATCH "$API/api/v1/gear/$id/review" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"decision":"VALIDATED"}')
  if [ "$code" = "200" ]; then
    echo "   ✅ $label → VALIDATED"
  else
    echo "   ❌ $label → échec HTTP $code" >&2
  fi
done <<< "$PENDING"
