# C2.2.2 — Harnais de tests unitaires du moteur de scoring multicritères (SH-12)
import pytest
from uuid import UUID
from app.models.schemas import MatchRequest
from app.services.scoring import (
    FreelancerProfile,
    CATEGORY_SKILL_MAP,
    score_skills,
    score_gear,
    score_location,
    compute_composite_score,
)

FREELANCE_ID = UUID("123e4567-e89b-12d3-a456-426614174000")


# --- CATEGORY_SKILL_MAP ---

def test_category_skill_map_covers_all_categories():
    expected = {"DRONE", "CAMERA_360", "ROBOTICS", "SENSOR", "OTHER"}
    assert set(CATEGORY_SKILL_MAP.keys()) == expected


def test_drone_category_contains_drone_skills():
    assert "drone-dgac" in CATEGORY_SKILL_MAP["DRONE"]
    assert "fpv" in CATEGORY_SKILL_MAP["DRONE"]


# --- score_skills ---

def test_score_skills_full_match():
    # Freelance avec DRONE → couvre "drone-dgac" et "fpv"
    result = score_skills(["drone-dgac", "fpv"], ["DRONE"])
    assert result == 1.0


def test_score_skills_partial_match():
    # "robotics" n'est pas couvert par DRONE seul
    result = score_skills(["drone-dgac", "robotics"], ["DRONE"])
    assert result == pytest.approx(0.5)


def test_score_skills_no_match():
    result = score_skills(["robotics"], ["DRONE"])
    assert result == 0.0


def test_score_skills_multiple_categories():
    result = score_skills(["drone-dgac", "robotics"], ["DRONE", "ROBOTICS"])
    assert result == 1.0


def test_score_skills_case_insensitive():
    result = score_skills(["DRONE-DGAC"], ["DRONE"])
    assert result == 1.0


# --- score_gear ---

def test_score_gear_zero_items():
    assert score_gear(0) == 0.0


def test_score_gear_five_items_is_max():
    assert score_gear(5) == 1.0


def test_score_gear_more_than_five_capped():
    assert score_gear(10) == 1.0


def test_score_gear_two_items():
    assert score_gear(2) == pytest.approx(0.4)


# --- score_location ---

def test_score_location_is_stub_returning_one():
    result = score_location(FREELANCE_ID, (43.6, 1.44), 50.0)
    assert result == 1.0


# --- compute_composite_score ---

def test_compute_composite_score_full_match():
    profile = FreelancerProfile(freelance_id=FREELANCE_ID, gear_categories=["DRONE", "DRONE", "DRONE", "DRONE", "DRONE"])
    request = MatchRequest(skills=["drone-dgac"], location=(43.6, 1.44), radius_km=50.0)
    score = compute_composite_score(profile, request)
    # skills=1.0 gear=1.0 location=1.0 → composite=1.0
    assert score == pytest.approx(1.0)


def test_compute_composite_score_no_gear():
    profile = FreelancerProfile(freelance_id=FREELANCE_ID, gear_categories=[])
    request = MatchRequest(skills=["drone-dgac"], location=(43.6, 1.44), radius_km=50.0)
    score = compute_composite_score(profile, request)
    # skills=0.0, gear=0.0, location=1.0 → 0.5*0 + 0.3*0 + 0.2*1 = 0.2
    assert score == pytest.approx(0.2)


def test_compute_composite_score_partial():
    profile = FreelancerProfile(freelance_id=FREELANCE_ID, gear_categories=["DRONE"])
    request = MatchRequest(skills=["drone-dgac", "robotics"], location=(43.6, 1.44), radius_km=50.0)
    score = compute_composite_score(profile, request)
    # skills=0.5, gear=min(1,1/5)=0.2, location=1.0
    # → 0.5*0.5 + 0.3*0.2 + 0.2*1.0 = 0.25 + 0.06 + 0.20 = 0.51
    assert score == pytest.approx(0.51)


def test_compute_composite_score_is_bounded():
    profile = FreelancerProfile(freelance_id=FREELANCE_ID, gear_categories=["DRONE"] * 10)
    request = MatchRequest(skills=["drone-dgac"], location=(43.6, 1.44), radius_km=50.0)
    score = compute_composite_score(profile, request)
    assert 0.0 <= score <= 1.0
