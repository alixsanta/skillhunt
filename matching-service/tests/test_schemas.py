# C2.2.2 — Harnais de tests unitaires (validation Pydantic, schémas métier)
import pytest
from uuid import UUID
from pydantic import ValidationError
from app.models.schemas import HealthResponse, MatchRequest, MatchResult


def test_health_response_valid():
    r = HealthResponse(status="ok", service="matching-service")
    assert r.status == "ok"
    assert r.service == "matching-service"


def test_match_request_valid():
    req = MatchRequest(
        freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
        skills=["drone-dgac", "fpv"],
        location=(43.6, 1.44),
        radius_km=50.0,
    )
    assert len(req.skills) == 2
    assert req.radius_km == 50.0


def test_match_request_rejects_empty_skills():
    with pytest.raises(ValidationError):
        MatchRequest(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            skills=[],
            location=(43.6, 1.44),
            radius_km=50.0,
        )


def test_match_request_rejects_blank_skill():
    with pytest.raises(ValidationError):
        MatchRequest(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            skills=[""],
            location=(43.6, 1.44),
            radius_km=50.0,
        )


def test_match_request_rejects_negative_radius():
    with pytest.raises(ValidationError):
        MatchRequest(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            skills=["fpv"],
            location=(43.6, 1.44),
            radius_km=-10.0,
        )


def test_match_request_rejects_zero_radius():
    with pytest.raises(ValidationError):
        MatchRequest(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            skills=["fpv"],
            location=(43.6, 1.44),
            radius_km=0.0,
        )


def test_match_request_rejects_invalid_latitude():
    with pytest.raises(ValidationError):
        MatchRequest(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            skills=["fpv"],
            location=(91.0, 1.44),
            radius_km=50.0,
        )


def test_match_request_rejects_invalid_longitude():
    with pytest.raises(ValidationError):
        MatchRequest(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            skills=["fpv"],
            location=(43.6, 181.0),
            radius_km=50.0,
        )


def test_match_result_valid():
    r = MatchResult(
        freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
        score=0.87,
        distance_km=12.5,
    )
    assert 0.0 <= r.score <= 1.0


def test_match_result_rejects_score_above_one():
    with pytest.raises(ValidationError):
        MatchResult(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            score=1.5,
            distance_km=0.0,
        )
