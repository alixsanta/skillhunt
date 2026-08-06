"""Métriques Prometheus du matching-service (SH-29, sondes S2/S3 — C4.1.2)."""

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

#: Bornes de l'histogramme de latence, en secondes.
#: Calées sur le KPI du service (`/match` < 250 ms, cf. CLAUDE.md du microservice) et sur
#: le seuil d'alerte S2 (p95 > 500 ms). Sans borne proche de ces valeurs, le p95 calculé
#: par Prometheus serait interpolé dans un intervalle trop large pour déclencher l'alerte
#: au bon moment — un tableau de bord juste, une alerte en retard.
LATENCY_BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)


def setup_metrics(app: FastAPI) -> None:
    """Instrumente l'application et expose `/metrics`.

    ⚠️ `/metrics` reste joignable **uniquement sur le réseau Docker privé**. Le
    `matching-service` ne publie aucun port hôte (SH-2/SH-5 : la gateway est le point
    d'entrée unique et ne le relaie pas), donc l'endpoint n'est pas exposé publiquement —
    il divulguerait sinon la cartographie des routes et le volume de trafic.

    `should_group_status_codes=False` : on veut le statut exact (`503`), pas la famille
    (`5xx`). L'indicateur S3 se calcule très bien par expression PromQL, alors qu'un
    regroupement à la source détruit une information qu'on ne peut plus retrouver.
    """
    Instrumentator(
        should_group_status_codes=False,
        # Les sondes battent toutes les quelques secondes : les compter fausserait le
        # taux d'erreur et le volume de trafic réels.
        excluded_handlers=["/metrics", "/health", "/health/ready"],
        # Le gabarit de route (`/match`) et jamais l'URL brute : sinon un client peut
        # créer autant de séries qu'il envoie d'URLs distinctes, jusqu'à saturer la
        # mémoire du serveur de métriques (explosion de cardinalité).
        should_instrument_requests_inprogress=True,
        inprogress_labels=True,
    ).instrument(
        app,
        latency_lowr_buckets=LATENCY_BUCKETS,
    ).expose(
        app,
        endpoint="/metrics",
        include_in_schema=False,  # pas annoncé dans l'OpenAPI publié
    )
