"""Tests d'instrumentation du matching-service (SH-29, C4.1.2)."""

import json
import logging
import uuid

import pytest

from app.observability.logging_config import (
    REDACTED_PLACEHOLDER,
    SkillHuntJsonFormatter,
    configure_logging,
)
from app.observability.request_id import (
    REQUEST_ID_HEADER,
    is_safe_request_id,
    request_id_ctx,
)


class TestRequestIdValidation:
    """La valeur est réémise en en-tête ET journalisée : l'accepter telle quelle
    permettrait d'injecter des retours chariot dans les logs, donc d'y forger de
    fausses lignes (C2.2.3). Mêmes règles que côté backend-core."""

    @pytest.mark.parametrize(
        "valeur",
        ["gateway-abc123", "a" * 128, "abc.def-ghi_jkl", str(uuid.uuid4())],
    )
    def test_accepte_les_identifiants_conformes(self, valeur):
        assert is_safe_request_id(valeur) is True

    @pytest.mark.parametrize(
        ("libelle", "valeur"),
        [
            ("injection de saut de ligne", "abc\r\nX-Injected: 1"),
            ("séquence ANSI", "abc\x1b[31mrouge"),
            ("trop court", "abc"),
            ("trop long", "a" * 129),
            ("caractères hors jeu autorisé", "abc/def;ghi"),
            ("vide", ""),
            ("absent", None),
        ],
    )
    def test_rejette_les_identifiants_hostiles(self, libelle, valeur):
        assert is_safe_request_id(valeur) is False, libelle


class TestCorrelationHttp:
    """Le scénario 3 du ticket : une recherche doit être traçable de bout en bout."""

    def test_reprend_l_identifiant_envoye_par_le_backend(self, client):
        envoye = "backend-core-abc123"

        response = client.get("/health", headers={REQUEST_ID_HEADER: envoye})

        assert response.headers[REQUEST_ID_HEADER] == envoye

    def test_genere_un_identifiant_quand_il_manque(self, client):
        response = client.get("/health")

        recu = response.headers[REQUEST_ID_HEADER]
        # UUID valide : lève ValueError si le format est incorrect.
        uuid.UUID(recu)

    def test_remplace_un_identifiant_hostile_par_un_identifiant_sain(self, client):
        response = client.get("/health", headers={REQUEST_ID_HEADER: "abc\r\nX-Injected: 1"})

        recu = response.headers[REQUEST_ID_HEADER]
        assert "\r" not in recu and "\n" not in recu
        uuid.UUID(recu)

    def test_emet_une_ligne_d_acces_portant_le_requestId(self, client, caplog):
        """Sans cette ligne, la corrélation existe dans l'en-tête HTTP mais dans AUCUN
        log : une requête LogQL sur l'identifiant ne ramènerait que le monolithe, et le
        scénario 3 du ticket serait infaisable. Le journal d'accès d'uvicorn ne peut pas
        servir — il est émis hors du contexte de la requête, avec `requestId: "-"`."""
        with caplog.at_level(logging.INFO, logger="skillhunt.access"):
            client.post(
                "/match",
                headers={REQUEST_ID_HEADER: "correlation-e2e-1"},
                json={"skills": ["drone"], "location": [43.6, 1.44], "radius_km": 50},
            )

        acces = [r for r in caplog.records if r.name == "skillhunt.access"]
        assert acces, "aucune ligne d'accès émise"
        assert acces[-1].path == "/match"
        assert acces[-1].method == "POST"
        assert hasattr(acces[-1], "durationMs")

    def test_n_emet_pas_de_ligne_d_acces_pour_les_sondes(self, client, caplog):
        """Les sondes battent toutes les quelques secondes : les journaliser noierait les
        lignes utiles et gonflerait le stockage Loki. Elles restent mesurées par Prometheus."""
        with caplog.at_level(logging.INFO, logger="skillhunt.access"):
            client.get("/health")
            client.get("/metrics")

        assert [r for r in caplog.records if r.name == "skillhunt.access"] == []

    def test_reinitialise_le_contexte_entre_deux_requetes(self, client):
        """Sans `reset`, l'identifiant d'une requête fuiterait sur la suivante servie par
        la même tâche — des logs faussement corrélés, pire que pas de corrélation."""
        client.get("/health", headers={REQUEST_ID_HEADER: "premiere-requete"})

        assert request_id_ctx.get() == "-"


class TestFormatageDesLogs:
    """Les champs doivent être ALIGNÉS sur ceux du backend-core : sans cet alignement,
    un même tableau de bord Grafana ne peut pas interroger les deux services."""

    def _formate(self, record_extra: dict) -> dict:
        formatter = SkillHuntJsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "message": "msg"},
        )
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname=__file__, lineno=1,
            msg="requête traitée", args=(), exc_info=None,
        )
        for cle, valeur in record_extra.items():
            setattr(record, cle, valeur)
        return json.loads(formatter.format(record))

    def test_porte_les_champs_communs(self):
        sortie = self._formate({})

        assert sortie["service"] == "matching-service"
        assert sortie["level"] == "info"
        assert sortie["msg"] == "requête traitée"
        assert "timestamp" in sortie
        assert "requestId" in sortie

    def test_injecte_l_identifiant_de_correlation_courant(self):
        jeton = request_id_ctx.set("correlation-xyz789")
        try:
            sortie = self._formate({})
            assert sortie["requestId"] == "correlation-xyz789"
        finally:
            request_id_ctx.reset(jeton)

    @pytest.mark.parametrize(
        ("champ", "secret"),
        [
            ("password", "MotDePasse!2026"),
            ("token", "jwt.token.ici"),
            ("authorization", "Bearer jwt.token.ici"),
            ("cookie", "refresh_token=rt_abcdef"),
            ("serial_number", "DJI-MAV3-000123"),
            ("two_factor_secret", "JBSWY3DPEHPK3PXP"),
        ],
    )
    def test_expurge_les_champs_sensibles(self, champ, secret):
        sortie = self._formate({champ: secret})

        assert secret not in json.dumps(sortie)
        # La CLÉ est conservée : savoir que le champ était présent aide au diagnostic,
        # sa valeur non.
        assert sortie[champ] == REDACTED_PLACEHOLDER

    def test_laisse_intactes_les_donnees_non_sensibles(self):
        sortie = self._formate({"radius_km": 42, "skills_count": 3})

        assert sortie["radius_km"] == 42
        assert sortie["skills_count"] == 3


class TestConfigurationDuLogging:
    def test_bascule_la_racine_en_json_sur_stdout(self):
        configure_logging("DEBUG")

        root = logging.getLogger()
        assert len(root.handlers) == 1
        assert isinstance(root.handlers[0].formatter, SkillHuntJsonFormatter)
        assert root.level == logging.DEBUG

    def test_rattache_les_loggers_uvicorn(self):
        """Sinon ses journaux d'accès resteraient en texte libre au milieu de lignes
        JSON, et Loki ne saurait parser l'ensemble de façon homogène."""
        configure_logging("INFO")

        for nom in ("uvicorn", "uvicorn.access", "uvicorn.error"):
            logger = logging.getLogger(nom)
            assert logger.handlers == []
            assert logger.propagate is True


class TestExpositionDesMetriques:
    def test_expose_les_metriques_au_format_prometheus(self, client):
        response = client.get("/metrics")

        assert response.status_code == 200
        assert "text/plain" in response.headers["content-type"]

    def test_expose_la_latence_et_le_volume(self, client):
        client.get("/health")  # génère au moins une mesure
        corps = client.get("/metrics").text

        assert "http_request_duration_seconds" in corps
        assert "http_requests_total" in corps

    def test_metriques_absentes_du_schema_openapi(self, client):
        """Inutile d'annoncer une surface qu'on prend soin de ne pas exposer."""
        schema = client.get("/openapi.json").json()

        assert "/metrics" not in schema["paths"]
