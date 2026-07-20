#!/usr/bin/env bash
# Provisionne le jeu de données de démonstration sur la stack conteneurisée (gateway 8088).
# Idempotent : relançable, les comptes déjà créés sont simplement réutilisés.
#
# Prérequis : docker compose --profile app up -d --build  (tous les conteneurs "healthy")
# Usage     : bash scripts/seed-demo.sh
set -euo pipefail

API="${API:-http://localhost:8088}"
PWD_DEMO="${PWD_DEMO:-MotDePasse2026!}"
PG="skillhunt-postgres"

# Préfixe dédié : la base de démo peut déjà contenir des comptes d'anciennes recettes e2e
# dont le mot de passe est inconnu. Surchargeable : PREFIX=demo2027 bash scripts/seed-demo.sh
PREFIX="${PREFIX:-demo2026}"
FREELANCE_EMAIL="$PREFIX-pilote@skillhunt.io"
RECRUITER_EMAIL="$PREFIX-recruteur@skillhunt.io"
ADMIN_EMAIL="$PREFIX-admin@skillhunt.io"

jqv() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d)$1??'')}catch(e){console.log('')}})"; }

register() { # $1=email $2=username $3=role $4=body-extra
  curl -s -X POST "$API/api/v1/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"username\":\"$2\",\"password\":\"$PWD_DEMO\",\"role\":\"$3\"$4}" >/dev/null || true
}

login() { # $1=email -> access token
  curl -s -X POST "$API/api/v1/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PWD_DEMO\"}" | jqv ".accessToken"
}

echo "→ Création des comptes (Toulouse pour le freelance : la position est obligatoire, SH-34)"
register "$FREELANCE_EMAIL" "DemoPilote"    "FREELANCE" ',"location":{"latitude":43.6045,"longitude":1.4442}'
register "$RECRUITER_EMAIL" "DemoRecruteur" "RECRUITER" ''
register "$ADMIN_EMAIL"     "DemoAdmin"     "RECRUITER" ''

echo "→ Promotion du compte de validation en ADMIN (non auto-attribuable par l'API : anti-élévation de privilèges)"
docker exec -i "$PG" psql -U skillhunt -d skillhunt -q \
  -c "UPDATE users SET role = 'ADMIN' WHERE email = '$ADMIN_EMAIL';" >/dev/null

FREELANCE_TOKEN=$(login "$FREELANCE_EMAIL")
ADMIN_TOKEN=$(login "$ADMIN_EMAIL")
[ -n "$FREELANCE_TOKEN" ] || { echo "ÉCHEC : login freelance impossible"; exit 1; }
[ -n "$ADMIN_TOKEN" ]     || { echo "ÉCHEC : login admin impossible"; exit 1; }

add_gear() { # $1=category $2=brand $3=model $4=serial
  curl -s -X POST "$API/api/v1/gear" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $FREELANCE_TOKEN" \
    -d "{\"category\":\"$1\",\"brand\":\"$2\",\"model\":\"$3\",\"serialNumber\":\"$4\"}" >/dev/null || true
}

# Idempotence : le matériel n'est déclaré qu'une fois. Sans ce garde-fou, une relance
# du script empilerait des doublons dans le casier de démo.
GEAR_TOTAL=$(curl -s "$API/api/v1/gear/me?limit=1" -H "Authorization: Bearer $FREELANCE_TOKEN" | jqv ".total")
if [ "${GEAR_TOTAL:-0}" -gt 0 ] 2>/dev/null; then
  echo "→ Matériel déjà présent ($GEAR_TOTAL équipements) : déclaration ignorée"
else
  echo "→ Déclaration du matériel (catégorie DRONE : c'est elle qui alimente le score de matching)"
  add_gear DRONE      "DJI"      "Mavic 3 Enterprise" "SN-DEMO-0001"
  add_gear DRONE      "DJI"      "Matrice 350 RTK"    "SN-DEMO-0002"
  add_gear CAMERA_360 "Insta360" "Titan"              "SN-DEMO-0003"
fi

# Id du freelance de démo : la validation est filtrée dessus pour ne pas toucher
# au matériel en attente d'autres comptes présents dans la base.
FREELANCE_ID=$(docker exec -i "$PG" psql -U skillhunt -d skillhunt -t -A \
  -c "SELECT id FROM users WHERE email = '$FREELANCE_EMAIL';" | tr -d '\r')

echo "→ Validation admin du matériel du freelance de démo (PENDING → VALIDATED)"
PENDING_IDS=$(curl -s "$API/api/v1/gear/pending?limit=50" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | node -e "let d='';const f=process.argv[1];process.stdin.on('data',c=>d+=c).on('end',()=>{try{(JSON.parse(d).items||[]).filter(g=>g.freelanceId===f).forEach(g=>console.log(g.id))}catch(e){}})" "$FREELANCE_ID")
for id in $PENDING_IDS; do
  curl -s -X PATCH "$API/api/v1/gear/$id/review" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"decision":"VALIDATED"}' >/dev/null
done

echo
echo "✅ Jeu de démo prêt sur $API"
echo "   Freelance : $FREELANCE_EMAIL / $PWD_DEMO"
echo "   Recruteur : $RECRUITER_EMAIL / $PWD_DEMO"
echo "   Admin     : $ADMIN_EMAIL / $PWD_DEMO  (validation du matériel)"
