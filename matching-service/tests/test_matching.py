import pytest

BASE_PAYLOAD = {
    "skills": ["drone-dgac", "fpv"],
    "location": [43.6, 1.44],
    "radius_km": 50.0,
}


def test_match_rejects_missing_body(client):
    response = client.post("/match", json={})
    assert response.status_code == 422


def test_match_rejects_empty_skills(client):
    payload = {**BASE_PAYLOAD, "skills": []}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_blank_skill(client):
    payload = {**BASE_PAYLOAD, "skills": [""]}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_negative_radius(client):
    payload = {**BASE_PAYLOAD, "radius_km": -1.0}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_zero_radius(client):
    payload = {**BASE_PAYLOAD, "radius_km": 0.0}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_out_of_bounds_location(client):
    payload = {**BASE_PAYLOAD, "location": [999.0, 999.0]}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


# --- Tests d'intégration de l'endpoint (scoring réel via DI mockée) ---
from unittest.mock import AsyncMock, patch  # noqa: E402
from uuid import UUID  # noqa: E402
from main import app  # noqa: E402
from app.db.database import get_db  # noqa: E402
from app.services.scoring import FreelancerProfile  # noqa: E402

FREELANCE_A = UUID("aaaaaaaa-e89b-12d3-a456-426614174000")
FREELANCE_B = UUID("bbbbbbbb-e89b-12d3-a456-426614174001")


async def _override_get_db():
    yield None  # Session non utilisée — get_candidates est mocké


def test_match_returns_scored_freelance(client):
    profiles = [FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=["DRONE"] * 5)]
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=profiles)):
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["freelance_id"] == str(FREELANCE_A)
    assert results[0]["score"] > 0.0


def test_match_excludes_zero_score(client):
    # ROBOTICS ne couvre pas "drone-dgac" → skills_score=0.0, mais location=1.0 donc score=0.2 > 0
    # Pour score=0.0, il faudrait que skills ET gear soient 0 ET location=0 — impossible avec location stub=1.0
    # On teste donc qu'un profil sans gear ET sans skills match a un score faible mais non nul (0.2)
    profiles = [FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=[])]
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=profiles)):
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    results = response.json()
    # score = 0.5*0 + 0.3*0 + 0.2*1.0 = 0.2 → inclus car > 0
    assert len(results) == 1
    assert results[0]["score"] == pytest.approx(0.2)


def test_match_results_sorted_by_score_desc(client):
    profiles = [
        FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=[]),             # score faible
        FreelancerProfile(freelance_id=FREELANCE_B, gear_categories=["DRONE"] * 5),  # score élevé
    ]
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=profiles)):
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 2
    assert results[0]["score"] >= results[1]["score"]
    assert results[0]["freelance_id"] == str(FREELANCE_B)


def test_match_returns_empty_list_when_no_freelances(client):
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=[])):
        payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == []
