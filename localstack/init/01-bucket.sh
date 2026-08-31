#!/bin/sh
# SH-16a — Initialisation du bucket privé (exécuté par LocalStack à chaque démarrage,
# depuis /etc/localstack/init/ready.d/). Idempotent : rejouable sans effet de bord.
set -eu

BUCKET="${AWS_S3_BUCKET:-skillhunt-media}"
REGION="${AWS_DEFAULT_REGION:-eu-west-3}"
# Origines autorisées à déposer : celles de l'application (gateway, puis Vite en dev direct).
ORIGINS="${MEDIA_CORS_ORIGINS:-http://localhost:8088,http://localhost:5173}"

echo "[init] Bucket ${BUCKET} (region ${REGION})"

# `|| true` : le code de sortie est ignore sans condition, pas seulement pour le cas du
# bucket qui survit au redemarrage via le volume (re-creation qui echoue alors). Une
# mauvaise region ou un probleme d'authentification serait avale de la meme facon. Le
# script continue quand meme a echouer vite dans l'ensemble : les appels suivants,
# put-bucket-encryption et put-bucket-cors, ne sont pas gardes et tournent sous `set -eu`
# — ils avortent si le bucket n'existe pas reellement.
awslocal s3api create-bucket \
  --bucket "${BUCKET}" \
  --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null 2>&1 || true

# Chiffrement AES-256 PAR DÉFAUT du bucket (CLAUDE.md §8.6). C'est ce qui permet de ne
# PAS signer l'en-tête `x-amz-server-side-encryption` dans l'URL PUT : le navigateur n'a
# qu'un `Content-Type` à envoyer, et les objets sont chiffrés au repos malgré tout.
awslocal s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# CORS : sans cette configuration, le PUT direct depuis le navigateur est bloqué par le
# contrôle d'origine — l'upload échouerait alors que l'URL signée est parfaitement valide.
# Chaque origine est nettoyée avant guillemetage : espaces de bord retires (un espace
# apres la virgule est courant et ferait echouer la comparaison stricte avec l'en-tete
# Origin du navigateur) et guillemets doubles supprimes (empeche une origine malveillante
# de sortir du payload JSON).
ALLOWED=$(printf '%s' "${ORIGINS}" | awk -F, '{for(i=1;i<=NF;i++){gsub(/^[ \t]+|[ \t]+$/,"",$i); gsub(/"/,"",$i); printf "\"%s\"%s", $i, (i<NF?",":"")}}')
awslocal s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration "{
  \"CORSRules\": [{
    \"AllowedOrigins\": [${ALLOWED}],
    \"AllowedMethods\": [\"PUT\", \"GET\", \"HEAD\"],
    \"AllowedHeaders\": [\"*\"],
    \"ExposeHeaders\": [\"ETag\"],
    \"MaxAgeSeconds\": 3000
  }]
}"

echo "[init] Bucket ${BUCKET} pret (chiffrement par defaut + CORS)"
