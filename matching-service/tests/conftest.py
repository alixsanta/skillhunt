import asyncio
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app


async def _mock_consume_loop(stop_event: asyncio.Event) -> None:
    """Consumer factice pour les tests unitaires (pas de Redis réel requis)."""
    await stop_event.wait()


@pytest.fixture
def client() -> TestClient:
    # C2.2.2 — isole le consumer pour que les tests matching ne nécessitent pas Redis
    with patch("main.consume_loop", new=_mock_consume_loop):
        with TestClient(app) as c:
            yield c
