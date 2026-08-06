"""Corrélation des requêtes entre le monolithe et le microservice (SH-29, C4.1.2)."""

import re
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

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
        try:
            response = await call_next(request)
        finally:
            # Réinitialisation systématique : sans elle, une ContextVar laissée en place
            # ferait fuiter l'identifiant d'une requête sur la suivante servie par la
            # même tâche — des logs faussement corrélés, pire que pas de corrélation.
            request_id_ctx.reset(token)

        response.headers[REQUEST_ID_HEADER] = request_id
        return response
