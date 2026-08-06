"""Logs structurés JSON du matching-service (SH-29, C4.1.2).

Le JSON n'est pas un choix esthétique : Alloy expédie les lignes à Loki, et seul un
format structuré permet des requêtes LogQL sur `level`, `requestId` ou `service`. Du
texte libre ne se filtre qu'à la sous-chaîne — donc mal.

Les champs sont **alignés sur ceux du `backend-core`** (`service`, `requestId`, `level`,
`timestamp`, `msg`). Sans cet alignement, un même tableau de bord Grafana ne pourrait pas
interroger les deux services, et la corrélation inter-services serait perdue au moment
même où elle sert.
"""

import logging
import sys
from typing import Any

from pythonjsonlogger.json import JsonFormatter

from app.observability.request_id import request_id_ctx

#: Clés dont la valeur ne doit JAMAIS atteindre Loki (CLAUDE.md §8).
#: Le microservice ne manipule ni mot de passe ni jeton, mais il reçoit des critères de
#: recherche et des identifiants : la liste couvre ce qui pourrait transiter par erreur
#: dans un log de diagnostic, et sert de garde-fou pour les évolutions futures.
REDACTED_KEYS = frozenset(
    {
        "password",
        "token",
        "access_token",
        "refresh_token",
        "authorization",
        "cookie",
        "serial_number",
        "serialnumber",
        "two_factor_secret",
        "backup_codes",
    }
)

REDACTED_PLACEHOLDER = "[Redacted]"


class SkillHuntJsonFormatter(JsonFormatter):
    """Formateur JSON : injecte le contexte commun et expurge les champs sensibles."""

    def add_fields(
        self,
        log_record: dict[str, Any],
        record: logging.LogRecord,
        message_dict: dict[str, Any],
    ) -> None:
        super().add_fields(log_record, record, message_dict)

        log_record["service"] = "matching-service"
        log_record["level"] = record.levelname.lower()
        # Lu depuis la ContextVar : chaque ligne émise pendant le traitement d'une requête
        # porte automatiquement son identifiant, sans que le code appelant y pense.
        log_record["requestId"] = request_id_ctx.get()
        log_record.pop("taskName", None)  # bruit ajouté par asyncio, sans valeur ici

        for cle in list(log_record):
            if cle.lower() in REDACTED_KEYS:
                log_record[cle] = REDACTED_PLACEHOLDER


def configure_logging(level: str = "INFO") -> None:
    """Bascule la racine du logging en JSON sur stdout.

    Sur stdout et non dans un fichier : en conteneur, c'est le flux que Docker capture et
    qu'Alloy collecte. Écrire dans un fichier obligerait à monter un volume et à gérer une
    rotation — pour un résultat moins fiable (12-factor).

    Les loggers d'uvicorn sont rattachés à cette configuration : sans cela, ses journaux
    d'accès resteraient en texte libre au milieu de lignes JSON, et Loki ne saurait parser
    ni les uns ni les autres de façon homogène.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        SkillHuntJsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "message": "msg"},
        )
    )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    for nom in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        logger = logging.getLogger(nom)
        logger.handlers = []
        logger.propagate = True
