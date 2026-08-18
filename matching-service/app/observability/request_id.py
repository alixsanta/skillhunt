"""Corrélation des requêtes entre le monolithe et le microservice (SH-29, C4.1.2)."""

import logging
import re
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("skillhunt.access")

#: Chemins exclus de la journalisation d'accès : les sondes battent toutes les quelques
#: secondes et noieraient les lignes utiles, pour un coût de stockage Loki inutile. Elles
#: restent MESURÉES par Prometheus — c'est la métrique qui porte la disponibilité.
_CHEMINS_SILENCIEUX = frozenset({"/metrics", "/health", "/health/ready"})

#: En-tête portant l'identifiant de corrélation — MÊME nom que côté backend-core.
REQUEST_ID_HEADER = "x-request-id"

#: Jeu de caractères accepté pour un identifiant venu du réseau.
#: Volontairement identique à la validation du monolithe : la valeur est réémise en
#: en-tête et journalisée, donc accepter une chaîne arbitraire permettrait d'injecter
#: des retours chariot dans les logs et d'y forger de fausses lignes (C2.2.3).
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,128}$")

#: Identifiant de la requête en cours, lisible depuis le formateur de logs.
#: Une ContextVar est le seul mécanisme correct ici : en asynchrone, plusieurs requêtes
#: partagent le même thread, donc une variable globale ou un thread-local mélangerait
#: les identifiants entre requêtes concurrentes.
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


def is_safe_request_id(value: str | None) -> bool:
    """Vrai si l'identifiant reçu est exploitable tel quel."""
    return bool(value) and bool(_SAFE_REQUEST_ID.match(value or ""))


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Reprend l'identifiant envoyé par le `backend-core`, ou en génère un.

    C'est la clé de jointure des deux journaux : le monolithe pose l'identifiant, son
    proxy de matching le relaie dans `X-Request-Id`, et ce middleware le réinjecte ici.
    Une seule requête LogQL sur cet identifiant reconstitue alors le trajet complet
    d'une recherche à travers les deux services — condition pour qu'une anomalie de
    matching soit reproductible, donc consignable au format attendu par C4.2.1.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get(REQUEST_ID_HEADER)
        request_id = incoming if is_safe_request_id(incoming) else str(uuid.uuid4())

        token = request_id_ctx.set(request_id)
        debut = time.perf_counter()
        try:
            response = await call_next(request)
            response.headers[REQUEST_ID_HEADER] = request_id

            # Ligne d'accès émise ICI, à l'intérieur du contexte de la requête.
            #
            # On ne peut PAS se reposer sur le journal d'accès d'uvicorn : il est produit
            # par sa couche protocole, en dehors de la pile de middlewares Starlette,
            # donc APRÈS le `reset` ci-dessous. Ses lignes portaient `requestId: "-"` —
            # la corrélation existait dans l'en-tête HTTP mais ne se retrouvait dans
            # AUCUNE ligne de log, ce qui rendait le scénario 3 du ticket infaisable :
            # une requête LogQL sur un identifiant ne ramenait que le monolithe.
            # Constaté en exécutant la stack (SH-29, chantier B).
            if request.url.path not in _CHEMINS_SILENCIEUX:
                logger.info(
                    "requête traitée",
                    extra={
                        "method": request.method,
                        "path": request.url.path,
                        "statusCode": response.status_code,
                        "durationMs": round((time.perf_counter() - debut) * 1000, 2),
                    },
                )
            return response
        finally:
            # Réinitialisation systématique : sans elle, une ContextVar laissée en place
            # ferait fuiter l'identifiant d'une requête sur la suivante servie par la
            # même tâche — des logs faussement corrélés, pire que pas de corrélation.
            request_id_ctx.reset(token)
