# C2.2.2 — Moteur de scoring multicritères (Skills + Matériel + Localisation) (SH-12/SH-13)
from dataclasses import dataclass, field
from uuid import UUID
from app.models.schemas import MatchRequest

CATEGORY_SKILL_MAP: dict[str, set[str]] = {
    "DRONE": {"drone", "drone-dgac", "fpv", "pilote-drone", "telepilote", "uas"},
    "CAMERA_360": {"360", "camera-360", "operateur-360", "360-video", "vr"},
    "ROBOTICS": {"robotique", "robotics", "automation", "robot", "ros"},
    "SENSOR": {"capteur", "sensor", "iot", "telemetrie", "lidar"},
    "OTHER": set(),
}

# Poids du score composite (somme = 1.0)
_WEIGHTS = {"skills": 0.50, "gear": 0.30, "location": 0.20}
# Nombre d'items de matériel validé pour atteindre le score gear maximum
_GEAR_MAX_COUNT = 5


@dataclass
class FreelancerProfile:
    freelance_id: UUID
    gear_categories: list[str] = field(default_factory=list)
    distance_km: float = 0.0


def score_skills(required_skills: list[str], gear_categories: list[str]) -> float:
    """Recall : proportion des skills requis couverts par les catégories de matériel du freelance."""
    if not required_skills:
        return 1.0
    inferred: set[str] = set()
    for cat in gear_categories:
        inferred |= CATEGORY_SKILL_MAP.get(cat, set())
    required = {s.lower() for s in required_skills}
    matched = required & inferred
    return len(matched) / len(required)


def score_gear(gear_count: int) -> float:
    """Score normalisé du volume de matériel validé (plafonné à 1.0 pour _GEAR_MAX_COUNT items)."""
    return min(1.0, gear_count / _GEAR_MAX_COUNT)


def score_location(distance_km: float, radius_km: float) -> float:
    """Score de proximité (SH-13) : décroissance linéaire, 1.0 au point exact, ~0 au bord du rayon.

    La distance provient de PostGIS (ST_Distance) ; les candidats hors rayon sont déjà
    exclus par ST_DWithin côté requête. Le clamp `max(0, …)` est une défense.
    """
    return max(0.0, 1.0 - distance_km / radius_km)


def compute_composite_score(profile: FreelancerProfile, request: MatchRequest) -> float:
    """Score composite pondéré : 0.50 × skills + 0.30 × gear + 0.20 × location."""
    s = score_skills(request.skills, profile.gear_categories)
    g = score_gear(len(profile.gear_categories))
    loc = score_location(profile.distance_km, request.radius_km)
    return _WEIGHTS["skills"] * s + _WEIGHTS["gear"] * g + _WEIGHTS["location"] * loc
